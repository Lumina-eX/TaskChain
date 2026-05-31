/**
 * Escrow Lifecycle Service — Shared Types
 *
 * All domain types used across the escrow service layer. Keeping types in a
 * dedicated module makes them easy to import without pulling in side-effects
 * from the service or repository modules.
 */

// ---------------------------------------------------------------------------
// Enums (mirror the DB enums so TypeScript can enforce valid values)
// ---------------------------------------------------------------------------

export type ContractStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'disputed'

export type EscrowStatus =
  | 'unfunded'
  | 'funded'
  | 'partially_released'
  | 'fully_released'
  | 'refunded'

export type MilestoneStatus =
  | 'auto_expired'
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_client'
  | 'resolved_freelancer'
  | 'resolved_split'
  | 'withdrawn'
  | 'escalated'

export type DisputeRaisedBy = 'client' | 'freelancer' | 'admin'

// ---------------------------------------------------------------------------
// Core domain objects
// ---------------------------------------------------------------------------

export interface EscrowContract {
  id: string
  projectId: string
  clientId: string
  freelancerId: string
  totalAmount: string
  currency: string
  terms: string | null
  termsIpfsCid: string | null
  agreedAt: string | null
  escrowAddress: string | null
  escrowStatus: EscrowStatus
  fundedAt: string | null
  fundingTxHash: string | null
  status: ContractStatus
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  chainId: number | null
  contractTxHash: string | null
  activeDisputeId: string | null
  createdAt: string
  updatedAt: string
}

export interface EscrowMilestone {
  id: string
  projectId: string
  contractId: string | null
  title: string
  description: string | null
  sortOrder: number
  amount: string
  currency: string
  dueDate: string | null
  submittedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  status: MilestoneStatus
  escrowTxHash: string | null
  releaseTxHash: string | null
  deliverables: unknown[]
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

export interface EscrowDispute {
  id: string
  contractId: string
  milestoneId: string | null
  raisedBy: DisputeRaisedBy
  raisedByUserId: string
  reason: string
  desiredOutcome: string | null
  evidence: DisputeEvidence[]
  status: DisputeStatus
  resolverId: string | null
  resolutionNotes: string | null
  resolvedAt: string | null
  clientRefundAmount: string | null
  freelancerPayoutAmount: string | null
  responseDeadline: string | null
  createdAt: string
  updatedAt: string
}

export interface DisputeEvidence {
  type: string
  url: string
  label?: string
}

// ---------------------------------------------------------------------------
// Service input / output DTOs
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  title: string
  description?: string
  amount: string
  dueDate?: string
  /** Unix timestamp (seconds) for milestone deadline. After this, the milestone can be auto-expired. */
  deadline?: number
  sortOrder?: number
}

/** Input for createEscrow */
export interface CreateEscrowInput {
  projectId: string
  clientId: string
  freelancerId: string
  clientWalletAddress: string
  freelancerWalletAddress: string
  totalAmount: string
  currency: string
  terms?: string
  milestones?: MilestoneInput[]
}

/** Result returned from createEscrow */
export interface CreateEscrowResult {
  contract: EscrowContract
  milestonesCreated: number
  /** On-chain transaction hash from deployment */
  deployTxHash: string
}

/** Input for fundEscrow */
export interface FundEscrowInput {
  contractId: string
  /** Wallet address of the party funding (must be the client) */
  callerWalletAddress: string
  /** On-chain transaction hash proving the funding transfer */
  fundingTxHash: string
  /** Amount funded — validated against contract total */
  amount: string
}

/** Result returned from fundEscrow */
export interface FundEscrowResult {
  contract: EscrowContract
  fundedAt: string
}

/** Input for releaseFunds (per milestone) */
export interface ReleaseFundsInput {
  contractId: string
  milestoneId: string
  /** Wallet address of the caller — must be the client */
  callerWalletAddress: string
}

/** Result returned from releaseFunds */
export interface ReleaseFundsResult {
  milestone: EscrowMilestone
  contract: EscrowContract
  releaseTxHash: string
  allMilestonesPaid: boolean
}

/** Input for refundEscrow */
export interface RefundEscrowInput {
  contractId: string
  /** Wallet address of the caller — client or admin */
  callerWalletAddress: string
  reason: string
}

/** Result returned from refundEscrow */
export interface RefundEscrowResult {
  contract: EscrowContract
  refundTxHash: string
}

