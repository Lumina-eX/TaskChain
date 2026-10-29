/**
 * Payment Ledger — Domain Errors
 *
 * Typed error classes that let API routes map to the correct HTTP status
 * without leaking implementation details.  Mirrors the pattern established
 * by the escrow error hierarchy.
 */

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class LedgerError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'LedgerError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// 400 — Bad request / validation
// ---------------------------------------------------------------------------

export class LedgerValidationError extends LedgerError {
  constructor(message: string) {
    super(message, 'LEDGER_VALIDATION_ERROR')
    this.name = 'LedgerValidationError'
  }
}

// ---------------------------------------------------------------------------
// 403 — Authorisation
// ---------------------------------------------------------------------------

export class LedgerForbiddenError extends LedgerError {
  constructor(message: string) {
    super(message, 'LEDGER_FORBIDDEN')
    this.name = 'LedgerForbiddenError'
  }
}

// ---------------------------------------------------------------------------
// 404 — Not found
// ---------------------------------------------------------------------------

export class LedgerNotFoundError extends LedgerError {
  constructor(message: string) {
    super(message, 'LEDGER_NOT_FOUND')
    this.name = 'LedgerNotFoundError'
  }
}

// ---------------------------------------------------------------------------
// 409 — Conflict (duplicate entry)
// ---------------------------------------------------------------------------

export class LedgerDuplicateEntryError extends LedgerError {
  readonly existingEntryId: string

  constructor(existingEntryId: string) {
    super(
      'A ledger entry with the same transaction hash, type, and contract already exists',
      'LEDGER_DUPLICATE_ENTRY'
    )
    this.name = 'LedgerDuplicateEntryError'
    this.existingEntryId = existingEntryId
  }
}

// ---------------------------------------------------------------------------
// 500 — Internal / unexpected
// ---------------------------------------------------------------------------

export class LedgerQueryError extends LedgerError {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message, 'LEDGER_QUERY_ERROR')
    this.name = 'LedgerQueryError'
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------
// HTTP status mapper
// ---------------------------------------------------------------------------

export function ledgerErrorToHttpStatus(err: LedgerError): number {
  if (err instanceof LedgerValidationError) return 422
  if (err instanceof LedgerForbiddenError) return 403
  if (err instanceof LedgerNotFoundError) return 404
  if (err instanceof LedgerDuplicateEntryError) return 409
  if (err instanceof LedgerQueryError) return 500
  return 500
}
