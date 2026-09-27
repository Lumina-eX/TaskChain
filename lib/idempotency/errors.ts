/**
 * Idempotency Layer — Domain Errors
 *
 * Typed errors with machine-readable codes so route handlers can return
 * precise HTTP responses (see the acceptance criteria in issue #218).
 */

export class IdempotencyError extends Error {
  /** Machine-readable error code returned to the client. */
  readonly code: string
  /** HTTP status that should accompany the error. */
  readonly status: number
  /** Optional structured details merged into the response body. */
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'IdempotencyError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** No idempotency key was supplied with a payment request. */
export class IdempotencyKeyRequiredError extends IdempotencyError {
  constructor() {
    super(
      'An "Idempotency-Key" header or "idempotencyKey" body field is required for this operation',
      'IDEMPOTENCY_KEY_REQUIRED',
      400
    )
    this.name = 'IdempotencyKeyRequiredError'
  }
}

/** The supplied key is present but malformed. */
export class IdempotencyKeyInvalidError extends IdempotencyError {
  constructor(reason: string) {
    super(
      `Invalid idempotency key: ${reason}`,
      'IDEMPOTENCY_KEY_INVALID',
      400
    )
    this.name = 'IdempotencyKeyInvalidError'
  }
}

/** The same key was reused with a different request payload. */
export class IdempotencyKeyReusedError extends IdempotencyError {
  constructor() {
    super(
      'This idempotency key was already used with a different request payload',
      'IDEMPOTENCY_KEY_REUSED',
      409
    )
    this.name = 'IdempotencyKeyReusedError'
  }
}

/**
 * A request with the same key is currently being processed. The client should
 * retry after a short delay, at which point the stored result is returned.
 */
export class IdempotencyInProgressError extends IdempotencyError {
  constructor(expiresAt?: string) {
    super(
      'A request with this idempotency key is already in progress',
      'IDEMPOTENCY_IN_PROGRESS',
      409,
      expiresAt ? { expiresAt } : undefined
    )
    this.name = 'IdempotencyInProgressError'
  }
}

/** The idempotency store could not be read or written. */
export class IdempotencyStorageError extends IdempotencyError {
  constructor(message = 'Idempotency store is unavailable') {
    super(message, 'IDEMPOTENCY_STORAGE_ERROR', 503)
    this.name = 'IdempotencyStorageError'
  }
}
