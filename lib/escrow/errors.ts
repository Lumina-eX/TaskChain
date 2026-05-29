/**
 * Escrow Lifecycle Service — Domain Errors
 *
 * Typed error classes let controllers distinguish between different failure
 * modes and map them to the correct HTTP status codes without leaking
 * implementation details.
 */

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class EscrowError extends Error {
  /** Machine-readable code for API responses */
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'EscrowError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// 400 — Bad request / invalid state
// ---------------------------------------------------------------------------

/** The requested lifecycle transition is not valid for the current state. */
export class EscrowInvalidStateError extends EscrowError {
  constructor(message: string) {
    super(message, 'ESCROW_INVALID_STATE')
    this.name = 'EscrowInvalidStateError'
  }
}

/** Input data failed validation (amounts, IDs, etc.). */
export class EscrowValidationError extends EscrowError {
  constructor(message: string) {
    super(message, 'ESCROW_VALIDATION_ERROR')
    this.name = 'EscrowValidationError'
  }
}

// ---------------------------------------------------------------------------
// 403 — Authorisation
// ---------------------------------------------------------------------------

/** The caller is not permitted to perform this operation. */
export class EscrowForbiddenError extends EscrowError {
  constructor(message: string) {
    super(message, 'ESCROW_FORBIDDEN')
    this.name = 'EscrowForbiddenError'
  }
}

// ---------------------------------------------------------------------------
// 404 — Not found
// ---------------------------------------------------------------------------

/** The requested contract does not exist. */
export class EscrowContractNotFoundError extends EscrowError {
  constructor(contractId: string) {
    super(`Contract not found: ${contractId}`, 'ESCROW_CONTRACT_NOT_FOUND')
    this.name = 'EscrowContractNotFoundError'
  }
}

/** The requested milestone does not exist. */
export class EscrowMilestoneNotFoundError extends EscrowError {
  constructor(milestoneId: string) {
    super(`Milestone not found: ${milestoneId}`, 'ESCROW_MILESTONE_NOT_FOUND')
    this.name = 'EscrowMilestoneNotFoundError'
  }
}

/** The requested dispute does not exist. */
export class EscrowDisputeNotFoundError extends EscrowError {
  constructor(disputeId: string) {
    super(`Dispute not found: ${disputeId}`, 'ESCROW_DISPUTE_NOT_FOUND')
    this.name = 'EscrowDisputeNotFoundError'
  }
}

// ---------------------------------------------------------------------------
// 409 — Conflict
// ---------------------------------------------------------------------------

/** A contract already exists for this project. */
export class EscrowAlreadyExistsError extends EscrowError {
  readonly existingContractId: string

  constructor(projectId: string, existingContractId: string) {
    super(
      `A contract already exists for project ${projectId}`,
      'ESCROW_ALREADY_EXISTS'
    )
    this.name = 'EscrowAlreadyExistsError'
    this.existingContractId = existingContractId
  }
}

/** An active dispute already exists for this contract. */
export class EscrowDisputeAlreadyActiveError extends EscrowError {
  readonly existingDisputeId: string

  constructor(contractId: string, existingDisputeId: string) {
    super(
      `An active dispute already exists for contract ${contractId}`,
      'ESCROW_DISPUTE_ALREADY_ACTIVE'
    )
    this.name = 'EscrowDisputeAlreadyActiveError'
    this.existingDisputeId = existingDisputeId
  }
}

// ---------------------------------------------------------------------------
// 502 — Blockchain / external service failures
// ---------------------------------------------------------------------------

/** An on-chain operation failed. */
export class EscrowBlockchainError extends EscrowError {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message, 'ESCROW_BLOCKCHAIN_ERROR')
    this.name = 'EscrowBlockchainError'
    this.cause = cause
  }
}

/** On-chain funding verification failed (amount mismatch or tx not found). */
export class EscrowFundingVerificationError extends EscrowError {
  constructor(message: string) {
    super(message, 'ESCROW_FUNDING_VERIFICATION_FAILED')
    this.name = 'EscrowFundingVerificationError'
  }
}

// ---------------------------------------------------------------------------
// Helper — map EscrowError to HTTP status
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate HTTP status code for a given EscrowError subclass.
 * Falls back to 500 for unknown errors.
 */
export function escrowErrorToHttpStatus(err: EscrowError): number {
  switch (err.name) {
    case 'EscrowValidationError':
    case 'EscrowInvalidStateError':
      return 400
    case 'EscrowForbiddenError':
      return 403
    case 'EscrowContractNotFoundError':
    case 'EscrowMilestoneNotFoundError':
    case 'EscrowDisputeNotFoundError':
      return 404
    case 'EscrowAlreadyExistsError':
    case 'EscrowDisputeAlreadyActiveError':
      return 409
    case 'EscrowBlockchainError':
    case 'EscrowFundingVerificationError':
      return 502
    default:
      return 500
  }
}
