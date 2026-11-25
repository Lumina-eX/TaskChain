/**
 * Dispute Resolution Workflow — Domain Types
 *
 * These types mirror the canonical (UUID) schema managed by
 * lib/db/migrations/ and are shared by the repository, service, blockchain
 * gateway and HTTP layer. No Next.js or SQL imports live here so the module
 * stays trivially unit-testable.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export const DISPUTE_OUTCOMES = [
  'resolved_client',
  'resolved_freelancer',
  'resolved_split',
  'withdrawn',
] as const
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number]

export const ACTIVE_DISPUTE_STATUSES = ['open', 'under_review', 'escalated'] as const
export type ActiveDisputeStatus = (typeof ACTIVE_DISPUTE_STATUSES)[number]

export type DisputeStatus = ActiveDisputeStatus | DisputeOutcome

export type ResolutionAttemptStatus = 'pending' | 'confirmed' | 'failed'

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

export type EvidenceType = 'url' | 'ipfs' | 'document' | 'transaction' | 'other'

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  'url',
  'ipfs',
  'document',
  'transaction',
  'other',
]

export const DISPUTE_AUDIT_ACTIONS = [
  'dispute_created',
  'evidence_submitted',
  'authorization_denied',
  'resolution_requested',
  'resolution_pending',
  'resolution_confirmed',
  'resolution_failed',
  'resolution_retried',
] as const
export type DisputeAuditAction = (typeof DISPUTE_AUDIT_ACTIONS)[number]

// ---------------------------------------------------------------------------
// Domain records
// ---------------------------------------------------------------------------

export interface DisputeActor {
  userId: string
  walletAddress: string
  role: string
}

export interface ContractRecord {
  id: string
  clientId: string
  freelancerId: string
  status: ContractStatus
  escrowStatus: EscrowStatus
  escrowAddress: string | null
  arbiterAddress: string | null
  designatedResolverId: string | null
  activeDisputeId: string | null
  totalAmount: string
  currency: string
}

export interface DisputeRecord {
  id: string
  contractId: string
  milestoneId: string | null
  raisedBy: 'client' | 'freelancer' | 'admin'
  raisedByUserId: string
  reason: string
  desiredOutcome: string | null
  status: DisputeStatus
  resolverId: string | null
  resolutionNotes: string | null
  resolutionMetadata: Record<string, unknown>
  clientRefundAmount: string | null
  freelancerPayoutAmount: string | null
  resolvedAt: string | null
  creationIdempotencyKey: string | null
  lastResolutionAttemptId: string | null
  createdAt: string
  updatedAt: string
}

export interface MilestoneRecord {
  id: string
  contractId: string | null
  status: string
  amount: string
}

export interface EvidenceRecord {
  id: string
  disputeId: string
  milestoneId: string | null
  submittedByUserId: string
  evidenceType: EvidenceType
  referenceUrl: string
  label: string | null
  description: string | null
  contentHash: string
  createdAt: string
}

export interface ResolutionAttemptRecord {
  id: string
  disputeId: string
  requestedByUserId: string
  outcome: DisputeOutcome
  reasons: string
  metadata: Record<string, unknown>
  status: ResolutionAttemptStatus
  onchain: boolean
  txHash: string | null
  ledger: number | null
  errorCode: string | null
  errorMessage: string | null
  retryOf: string | null
  idempotencyKey: string
  submittedAt: string | null
  confirmedAt: string | null
  failedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEventRecord {
  id: string
  disputeId: string
  contractId: string
  actorUserId: string | null
  actorWallet: string | null
  action: DisputeAuditAction
  metadata: Record<string, unknown>
  createdAt: string
}

// ---------------------------------------------------------------------------
// Service inputs / outputs
// ---------------------------------------------------------------------------

export interface EvidenceReferenceInput {
  type: EvidenceType
  url: string
  label?: string
  description?: string
}

export interface CreateDisputeInput {
  contractId: string
  actorWalletAddress: string
  reason: string
  desiredOutcome?: string
  milestoneId?: string
  evidence?: EvidenceReferenceInput[]
  idempotencyKey: string
}

export interface CreateDisputeResult {
  dispute: DisputeRecord
  contractStatus: ContractStatus
  /** true when the request replayed an existing dispute with the same key */
  replayed: boolean
}

