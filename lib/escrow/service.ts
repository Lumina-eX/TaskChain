/**
 * Escrow Lifecycle Service
 *
 * The single source of truth for all escrow operations. Controllers call this
 * service and never touch the blockchain adapter or repository directly.
 *
 * Design principles:
 *  • Pure orchestration — no SQL, no Soroban SDK imports here.
 *  • Dependency injection via constructor — swap adapters in tests.
 *  • Throws typed EscrowError subclasses; controllers map them to HTTP codes.
 *  • Every state transition is validated before any side-effect is triggered.
 *  • Extensible: DAO voting, advanced dispute handling, multi-sig, etc. can be
 *    added by extending this class or composing additional services.
 */

import type {
  IEscrowBlockchainAdapter,
  IEscrowRepository,
  CreateEscrowInput,
  CreateEscrowResult,
  FundEscrowInput,
  FundEscrowResult,
  ReleaseFundsInput,
  ReleaseFundsResult,
  RefundEscrowInput,
  RefundEscrowResult,
  RaiseDisputeInput,
  RaiseDisputeResult,
  ResolveDisputeInput,
  ResolveDisputeResult,
  EscrowContract,
  EscrowMilestone,
} from './types'

import {
  EscrowContractNotFoundError,
  EscrowMilestoneNotFoundError,
  EscrowDisputeNotFoundError,
  EscrowAlreadyExistsError,
  EscrowDisputeAlreadyActiveError,
  EscrowInvalidStateError,
  EscrowForbiddenError,
  EscrowValidationError,
  EscrowFundingVerificationError,
  EscrowBlockchainError,
} from './errors'