/** Input for raiseDispute */
export interface RaiseDisputeInput {
  contractId: string
  milestoneId?: string
  raisedByUserId: string
  raisedBy: DisputeRaisedBy
  reason: string
  desiredOutcome?: string
  evidence?: DisputeEvidence[]
  /** ISO date string for arbitration response deadline */
  responseDeadline?: string
}

/** Result returned from raiseDispute */
export interface RaiseDisputeResult {
  dispute: EscrowDispute
  contract: EscrowContract
}

/** Input for resolveDispute (admin only) */
export interface ResolveDisputeInput {
  disputeId: string
  resolverUserId: string
  outcome: 'resolved_client' | 'resolved_freelancer' | 'resolved_split' | 'withdrawn'
  resolutionNotes: string
  /** Required when outcome = 'resolved_split' */
  clientRefundAmount?: string
  /** Required when outcome = 'resolved_split' */
  freelancerPayoutAmount?: string
}

/** Result returned from resolveDispute */
export interface ResolveDisputeResult {
  dispute: EscrowDispute
  contract: EscrowContract
}

// ---------------------------------------------------------------------------
// Blockchain adapter interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over the Soroban/Stellar blockchain layer.
 * Swap the real implementation for a stub in tests without touching service logic.
 */
export interface IEscrowBlockchainAdapter {
  /**
   * Deploy a new escrow smart contract on-chain.
   * Returns the deployed contract address and the deployment tx hash.
   */
  deployContract(params: {
    clientAddress: string
    freelancerAddress: string
    totalAmount: string
    currency: string
  }): Promise<{ contractAddress: string; txHash: string; networkPassphrase: string }>

  /**
   * Verify that a funding transaction is valid and the escrow contract
   * has received the expected amount on-chain.
   */
  verifyFunding(params: {
    contractAddress: string
    txHash: string
    expectedAmount: string
    currency: string
  }): Promise<{ verified: boolean; onChainAmount: string }>

  /**
   * Invoke the release function on the escrow contract for a specific milestone.
   * Returns the release transaction hash.
   */
  releaseMilestoneFunds(params: {
    contractAddress: string
    milestoneId: string
    recipientAddress: string
    amount: string
    currency: string
  }): Promise<{ txHash: string }>

  /**
   * Invoke the refund function on the escrow contract, returning all
   * remaining funds to the client.
   */
  refundEscrow(params: {
    contractAddress: string
    clientAddress: string
    amount: string
    currency: string
  }): Promise<{ txHash: string }>
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over the database layer for escrow operations.
 * Enables unit testing the service without a real DB connection.
 */
export interface IEscrowRepository {
  getContractById(contractId: string): Promise<EscrowContract | null>
  getContractByProjectId(projectId: string): Promise<EscrowContract | null>
  getMilestoneById(milestoneId: string): Promise<EscrowMilestone | null>
  getMilestonesByContractId(contractId: string): Promise<EscrowMilestone[]>
  getDisputeById(disputeId: string): Promise<EscrowDispute | null>
  getActiveDisputeByContractId(contractId: string): Promise<EscrowDispute | null>
  getUserWalletAddress(userId: string): Promise<string | null>

  createContract(params: {
    projectId: string
    clientId: string
    freelancerId: string
    totalAmount: string
    currency: string
    terms?: string
    escrowAddress: string
    contractTxHash: string
  }): Promise<EscrowContract>

  createMilestones(
    contractId: string,
    projectId: string,
    milestones: MilestoneInput[]
  ): Promise<void>

  updateContractEscrowStatus(
    contractId: string,
    escrowStatus: EscrowStatus,
    extra?: Partial<Pick<EscrowContract, 'fundedAt' | 'fundingTxHash' | 'status' | 'startedAt' | 'completedAt' | 'cancelledAt' | 'cancellationReason' | 'activeDisputeId'>>
  ): Promise<EscrowContract>

  updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus,
    extra?: Partial<Pick<EscrowMilestone, 'releaseTxHash' | 'paidAt' | 'rejectionReason'>>
  ): Promise<EscrowMilestone>

  createDispute(params: {
    contractId: string
    milestoneId?: string
    raisedBy: DisputeRaisedBy
    raisedByUserId: string
    reason: string
    desiredOutcome?: string
    evidence?: DisputeEvidence[]
    responseDeadline?: string
  }): Promise<EscrowDispute>

  updateDispute(
    disputeId: string,
    params: Partial<Pick<EscrowDispute, 'status' | 'resolverId' | 'resolutionNotes' | 'resolvedAt' | 'clientRefundAmount' | 'freelancerPayoutAmount'>>
  ): Promise<EscrowDispute>
}
