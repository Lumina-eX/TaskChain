/**
 * Idempotency Layer — Configuration
 *
 * All tunables are read from the environment with safe defaults so the layer
 * works out of the box in development and CI.
 */

/** Standard header clients use to send their idempotency key. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/** Response header indicating whether a request was served from storage. */
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed'

/** Default retention window for completed idempotency records. */
export const DEFAULT_IDEMPOTENCY_TTL_HOURS = 24

/** Hard bounds for the configurable TTL (1 hour … 30 days). */
export const MIN_IDEMPOTENCY_TTL_HOURS = 1
export const MAX_IDEMPOTENCY_TTL_HOURS = 720

/** Minimum accepted key length — enough entropy for a UUID or hash. */
export const MIN_IDEMPOTENCY_KEY_LENGTH = 16

/** Maximum accepted key length (matches a generous TEXT sanity bound). */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IDEMPOTENCY_TTL_HOURS
  return Math.min(
    MAX_IDEMPOTENCY_TTL_HOURS,
    Math.max(MIN_IDEMPOTENCY_TTL_HOURS, Math.floor(value))
  )
}

/**
 * Reads the idempotency TTL (in hours) from `IDEMPOTENCY_TTL_HOURS`.
 * Falls back to {@link DEFAULT_IDEMPOTENCY_TTL_HOURS} when unset/invalid and
 * clamps the result to the supported range.
 */
export function getIdempotencyTtlHours(): number {
  const raw = process.env.IDEMPOTENCY_TTL_HOURS
  if (!raw) return DEFAULT_IDEMPOTENCY_TTL_HOURS
  return clamp(Number(raw))
}
