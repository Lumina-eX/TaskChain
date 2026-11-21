/**
 * Dispute Resolution Workflow — Service
 *
 * Orchestrates the dispute lifecycle:
 *   create → evidence → resolve (on-chain) → confirm/fail with retry support.
 *
 * Invariants enforced here:
 *   • Actors are resolved from the authenticated wallet only.
 *   • Contract/dispute state is loaded from the database, never trusted from
 *     the request body.
 *   • A dispute is never marked resolved until the blockchain transaction has
 *     been verified; `pending` and `failed` attempts are stored separately.
 *   • Every lifecycle event is appended to the immutable audit trail.
 *   • Duplicate requests replay deterministically via idempotency keys, and
 *     concurrent resolutions are rejected by the repository's unique indexes.
 */

import { createHash } from 'crypto'

import {
  DisputeConflictError,
  DisputeError,
  DisputeIneligibleError,
  DisputeNotFoundError,
  DisputeValidationError,
  type ActiveDisputeStatus,
  type ContractRecord,
  type CreateDisputeInput,
  type CreateDisputeResult,
  type DisputeActor,
  type DisputeAuditAction,
  type DisputeOutcome,
  type DisputeRecord,
  type EvidenceRecord,
  type EvidenceReferenceInput,
  type GetDisputeResult,
  type ResolutionAttemptRecord,
  type ResolutionState,
  type ResolveDisputeInput,
  type ResolveDisputeResult,
  type SubmitEvidenceInput,
  type SubmitEvidenceResult,
} from './types'
import {
  ACTIVE_DISPUTE_STATUSES,
} from './types'
import {
  assertCanCreateDispute,
  assertCanResolveDispute,
  assertCanSubmitEvidence,
  assertCanViewDispute,
  assertOutcomeSupportedOnChain,
} from './authorization'
import { assertSplitAmounts } from './validation'
import { disputeRepository, type DisputeRepository } from './repository'
import {
  sorobanDisputeChainGateway,
  type ChainResolutionSubmission,
  type DisputeChainGateway,
} from './blockchain'

const CONTRACT_OUTCOME_STATUS: Record<DisputeOutcome, ContractRecord['status']> = {
  resolved_client: 'cancelled',
  resolved_freelancer: 'completed',
  resolved_split: 'completed',
  withdrawn: 'active',
}

/** Escrow contract statuses that prove funds are actually locked. */
const DISPUTABLE_ESCROW_STATUSES = ['funded', 'partially_released']

/** Milestone states the escrow contract allows a dispute to be raised from. */
const DISPUTABLE_MILESTONE_STATUSES = ['submitted', 'approved', 'expired', 'extended']

export function evidenceFingerprint(reference: EvidenceReferenceInput): string {
  return createHash('sha256')
    .update(`${reference.type}|${reference.url}|${reference.label ?? ''}`)
    .digest('hex')
}

function isActiveStatus(status: string): status is ActiveDisputeStatus {
  return (ACTIVE_DISPUTE_STATUSES as readonly string[]).includes(status)
}

export class DisputeWorkflowService {
  constructor(
    private readonly repo: DisputeRepository = disputeRepository,
    private readonly chain: DisputeChainGateway = sorobanDisputeChainGateway
  ) {}

  // =========================================================================
  // POST /api/contracts/:id/disputes
  // =========================================================================

