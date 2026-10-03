/**
 * Typed errors for the Proposal Acceptance service.
 * Controllers map these to HTTP status codes via `proposalErrorToHttpStatus`.
 */

export type ProposalErrorCode =
  | 'PROPOSAL_NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'PROPOSAL_NOT_PENDING'
  | 'JOB_NOT_ACCEPTING'
  | 'PROPOSAL_ALREADY_ACCEPTED'
  | 'CONTRACT_ALREADY_EXISTS'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'TRANSACTION_FAILED'

export class ProposalAcceptanceError extends Error {
  readonly code: ProposalErrorCode
  readonly httpStatus: number

  constructor(message: string, code: ProposalErrorCode, httpStatus: number) {
    super(message)
    this.name = 'ProposalAcceptanceError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export class ProposalNotFoundError extends ProposalAcceptanceError {
  constructor(proposalId: number) {
    super(`Proposal ${proposalId} was not found`, 'PROPOSAL_NOT_FOUND', 404)
    this.name = 'ProposalNotFoundError'
  }
}

export class JobNotFoundError extends ProposalAcceptanceError {
  constructor(jobId: number) {
    super(`Job/project ${jobId} was not found`, 'JOB_NOT_FOUND', 404)
    this.name = 'JobNotFoundError'
  }
}

export class ProposalNotPendingError extends ProposalAcceptanceError {
  constructor(proposalId: number, status: string) {
    super(
      `Proposal ${proposalId} cannot be accepted (status=${status})`,
      'PROPOSAL_NOT_PENDING',
      409
    )
    this.name = 'ProposalNotPendingError'
  }
}

export class JobNotAcceptingError extends ProposalAcceptanceError {
  constructor(jobId: number, status: string) {
    super(
      `Job ${jobId} is not open for proposal acceptance (status=${status})`,
      'JOB_NOT_ACCEPTING',
      409
    )
    this.name = 'JobNotAcceptingError'
  }
}

export class ProposalAlreadyAcceptedError extends ProposalAcceptanceError {
  constructor(jobId: number, existingProposalId: number) {
    super(
      `Job ${jobId} already has accepted proposal ${existingProposalId}`,
      'PROPOSAL_ALREADY_ACCEPTED',
      409
    )
    this.name = 'ProposalAlreadyAcceptedError'
  }
}

export class ContractAlreadyExistsError extends ProposalAcceptanceError {
  constructor(jobId: number, contractId: number) {
    super(
      `Job ${jobId} already has contract ${contractId}`,
      'CONTRACT_ALREADY_EXISTS',
      409
    )
    this.name = 'ContractAlreadyExistsError'
  }
}

export class ProposalForbiddenError extends ProposalAcceptanceError {
  constructor(message: string) {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ProposalForbiddenError'
  }
}

export class ProposalValidationError extends ProposalAcceptanceError {
  constructor(message: string) {
    super(message, 'VALIDATION', 400)
    this.name = 'ProposalValidationError'
  }
}

export class ProposalTransactionError extends ProposalAcceptanceError {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message, 'TRANSACTION_FAILED', 500)
    this.name = 'ProposalTransactionError'
    this.cause = cause
  }
}

export function proposalErrorToHttpStatus(err: ProposalAcceptanceError): number {
  return err.httpStatus
}
