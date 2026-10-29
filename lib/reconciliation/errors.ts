/**
 * Reconciliation — Domain Errors
 *
 * Typed error classes for the reconciliation service.
 */

export class ReconciliationError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'ReconciliationError'
    this.code = code
  }
}

export class ReconciliationValidationError extends ReconciliationError {
  constructor(message: string) {
    super(message, 'RECONCILIATION_VALIDATION_ERROR')
    this.name = 'ReconciliationValidationError'
  }
}

export class ReconciliationForbiddenError extends ReconciliationError {
  constructor(message: string) {
    super(message, 'RECONCILIATION_FORBIDDEN')
    this.name = 'ReconciliationForbiddenError'
  }
}

export class ReconciliationNotFoundError extends ReconciliationError {
  constructor(message: string) {
    super(message, 'RECONCILIATION_NOT_FOUND')
    this.name = 'ReconciliationNotFoundError'
  }
}

export class ReconciliationExecutionError extends ReconciliationError {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message, 'RECONCILIATION_EXECUTION_ERROR')
    this.name = 'ReconciliationExecutionError'
    this.cause = cause
  }
}

export function reconciliationErrorToHttpStatus(err: ReconciliationError): number {
  if (err instanceof ReconciliationValidationError) return 422
  if (err instanceof ReconciliationForbiddenError) return 403
  if (err instanceof ReconciliationNotFoundError) return 404
  if (err instanceof ReconciliationExecutionError) return 500
  return 500
}