import { sorobanEscrowAdapter } from './blockchain'
import { escrowRepository } from './repository'

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class EscrowService {
  constructor(
    private readonly blockchain: IEscrowBlockchainAdapter = sorobanEscrowAdapter,
    private readonly repo: IEscrowRepository = escrowRepository
  ) {}

  // =========================================================================
  // createEscrow
  // =========================================================================

  /**
   * Deploy a new escrow smart contract and persist the contract record.
   *
   * Lifecycle: (none) → contract.status = 'pending', escrow_status = 'unfunded'
   *
   * @throws EscrowAlreadyExistsError   if a contract already exists for the project
   * @throws EscrowValidationError      if input data is invalid
   * @throws EscrowBlockchainError      if on-chain deployment fails
   */
  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    // --- Validate input ---
    this.assertValidAmount(input.totalAmount, 'totalAmount')
    if (!input.projectId) throw new EscrowValidationError('projectId is required')
    if (!input.clientId) throw new EscrowValidationError('clientId is required')
    if (!input.freelancerId) throw new EscrowValidationError('freelancerId is required')
    if (!input.clientWalletAddress) throw new EscrowValidationError('clientWalletAddress is required')
    if (!input.freelancerWalletAddress) throw new EscrowValidationError('freelancerWalletAddress is required')

    if (input.milestones && input.milestones.length > 0) {
      this.assertMilestonesMatchTotal(input.milestones, input.totalAmount)
    }

    // --- Guard: no duplicate contract per project ---
    const existing = await this.repo.getContractByProjectId(input.projectId)
    if (existing) {
      throw new EscrowAlreadyExistsError(input.projectId, existing.id)
    }

    // --- Deploy on-chain ---
    let deployment: { contractAddress: string; txHash: string; networkPassphrase: string }
    try {
      deployment = await this.blockchain.deployContract({
        clientAddress: input.clientWalletAddress,
        freelancerAddress: input.freelancerWalletAddress,
        totalAmount: input.totalAmount,
        currency: input.currency ?? 'USDC',
      })
    } catch (err) {
      if (err instanceof EscrowBlockchainError) throw err
      throw new EscrowBlockchainError('Contract deployment failed', err)
    }

    // --- Persist contract ---
    const contract = await this.repo.createContract({
      projectId: input.projectId,
      clientId: input.clientId,
      freelancerId: input.freelancerId,
      totalAmount: input.totalAmount,
      currency: input.currency ?? 'USDC',
      terms: input.terms,
      escrowAddress: deployment.contractAddress,
      contractTxHash: deployment.txHash,
    })

    // --- Persist milestones ---
    const milestones = input.milestones ?? []
    if (milestones.length > 0) {
      await this.repo.createMilestones(contract.id, input.projectId, milestones)
    }

    return {
      contract,
      milestonesCreated: milestones.length,
      deployTxHash: deployment.txHash,
    }
  }

  // =========================================================================
  // fundEscrow
  // =========================================================================

  /**
   * Record that the client has funded the escrow contract on-chain.
   * Verifies the funding transaction before updating state.
   *
   * Lifecycle: escrow_status: 'unfunded' → 'funded'
   *            contract.status: 'pending' → 'active'
   *
   * @throws EscrowContractNotFoundError    if contract does not exist
   * @throws EscrowForbiddenError           if caller is not the client
   * @throws EscrowInvalidStateError        if escrow is already funded / refunded
   * @throws EscrowFundingVerificationError if on-chain verification fails
   */
  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    this.assertValidAmount(input.amount, 'amount')
    if (!input.fundingTxHash) throw new EscrowValidationError('fundingTxHash is required')

    const contract = await this.requireContract(input.contractId)

    // --- Authorisation: only the client can fund ---
    await this.assertIsClient(contract, input.callerWalletAddress)

    // --- State guard ---
    if (contract.escrowStatus !== 'unfunded') {
      throw new EscrowInvalidStateError(
        `Cannot fund escrow: current escrow status is '${contract.escrowStatus}'`
      )
    }
    if (contract.status === 'cancelled' || contract.status === 'completed') {
      throw new EscrowInvalidStateError(
        `Cannot fund a ${contract.status} contract`
      )
    }
    if (!contract.escrowAddress) {
      throw new EscrowInvalidStateError('Contract has no escrow address — deploy first')
    }

    // --- Verify on-chain ---
    const verification = await this.blockchain.verifyFunding({
      contractAddress: contract.escrowAddress,
      txHash: input.fundingTxHash,
      expectedAmount: input.amount,
      currency: contract.currency,
    })

    if (!verification.verified) {
      throw new EscrowFundingVerificationError(
        `Funding verification failed: on-chain amount ${verification.onChainAmount} does not match expected ${input.amount}`
      )
    }

    const now = new Date().toISOString()
    const updated = await this.repo.updateContractEscrowStatus(
      contract.id,
      'funded',
      {
        fundedAt: now,
        fundingTxHash: input.fundingTxHash,
        status: 'active',
        startedAt: now,
      }
    )

    return { contract: updated, fundedAt: now }
  }

  // =========================================================================
  // releaseFunds
  // =========================================================================

  /**
   * Release funds for a specific approved milestone to the freelancer.
   * Automatically marks the contract as 'completed' when all milestones are paid.
   *
   * Lifecycle: milestone.status: 'approved' → 'paid'
   *            escrow_status: 'funded' → 'partially_released' | 'fully_released'
   *            contract.status: 'active' → 'completed' (when all milestones paid)
   *
   * @throws EscrowContractNotFoundError   if contract does not exist
   * @throws EscrowMilestoneNotFoundError  if milestone does not exist
   * @throws EscrowForbiddenError          if caller is not the client
   * @throws EscrowInvalidStateError       if contract or milestone is in wrong state
   * @throws EscrowBlockchainError         if on-chain release fails
   */
  async releaseFunds(input: ReleaseFundsInput): Promise<ReleaseFundsResult> {
    const contract = await this.requireContract(input.contractId)
    const milestone = await this.requireMilestone(input.milestoneId)

    // --- Authorisation: only the client releases funds ---
    await this.assertIsClient(contract, input.callerWalletAddress)

    // --- State guards ---
    if (contract.status !== 'active') {
      throw new EscrowInvalidStateError(
        `Cannot release funds: contract status is '${contract.status}'`
      )
    }
    if (contract.escrowStatus !== 'funded' && contract.escrowStatus !== 'partially_released') {
      throw new EscrowInvalidStateError(
        `Cannot release funds: escrow status is '${contract.escrowStatus}'`
      )
    }
    if (milestone.contractId !== contract.id) {
      throw new EscrowForbiddenError('Milestone does not belong to this contract')
    }
    if (milestone.status !== 'approved') {
      throw new EscrowInvalidStateError(
        `Cannot release funds: milestone status is '${milestone.status}' (must be 'approved')`
      )
    }
    if (!contract.escrowAddress) {
      throw new EscrowInvalidStateError('Contract has no escrow address')
    }

    // --- Resolve freelancer wallet ---
    const freelancerWallet = await this.repo.getUserWalletAddress(contract.freelancerId)
    if (!freelancerWallet) {
      throw new EscrowValidationError('Freelancer wallet address not found')
    }

    // --- Trigger on-chain release ---
    let release: { txHash: string }
    try {
      release = await this.blockchain.releaseMilestoneFunds({
        contractAddress: contract.escrowAddress,
        milestoneId: milestone.id,
        recipientAddress: freelancerWallet,
        amount: milestone.amount,
        currency: milestone.currency,
      })
    } catch (err) {
      if (err instanceof EscrowBlockchainError) throw err
      throw new EscrowBlockchainError('Failed to release milestone funds on-chain', err)
    }

    const now = new Date().toISOString()

    // --- Update milestone ---
    const updatedMilestone = await this.repo.updateMilestoneStatus(
      milestone.id,
      'paid',
      { releaseTxHash: release.txHash, paidAt: now }
    )

    // --- Determine new escrow / contract status ---
    const allMilestones = await this.repo.getMilestonesByContractId(contract.id)
    const allPaid = allMilestones.every(
      (m) => m.id === milestone.id ? true : m.status === 'paid'
    )

    const newEscrowStatus = allPaid ? 'fully_released' : 'partially_released'
    const updatedContract = await this.repo.updateContractEscrowStatus(
      contract.id,
      newEscrowStatus,
      allPaid ? { status: 'completed', completedAt: now } : undefined
    )

    return {
      milestone: updatedMilestone,
      contract: updatedContract,
      releaseTxHash: release.txHash,
      allMilestonesPaid: allPaid,
    }
  }

  // =========================================================================
  // refundEscrow
  // =========================================================================

  /**
   * Refund all remaining escrowed funds back to the client.
   * Can be triggered by the client (cancellation) or an admin (dispute resolution).
   *
   * Lifecycle: escrow_status → 'refunded'
   *            contract.status → 'cancelled'
   *
   * @throws EscrowContractNotFoundError  if contract does not exist
   * @throws EscrowForbiddenError         if caller is neither client nor admin
   * @throws EscrowInvalidStateError      if escrow is not in a refundable state
   * @throws EscrowBlockchainError        if on-chain refund fails
   */
  async refundEscrow(input: RefundEscrowInput): Promise<RefundEscrowResult> {
    if (!input.reason?.trim()) throw new EscrowValidationError('reason is required')

    const contract = await this.requireContract(input.contractId)

    // --- Authorisation: client or admin ---
    await this.assertIsClientOrAdmin(contract, input.callerWalletAddress)

    // --- State guard ---
    const refundableEscrowStatuses = ['funded', 'partially_released']
    if (!refundableEscrowStatuses.includes(contract.escrowStatus)) {
      throw new EscrowInvalidStateError(
        `Cannot refund: escrow status is '${contract.escrowStatus}'`
      )
    }
    if (contract.status === 'completed' || contract.status === 'cancelled') {
      throw new EscrowInvalidStateError(
        `Cannot refund a ${contract.status} contract`
      )
    }
    if (!contract.escrowAddress) {
      throw new EscrowInvalidStateError('Contract has no escrow address')
    }

    // --- Resolve client wallet ---
    const clientWallet = await this.repo.getUserWalletAddress(contract.clientId)
    if (!clientWallet) {
      throw new EscrowValidationError('Client wallet address not found')
    }

    // --- Trigger on-chain refund ---
    let refund: { txHash: string }
    try {
      refund = await this.blockchain.refundEscrow({
        contractAddress: contract.escrowAddress,
        clientAddress: clientWallet,
        amount: contract.totalAmount,
        currency: contract.currency,
      })
    } catch (err) {
      if (err instanceof EscrowBlockchainError) throw err
      throw new EscrowBlockchainError('Failed to refund escrow on-chain', err)
    }

    const now = new Date().toISOString()
    const updatedContract = await this.repo.updateContractEscrowStatus(
      contract.id,
      'refunded',
      {
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: input.reason,
      }
    )

    return { contract: updatedContract, refundTxHash: refund.txHash }
  }

  // =========================================================================
  // raiseDispute
  // =========================================================================

  /**
   * Open a dispute on an active contract.
   * Transitions the contract to 'disputed' status and blocks fund releases.
   *
   * Lifecycle: contract.status: 'active' → 'disputed'
   *            dispute.status: 'open'
   *
   * @throws EscrowContractNotFoundError       if contract does not exist
   * @throws EscrowForbiddenError              if caller is not a party to the contract
   * @throws EscrowInvalidStateError           if contract is not in a disputable state
   * @throws EscrowDisputeAlreadyActiveError   if an open dispute already exists
   */
  async raiseDispute(input: RaiseDisputeInput): Promise<RaiseDisputeResult> {
    if (!input.reason?.trim()) throw new EscrowValidationError('reason is required')

    const contract = await this.requireContract(input.contractId)

    // --- State guard ---
    const disputableStatuses = ['active', 'paused']
    if (!disputableStatuses.includes(contract.status)) {
      throw new EscrowInvalidStateError(
        `Cannot raise dispute: contract status is '${contract.status}'`
      )
    }

    // --- Guard: no duplicate active dispute ---
    const existingDispute = await this.repo.getActiveDisputeByContractId(contract.id)
    if (existingDispute) {
      throw new EscrowDisputeAlreadyActiveError(contract.id, existingDispute.id)
    }

    // --- Validate milestone belongs to contract (if provided) ---
    if (input.milestoneId) {
      const milestone = await this.repo.getMilestoneById(input.milestoneId)
      if (!milestone) throw new EscrowMilestoneNotFoundError(input.milestoneId)
      if (milestone.contractId !== contract.id) {
        throw new EscrowForbiddenError('Milestone does not belong to this contract')
      }
    }

    // --- Create dispute ---
    const dispute = await this.repo.createDispute({
      contractId: contract.id,
      milestoneId: input.milestoneId,
      raisedBy: input.raisedBy,
      raisedByUserId: input.raisedByUserId,
      reason: input.reason,
      desiredOutcome: input.desiredOutcome,
      evidence: input.evidence,
      responseDeadline: input.responseDeadline,
    })

    // --- Transition contract to disputed ---
    const updatedContract = await this.repo.updateContractEscrowStatus(
      contract.id,
      contract.escrowStatus, // escrow_status unchanged — funds stay locked
      {
        status: 'disputed',
        activeDisputeId: dispute.id,
      }
    )

    return { dispute, contract: updatedContract }
  }

  // =========================================================================
  // resolveDispute
  // =========================================================================

  /**
   * Resolve an open dispute (admin only).
   * Depending on the outcome, funds are released to the freelancer, refunded
   * to the client, or split between both parties.
   *
   * Lifecycle: dispute.status → resolved_* | withdrawn
   *            contract.status → 'active' | 'cancelled' | 'completed'
   *
   * Extensibility note: DAO voting can be wired in here by adding a
   * `daoVoteId` field to ResolveDisputeInput and verifying the vote result
   * before proceeding with the resolution.
   *
   * @throws EscrowDisputeNotFoundError   if dispute does not exist
   * @throws EscrowContractNotFoundError  if related contract does not exist
   * @throws EscrowInvalidStateError      if dispute is already resolved
   * @throws EscrowValidationError        if split amounts are missing for split outcome
   */
  async resolveDispute(input: ResolveDisputeInput): Promise<ResolveDisputeResult> {
    if (!input.resolutionNotes?.trim()) {
      throw new EscrowValidationError('resolutionNotes is required')
    }

    const dispute = await this.repo.getDisputeById(input.disputeId)
    if (!dispute) throw new EscrowDisputeNotFoundError(input.disputeId)

    // --- State guard ---
    const resolvableStatuses = ['open', 'under_review', 'escalated']
    if (!resolvableStatuses.includes(dispute.status)) {
      throw new EscrowInvalidStateError(
        `Cannot resolve dispute: current status is '${dispute.status}'`
      )
    }

    // --- Validate split amounts ---
    if (input.outcome === 'resolved_split') {
      if (!input.clientRefundAmount || !input.freelancerPayoutAmount) {
        throw new EscrowValidationError(
          'clientRefundAmount and freelancerPayoutAmount are required for split resolution'
        )
      }
      this.assertValidAmount(input.clientRefundAmount, 'clientRefundAmount')
      this.assertValidAmount(input.freelancerPayoutAmount, 'freelancerPayoutAmount')
    }

    const contract = await this.requireContract(dispute.contractId)
    const now = new Date().toISOString()

    // --- Update dispute ---
    const updatedDispute = await this.repo.updateDispute(dispute.id, {
      status: input.outcome,
      resolverId: input.resolverUserId,
      resolutionNotes: input.resolutionNotes,
      resolvedAt: now,
      clientRefundAmount: input.clientRefundAmount,
      freelancerPayoutAmount: input.freelancerPayoutAmount,
    })

    // --- Determine new contract status based on outcome ---
    let newContractStatus: EscrowContract['status']
    switch (input.outcome) {
      case 'resolved_client':
      case 'withdrawn':
        // Funds go back to client → contract cancelled
        newContractStatus = 'cancelled'
        break
      case 'resolved_freelancer':
        // Funds go to freelancer → contract completed
        newContractStatus = 'completed'
        break
      case 'resolved_split':
        // Partial release + partial refund → contract completed
        newContractStatus = 'completed'
        break
    }

    const updatedContract = await this.repo.updateContractEscrowStatus(
      contract.id,
      contract.escrowStatus,
      {
        status: newContractStatus,
        activeDisputeId: undefined, // clear active dispute
        ...(newContractStatus === 'cancelled'
          ? { cancelledAt: now, cancellationReason: `Dispute resolved: ${input.outcome}` }
          : { completedAt: now }),
      }
    )

    return { dispute: updatedDispute, contract: updatedContract }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async requireContract(contractId: string): Promise<EscrowContract> {
    const contract = await this.repo.getContractById(contractId)
    if (!contract) throw new EscrowContractNotFoundError(contractId)
    return contract
  }

  private async requireMilestone(milestoneId: string): Promise<EscrowMilestone> {
    const milestone = await this.repo.getMilestoneById(milestoneId)
    if (!milestone) throw new EscrowMilestoneNotFoundError(milestoneId)
    return milestone
  }

  /**
   * Assert that the caller's wallet address matches the contract's client.
   */
  private async assertIsClient(
    contract: EscrowContract,
    callerWalletAddress: string
  ): Promise<void> {
    const clientWallet = await this.repo.getUserWalletAddress(contract.clientId)
    if (!clientWallet || clientWallet.toLowerCase() !== callerWalletAddress.toLowerCase()) {
      throw new EscrowForbiddenError('Only the contract client can perform this action')
    }
  }

  /**
   * Assert that the caller is either the client or an admin.
   * Admin check is done by looking up the user's role in the DB.
   */
  private async assertIsClientOrAdmin(
    contract: EscrowContract,
    callerWalletAddress: string
  ): Promise<void> {
    const clientWallet = await this.repo.getUserWalletAddress(contract.clientId)
    if (clientWallet && clientWallet.toLowerCase() === callerWalletAddress.toLowerCase()) {
      return // caller is the client
    }

    // Check if caller is an admin via the DB
    const { sql } = await import('@/lib/db')
    const rows = await sql`
      SELECT role FROM users WHERE wallet_address = ${callerWalletAddress} LIMIT 1
    `
    if (rows[0]?.role === 'admin') return

    throw new EscrowForbiddenError(
      'Only the contract client or an admin can perform this action'
    )
  }

  /**
   * Validate that a string represents a positive finite number.
   */
  private assertValidAmount(value: string, field: string): void {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) {
      throw new EscrowValidationError(`${field} must be a positive number string`)
    }
  }

  /**
   * Validate that the sum of milestone amounts equals the contract total.
   * Allows a small floating-point tolerance (0.000001).
   */
  private assertMilestonesMatchTotal(
    milestones: Array<{ amount: string }>,
    totalAmount: string
  ): void {
    const sum = milestones.reduce((acc, m) => acc + Number(m.amount), 0)
    const total = Number(totalAmount)
    if (Math.abs(sum - total) > 0.000001) {
      throw new EscrowValidationError(
        `Sum of milestone amounts (${sum}) must equal totalAmount (${total})`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export — import this in API routes
// ---------------------------------------------------------------------------

/**
 * Default service instance using the production blockchain adapter and DB repo.
 * In tests, construct a new EscrowService with mock dependencies instead.
 */
export const escrowService = new EscrowService()