  async createDispute(input: CreateDisputeInput): Promise<CreateDisputeResult> {
    this.assertStorageAvailable()

    const contract = await this.requireContract(input.contractId)
    const actor = await this.requireActor(input.actorWalletAddress)

    // Replay of an identical request must return the original dispute.
    const replay = await this.repo.getDisputeByCreationKey(
      contract.id,
      input.idempotencyKey
    )
    if (replay) {
      return { dispute: replay, contractStatus: contract.status, replayed: true }
    }

    try {
      assertCanCreateDispute(actor, contract)
    } catch (err) {
      await this.safeAudit({
        disputeId: contract.activeDisputeId,
        contractId: contract.id,
        actorUserId: actor.userId,
        actorWallet: actor.walletAddress,
        action: 'authorization_denied',
        metadata: { operation: 'dispute_creation' },
      })
      throw err
    }

    // Duplicate detection comes first: a contract in 'disputed' state is
    // expected to have an active dispute, and callers need the existing id.
    const activeDispute = await this.repo.getActiveDisputeForContract(contract.id)
    if (activeDispute) {
      throw new DisputeConflictError(
        'This contract already has an active dispute',
        'DISPUTE_ALREADY_EXISTS',
        { existingDisputeId: activeDispute.id }
      )
    }

    if (contract.status !== 'active' && contract.status !== 'paused') {
      throw new DisputeIneligibleError(
        `A dispute cannot be opened while the contract status is '${contract.status}'`,
        { contractStatus: contract.status }
      )
    }
    if (!DISPUTABLE_ESCROW_STATUSES.includes(contract.escrowStatus)) {
      throw new DisputeIneligibleError(
        `A dispute requires funded escrow (current escrow status: '${contract.escrowStatus}')`,
        { escrowStatus: contract.escrowStatus }
      )
    }

    if (input.milestoneId) {
      const milestone = await this.repo.getMilestone(input.milestoneId)
      if (!milestone) throw new DisputeNotFoundError('milestone', input.milestoneId)
      if (milestone.contractId && milestone.contractId !== contract.id) {
        throw new DisputeValidationError('milestoneId does not belong to this contract')
      }
      if (!DISPUTABLE_MILESTONE_STATUSES.includes(milestone.status)) {
        throw new DisputeIneligibleError(
          `The milestone cannot be disputed from status '${milestone.status}'`,
          { milestoneStatus: milestone.status }
        )
      }
    } else if (contract.escrowAddress) {
      // The escrow contract resolves disputes per milestone; without one there
      // is nothing the arbiter can settle on-chain.
      throw new DisputeValidationError(
        'milestoneId is required to dispute an on-chain escrowed contract'
      )
    }

    const evidencePayload = (input.evidence ?? []).map((reference) => ({
      type: reference.type,
      url: reference.url,
      label: reference.label ?? null,
      hash: evidenceFingerprint(reference),
    }))

    const created = await this.repo.createDisputeAtomic({
      contractId: contract.id,
      milestoneId: input.milestoneId ?? null,
      raisedBy:
        actor.userId === contract.clientId
          ? 'client'
          : actor.userId === contract.freelancerId
            ? 'freelancer'
            : 'admin',
      raisedByUserId: actor.userId,
      reason: input.reason,
      desiredOutcome: input.desiredOutcome ?? null,
      idempotencyKey: input.idempotencyKey,
      evidence: evidencePayload,
      actorWallet: actor.walletAddress,
    })

    if (!created) {
      // Lost a race against a concurrent creation (or the contract changed).
      const raced = await this.repo.getActiveDisputeForContract(contract.id)
      if (raced) {
        throw new DisputeConflictError(
          'This contract already has an active dispute',
          'DISPUTE_ALREADY_EXISTS',
          { existingDisputeId: raced.id }
        )
      }
      throw new DisputeIneligibleError(
        'The contract is no longer eligible for a dispute'
      )
    }

    return {
      dispute: created.dispute,
      contractStatus: created.contractStatus,
      replayed: false,
    }
  }

  // =========================================================================
  // POST /api/disputes/:id/evidence
  // =========================================================================