export interface SubmitEvidenceInput {
  disputeId: string
  actorWalletAddress: string
  references: EvidenceReferenceInput[]
  description?: string
  idempotencyKey: string
}

export interface SubmitEvidenceResult {
  evidence: EvidenceRecord[]
  /** Evidence references that already existed and were not inserted again */
  duplicates: string[]
}

export interface GetDisputeResult {
  dispute: DisputeRecord
  evidence: EvidenceRecord[]
  resolutionAttempt: ResolutionAttemptRecord | null
  attempts: ResolutionAttemptRecord[]
  auditTrail: AuditEventRecord[]
}

export interface ResolveDisputeInput {
  disputeId: string
  actorWalletAddress: string
  outcome: DisputeOutcome
  reasons: string
  metadata: Record<string, unknown>
  clientRefundAmount?: string
  freelancerPayoutAmount?: string
  idempotencyKey: string
  /** Retry a previously failed on-chain resolution attempt. */
  retryAttemptId?: string
}

export type ResolutionState = 'confirmed' | 'pending' | 'failed'

export interface ResolveDisputeResult {
  state: ResolutionState
  dispute: DisputeRecord
  attempt: ResolutionAttemptRecord
  contractStatus: ContractStatus | null
  replayed: boolean
  /** true when a failed attempt may be retried with the same idempotency key */
  retryable: boolean
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DisputeError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'DisputeError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export class DisputeValidationError extends DisputeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DISPUTE_VALIDATION_ERROR', 422, details)
    this.name = 'DisputeValidationError'
  }
}

export class DisputeNotFoundError extends DisputeError {
  constructor(resource: 'contract' | 'dispute' | 'milestone', id: string) {
    super(`${resource} not found: ${id}`, `${resource.toUpperCase()}_NOT_FOUND`, 404)
    this.name = 'DisputeNotFoundError'
  }
}

export class DisputeForbiddenError extends DisputeError {
  constructor(message = 'You are not authorised to perform this action') {
    super(message, 'DISPUTE_FORBIDDEN', 403)
    this.name = 'DisputeForbiddenError'
  }
}

export class DisputeConflictError extends DisputeError {
  constructor(
    message: string,
    code:
      | 'DISPUTE_ALREADY_EXISTS'
      | 'RESOLUTION_ALREADY_FINALISED'
      | 'RESOLUTION_IN_PROGRESS'
      | 'IDEMPOTENCY_KEY_REUSED'
      | 'DISPUTE_CLOSED',
    details?: Record<string, unknown>
  ) {
    super(message, code, 409, details)
    this.name = 'DisputeConflictError'
  }
}

export class DisputeIneligibleError extends DisputeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DISPUTE_INELIGIBLE', 409, details)
    this.name = 'DisputeIneligibleError'
  }
}

export class DisputeChainError extends DisputeError {
  readonly retryable: boolean

  constructor(
    message: string,
    code: 'BLOCKCHAIN_UNAVAILABLE' | 'BLOCKCHAIN_RESOLUTION_FAILED' | 'BLOCKCHAIN_NOT_CONFIGURED',
    retryable: boolean
  ) {
    super(message, code, code === 'BLOCKCHAIN_UNAVAILABLE' ? 503 : 502, { retryable })
    this.name = 'DisputeChainError'
    this.retryable = retryable
  }
}

/** Maps a domain error to an HTTP status, defaulting to 500. */
export function disputeErrorToStatus(error: unknown): number {
  return error instanceof DisputeError ? error.status : 500
}
