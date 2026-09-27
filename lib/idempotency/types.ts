/**
 * Idempotency Layer — Shared Types
 *
 * Types used by the idempotency repository, service and route wrapper.
 * Keeping them in a dedicated module lets consumers import types without
 * pulling in the service (and therefore the DB client) as a side effect.
 */

/** Lifecycle of a stored idempotency record. */
export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed'

/**
 * Logical operation the idempotency key is scoped to.
 * The pair (idempotencyKey, operationType) is unique, so the same key can be
 * reused safely across different operations.
 */
export const IDEMPOTENCY_OPERATIONS = [
  'escrow_create',
  'escrow_fund',
  'escrow_release',
  'escrow_refund',
  'escrow_dispute',
  'dispute_resolve',
] as const

export type IdempotencyOperationType = (typeof IDEMPOTENCY_OPERATIONS)[number]

/** Persisted representation of an idempotency record. */
export interface IdempotencyRecord {
  id: string
  idempotencyKey: string
  operationType: IdempotencyOperationType
  requestHash: string
  requestPayload: Record<string, unknown>
  responsePayload: Record<string, unknown> | null
  responseStatus: number | null
  status: IdempotencyStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
}

/** Input for atomically claiming an idempotency key. */
export interface ClaimIdempotencyInput {
  key: string
  operationType: IdempotencyOperationType
  requestHash: string
  requestPayload: Record<string, unknown>
  ttlHours: number
}

/** Result of a claim attempt. */
export interface ClaimIdempotencyResult {
  /** True when this caller created / reclaimed the record and may execute. */
  claimed: boolean
  /** The current record, whether freshly claimed or pre-existing. */
  record: IdempotencyRecord | null
}

/** Repository abstraction — swapped for an in-memory stub in tests. */
export interface IIdempotencyRepository {
  claim(input: ClaimIdempotencyInput): Promise<ClaimIdempotencyResult>
  get(
    key: string,
    operationType: IdempotencyOperationType
  ): Promise<IdempotencyRecord | null>
  complete(
    key: string,
    operationType: IdempotencyOperationType,
    responsePayload: Record<string, unknown>,
    responseStatus: number,
    ttlHours: number
  ): Promise<IdempotencyRecord | null>
  markFailed(
    key: string,
    operationType: IdempotencyOperationType
  ): Promise<void>
  remove(key: string, operationType: IdempotencyOperationType): Promise<void>
  purgeExpired(): Promise<number>
}

/** HTTP response captured from a route handler. */
export interface IdempotentResponse {
  status: number
  body: Record<string, unknown>
}

/** Outcome returned by the idempotency service. */
export interface IdempotentOutcome extends IdempotentResponse {
  /** True when the response came from a previously stored record. */
  replayed: boolean
}