  async submitEvidence(input: SubmitEvidenceInput): Promise<SubmitEvidenceResult> {
    this.assertStorageAvailable()

    const dispute = await this.requireDispute(input.disputeId)
    const contract = await this.requireContract(dispute.contractId)
    const actor = await this.requireActor(input.actorWalletAddress)

    try {
      assertCanSubmitEvidence(actor, contract)
    } catch (err) {
      await this.safeAudit({
        disputeId: dispute.id,
        contractId: contract.id,
        actorUserId: actor.userId,
        actorWallet: actor.walletAddress,
        action: 'authorization_denied',
        metadata: { operation: 'evidence_submission' },
      })
      throw err
    }

    if (!isActiveStatus(dispute.status)) {
      throw new DisputeConflictError(
        'Evidence can no longer be submitted to a closed dispute',
        'DISPUTE_CLOSED'
      )
    }

    const inserted: EvidenceRecord[] = []
    const duplicates: string[] = []

    for (const reference of input.references) {
      const contentHash = evidenceFingerprint(reference)
      const existing = await this.repo.getEvidenceByHash(dispute.id, contentHash)
      if (existing) {
        duplicates.push(reference.url)
        continue
      }

      const record = await this.repo.insertEvidence({
        disputeId: dispute.id,
        milestoneId: dispute.milestoneId,
        submittedByUserId: actor.userId,
        evidenceType: reference.type,
        referenceUrl: reference.url,
        label: reference.label ?? null,
        description: reference.description ?? input.description ?? null,
        contentHash,
        actorWallet: actor.walletAddress,
        contractId: contract.id,
      })

      if (record) inserted.push(record)
      else duplicates.push(reference.url)
    }

    return { evidence: inserted, duplicates }
  }

  // =========================================================================
  // GET /api/disputes/:id
  // =========================================================================

  async getDispute(disputeId: string, actorWalletAddress: string): Promise<GetDisputeResult> {
    this.assertStorageAvailable()

    const dispute = await this.requireDispute(disputeId)
    const contract = await this.requireContract(dispute.contractId)
    const actor = await this.requireActor(actorWalletAddress)

    assertCanViewDispute(actor, contract, dispute)

    const [evidence, attempts, auditTrail] = await Promise.all([
      this.repo.listEvidence(dispute.id),
      this.repo.listAttempts(dispute.id),
      this.repo.listAudit(dispute.id, 100),
    ])

    return {
      dispute,
      evidence,
      resolutionAttempt: attempts[0] ?? null,
      attempts,
      auditTrail,
    }
  }

  // =========================================================================
  // POST /api/disputes/:id/resolve
  // =========================================================================

  async resolveDispute(input: ResolveDisputeInput): Promise<ResolveDisputeResult> {
    this.assertStorageAvailable()

    const dispute = await this.requireDispute(input.disputeId)
    const contract = await this.requireContract(dispute.contractId)
    const actor = await this.requireActor(input.actorWalletAddress)

    try {
      assertCanResolveDispute(actor, contract)
    } catch (err) {
      await this.safeAudit({
        disputeId: dispute.id,
        contractId: contract.id,
        actorUserId: actor.userId,
        actorWallet: actor.walletAddress,
        action: 'authorization_denied',
        metadata: { operation: 'dispute_resolution' },
      })
      throw err
    }

    // --- Idempotent replay of a previous attempt -------------------------
    const existingAttempt = await this.repo.getAttemptByKey(
      dispute.id,
      input.idempotencyKey
    )
    if (existingAttempt) {
      this.assertSameResolutionPayload(existingAttempt, input)
      if (existingAttempt.status === 'confirmed') {
        return {
          state: 'confirmed',
          dispute,
          attempt: existingAttempt,
          contractStatus: contract.status,
          replayed: true,
          retryable: false,
        }
      }
      if (existingAttempt.status === 'pending') {
        return {
          state: 'pending',
          dispute,
          attempt: existingAttempt,
          contractStatus: contract.status,
          replayed: true,
          retryable: true,
        }
      }
      // A failed attempt replayed with the same key is a retry.
      return this.retryAttempt(existingAttempt, dispute, contract, actor)
    }

    // --- A dispute can only be resolved once -----------------------------
    if (!isActiveStatus(dispute.status)) {
      throw new DisputeConflictError(
        'This dispute has already been resolved',
        'RESOLUTION_ALREADY_FINALISED',
        { disputeStatus: dispute.status, resolvedAt: dispute.resolvedAt }
      )
    }

    // --- Explicit retry of a specific failed attempt ---------------------
    if (input.retryAttemptId) {
      const target = await this.repo.getAttempt(input.retryAttemptId)
      if (!target || target.disputeId !== dispute.id) {
        throw new DisputeNotFoundError('dispute', input.retryAttemptId)
      }
      if (target.status !== 'failed') {
        throw new DisputeConflictError(
          'Only failed resolution attempts can be retried',
          'RESOLUTION_IN_PROGRESS',
          { attemptStatus: target.status }
        )
      }
      return this.retryAttempt(
        target,
        dispute,
        contract,
        actor,
        input.idempotencyKey,
        input
      )
    }

    // --- Concurrent resolution guard -------------------------------------
    const pending = await this.repo.getPendingAttempt(dispute.id)
    if (pending) {
      const state = await this.reconcilePendingAttempt(pending, dispute, contract, actor)
      if (state) return state
      throw new DisputeConflictError(
        'A resolution for this dispute is already in progress',
        'RESOLUTION_IN_PROGRESS',
        { attemptId: pending.id, txHash: pending.txHash }
      )
    }

    // --- Validate the requested outcome ----------------------------------
    assertOutcomeSupportedOnChain(input.outcome, contract)
    assertSplitAmounts(
      input.outcome,
      contract.totalAmount,
      input.clientRefundAmount,
      input.freelancerPayoutAmount
    )

    const onchain = Boolean(contract.escrowAddress) && input.outcome !== 'withdrawn'
    if (onchain && !dispute.milestoneId) {
      throw new DisputeValidationError(
        'The escrow contract can only settle milestone-scoped disputes; milestoneId is missing'
      )
    }

    // Split amounts are part of the immutable resolution record. They live in
    // the attempt metadata so the audit trail and the dispute row agree.
    const resolutionMetadata: Record<string, unknown> = {
      ...input.metadata,
      ...(input.outcome === 'resolved_split'
        ? {
            clientRefundAmount: input.clientRefundAmount ?? null,
            freelancerPayoutAmount: input.freelancerPayoutAmount ?? null,
          }
        : {}),
    }

    const attempt = await this.repo.createAttempt({
      disputeId: dispute.id,
      requestedByUserId: actor.userId,
      outcome: input.outcome,
      reasons: input.reasons,
      metadata: resolutionMetadata,
      onchain,
      idempotencyKey: input.idempotencyKey,
      retryOf: null,
    })

    await this.repo.linkAttemptToDispute(dispute.id, attempt.id)
    await this.safeAudit({
      disputeId: dispute.id,
      contractId: contract.id,
      actorUserId: actor.userId,
      actorWallet: actor.walletAddress,
      action: 'resolution_requested',
      metadata: {
        attemptId: attempt.id,
        outcome: input.outcome,
        onchain,
        txHash: null,
      },
    })

    return this.executeAttempt(attempt, dispute, contract, actor, input)
  }

  /**
   * Reconcile a pending resolution against the chain. Used by the retry flow
   * and exposed to callers so a crashed/timeout resolution can be recovered
   * without losing the dispute record.
   */
  async reconcileResolution(
    disputeId: string,
    actorWalletAddress: string
  ): Promise<ResolveDisputeResult | null> {
    this.assertStorageAvailable()

    const dispute = await this.requireDispute(disputeId)
    const contract = await this.requireContract(dispute.contractId)
    const actor = await this.requireActor(actorWalletAddress)
    assertCanResolveDispute(actor, contract)

    const pending = await this.repo.getPendingAttempt(dispute.id)
    if (!pending) return null
    return this.reconcilePendingAttempt(pending, dispute, contract, actor)
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private assertSameResolutionPayload(
    attempt: ResolutionAttemptRecord,
    input: ResolveDisputeInput
  ): void {
    if (attempt.outcome !== input.outcome || attempt.reasons !== input.reasons) {
      throw new DisputeConflictError(
        'This idempotency key was already used with a different resolution payload',
        'IDEMPOTENCY_KEY_REUSED',
        { attemptId: attempt.id }
      )
    }
  }

  private async executeAttempt(
    attempt: ResolutionAttemptRecord,
    dispute: DisputeRecord,
    contract: ContractRecord,
    actor: DisputeActor,
    input: ResolveDisputeInput
  ): Promise<ResolveDisputeResult> {
    // Withdrawals are an off-chain state change: no funds move.
    if (!attempt.onchain) {
      return this.confirmAttempt(attempt, dispute, contract, actor, null, null)
    }

    let submission: ChainResolutionSubmission
    try {
      submission = await this.chain.submitResolution({
        contractAddress: contract.escrowAddress as string,
        milestoneId: dispute.milestoneId as string,
        releaseToFreelancer: input.outcome === 'resolved_freelancer',
        disputeId: dispute.id,
      })
    } catch (err) {
      const code = err instanceof DisputeError ? err.code : 'BLOCKCHAIN_UNAVAILABLE'
      const message =
        err instanceof Error ? err.message : 'Dispute resolution could not be submitted'
      return this.failAttempt(attempt, dispute, contract, actor, {
        code,
        message,
        retryable: true,
      })
    }

    if (submission.state === 'confirmed') {
      return this.confirmAttempt(
        attempt,
        dispute,
        contract,
        actor,
        submission.txHash,
        submission.ledger ?? null
      )
    }

    if (submission.state === 'failed') {
      return this.failAttempt(attempt, dispute, contract, actor, {
        code: submission.errorCode ?? 'BLOCKCHAIN_RESOLUTION_FAILED',
        message: submission.errorMessage ?? 'The escrow contract rejected the resolution',
        retryable: false,
        txHash: submission.txHash,
      })
    }

    // --- Pending: the transaction is on its way but not yet verified ------
    const updated = await this.repo.updateAttempt(attempt.id, {
      status: 'pending',
      txHash: submission.txHash,
      ledger: submission.ledger ?? null,
    })

    await this.safeAudit({
      disputeId: dispute.id,
      contractId: contract.id,
      actorUserId: actor.userId,
      actorWallet: actor.walletAddress,
      action: 'resolution_pending',
      metadata: {
        attemptId: attempt.id,
        outcome: attempt.outcome,
        txHash: submission.txHash,
      },
    })

    return {
      state: 'pending',
      dispute,
      attempt: updated ?? attempt,
      contractStatus: contract.status,
      replayed: false,
      retryable: true,
    }
  }

  private async confirmAttempt(
    attempt: ResolutionAttemptRecord,
    dispute: DisputeRecord,
    contract: ContractRecord,
    actor: DisputeActor,
    txHash: string | null,
    ledger: number | null
  ): Promise<ResolveDisputeResult> {
    const contractStatus = CONTRACT_OUTCOME_STATUS[attempt.outcome]

    const confirmed = await this.repo.confirmResolution({
      disputeId: dispute.id,
      contractId: contract.id,
      attemptId: attempt.id,
      resolverId: actor.userId,
      outcome: attempt.outcome,
      reasons: attempt.reasons,
      metadata: attempt.metadata,
      txHash,
      ledger,
      contractStatus,
      clientRefundAmount:
        attempt.outcome === 'resolved_split'
          ? (attempt.metadata.clientRefundAmount as string | null) ?? null
          : null,
      freelancerPayoutAmount:
        attempt.outcome === 'resolved_split'
          ? (attempt.metadata.freelancerPayoutAmount as string | null) ?? null
          : null,
      actorWallet: actor.walletAddress,
    })

    if (!confirmed) {
      // Another request resolved the dispute first. The on-chain transaction
      // (if any) already exists, so this must surface as a conflict, never as
      // a success.
      const latest = await this.repo.getDispute(dispute.id)
      const failed = await this.repo.updateAttempt(attempt.id, {
        status: 'failed',
        errorCode: 'CONCURRENT_RESOLUTION',
        errorMessage: 'Dispute was resolved by a concurrent request',
        failedAt: new Date().toISOString(),
      })
      await this.safeAudit({
        disputeId: dispute.id,
        contractId: contract.id,
        actorUserId: actor.userId,
        actorWallet: actor.walletAddress,
        action: 'resolution_failed',
        metadata: { attemptId: attempt.id, errorCode: 'CONCURRENT_RESOLUTION' },
      })
      throw new DisputeConflictError(
        'This dispute was already resolved by another request',
        'RESOLUTION_ALREADY_FINALISED',
        {
          disputeStatus: latest?.status ?? dispute.status,
          attempt: failed?.id ?? attempt.id,
          txHash,
        }
      )
    }

    return {
      state: 'confirmed',
      dispute: confirmed.dispute,
      attempt: confirmed.attempt,
      contractStatus: confirmed.contractStatus,
      replayed: false,
      retryable: false,
    }
  }

  private async failAttempt(
    attempt: ResolutionAttemptRecord,
    dispute: DisputeRecord,
    contract: ContractRecord,
    actor: DisputeActor,
    failure: {
      code: string
      message: string
      retryable: boolean
      txHash?: string | null
    }
  ): Promise<ResolveDisputeResult> {
    const updated = await this.repo.updateAttempt(attempt.id, {
      status: 'failed',
      errorCode: failure.code,
      errorMessage: failure.message,
      failedAt: new Date().toISOString(),
      txHash: failure.txHash ?? null,
    })

    await this.safeAudit({
      disputeId: dispute.id,
      contractId: contract.id,
      actorUserId: actor.userId,
      actorWallet: actor.walletAddress,
      action: 'resolution_failed',
      metadata: {
        attemptId: attempt.id,
        outcome: attempt.outcome,
        errorCode: failure.code,
        retryable: failure.retryable,
        txHash: failure.txHash ?? null,
      },
    })

    return {
      state: 'failed',
      dispute,
      attempt: updated ?? attempt,
      contractStatus: contract.status,
      replayed: false,
      retryable: failure.retryable,
    }
  }

  private async retryAttempt(
    failed: ResolutionAttemptRecord,
    dispute: DisputeRecord,
    contract: ContractRecord,
    actor: DisputeActor,
    idempotencyKey?: string,
    override?: ResolveDisputeInput
  ): Promise<ResolveDisputeResult> {
    if (!isActiveStatus(dispute.status)) {
      throw new DisputeConflictError(
        'This dispute has already been resolved',
        'RESOLUTION_ALREADY_FINALISED',
        { disputeStatus: dispute.status }
      )
    }

    const key = idempotencyKey ?? `${failed.idempotencyKey}.retry`
    if (key === failed.idempotencyKey) {
      // Reuse the failed attempt row: reset it to pending and resubmit. This
      // keeps the idempotency key → attempt relationship stable.
      const reset = await this.repo.updateAttempt(failed.id, {
        status: 'pending',
        errorCode: null,
        errorMessage: null,
        txHash: null,
        failedAt: null,
        submittedAt: new Date().toISOString(),
      })
      await this.safeAudit({
        disputeId: dispute.id,
        contractId: contract.id,
        actorUserId: actor.userId,
        actorWallet: actor.walletAddress,
        action: 'resolution_retried',
        metadata: { attemptId: failed.id, retryOf: failed.id, txHash: failed.txHash },
      })
      return this.executeAttempt(
        reset ?? failed,
        dispute,
        contract,
        actor,
        override ?? this.attemptToInput(failed, dispute.id, actor.walletAddress)
      )
    }

    const attempt = await this.repo.createAttempt({
      disputeId: dispute.id,
      requestedByUserId: actor.userId,
      outcome: failed.outcome,
      reasons: failed.reasons,
      metadata: failed.metadata,
      onchain: failed.onchain,
      idempotencyKey: key,
      retryOf: failed.id,
    })

    await this.repo.linkAttemptToDispute(dispute.id, attempt.id)
    await this.safeAudit({
      disputeId: dispute.id,
      contractId: contract.id,
      actorUserId: actor.userId,
      actorWallet: actor.walletAddress,
      action: 'resolution_retried',
      metadata: { attemptId: attempt.id, retryOf: failed.id, txHash: failed.txHash },
    })

    return this.executeAttempt(
      attempt,
      dispute,
      contract,
      actor,
      override ?? this.attemptToInput(failed, dispute.id, actor.walletAddress)
    )
  }

  private attemptToInput(
    attempt: ResolutionAttemptRecord,
    disputeId: string,
    actorWalletAddress: string
  ): ResolveDisputeInput {
    return {
      disputeId,
      actorWalletAddress,
      outcome: attempt.outcome,
      reasons: attempt.reasons,
      metadata: attempt.metadata,
      idempotencyKey: attempt.idempotencyKey,
    }
  }

  private async reconcilePendingAttempt(
    pending: ResolutionAttemptRecord,
    dispute: DisputeRecord,
    contract: ContractRecord,
    actor: DisputeActor
  ): Promise<ResolveDisputeResult | null> {
    const txHash = pending.txHash

    if (!pending.onchain) {
      // A withdrawal attempt never stays pending; treat it as recoverable.
      const failed = await this.repo.updateAttempt(pending.id, {
        status: 'failed',
        errorCode: 'RECOVERY_REQUIRED',
        errorMessage: 'Resolution attempt was left pending without a transaction',
        failedAt: new Date().toISOString(),
      })
      if (!failed) return null
      return {
        state: 'failed',
        dispute,
        attempt: failed,
        contractStatus: contract.status,
        replayed: true,
        retryable: true,
      }
    }

    if (!txHash) {
      // The submission is still in flight and has no hash yet. Never touch the
      // attempt: the caller must treat this as RESOLUTION_IN_PROGRESS.
      return null
    }

    const status = await this.chain.verifyResolution(
      txHash,
      contract.escrowAddress ?? undefined
    )

    if (status === 'confirmed') {
      return this.confirmAttempt(
        pending,
        dispute,
        contract,
        actor,
        txHash,
        pending.ledger
      )
    }

    if (status === 'failed') {
      return this.failAttempt(pending, dispute, contract, actor, {
        code: 'CONTRACT_REVERTED',
        message: 'The resolution transaction was reverted on-chain',
        retryable: false,
        txHash: pending.txHash,
      })
    }

    return {
      state: 'pending',
      dispute,
      attempt: pending,
      contractStatus: contract.status,
      replayed: true,
      retryable: true,
    }
  }

  private async requireActor(walletAddress: string): Promise<DisputeActor> {
    const wallet = walletAddress?.trim()
    if (!wallet) {
      throw new DisputeError('Authentication required', 'AUTH_REQUIRED', 401)
    }
    const actor = await this.repo.findUserByWallet(wallet)
    if (!actor) {
      throw new DisputeError(
        'Authenticated wallet has no platform account',
        'USER_NOT_FOUND',
        401
      )
    }
    return actor
  }

  private async requireContract(contractId: string): Promise<ContractRecord> {
    const contract = await this.repo.getContract(contractId)
    if (!contract) throw new DisputeNotFoundError('contract', contractId)
    return contract
  }

  private async requireDispute(disputeId: string): Promise<DisputeRecord> {
    const dispute = await this.repo.getDispute(disputeId)
    if (!dispute) throw new DisputeNotFoundError('dispute', disputeId)
    return dispute
  }

  private assertStorageAvailable(): void {
    if (!this.repo.isAvailable()) {
      throw new DisputeError(
        'Dispute storage is not configured',
        'SERVICE_UNAVAILABLE',
        503
      )
    }
  }

  private async safeAudit(input: {
    disputeId: string | null
    contractId: string
    actorUserId: string | null
    actorWallet: string | null
    action: DisputeAuditAction
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      await this.repo.appendAudit(input)
    } catch (err) {
      // Audit failures must never lose the primary operation, but they are
      // logged (without evidence contents or secrets) for alerting.
      console.error('[disputes] Failed to append audit event', input.action, {
        disputeId: input.disputeId,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }
}

export const disputeWorkflowService = new DisputeWorkflowService()

export type { ResolutionState }
