/**
 * Idempotency Layer — Validation & Hashing Helpers
 *
 * These are pure functions (no DB / no Next.js side effects) so they can be
 * unit-tested in isolation.
 */

import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

import {
  IDEMPOTENCY_KEY_HEADER,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from './config'
import {
  IdempotencyKeyInvalidError,
  IdempotencyKeyRequiredError,
} from './errors'

/** Characters permitted in an idempotency key (UUIDs, hex hashes, base64url…). */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:+/-]+$/

/**
 * Reads the idempotency key from the `Idempotency-Key` header, falling back to
 * an `idempotencyKey` field on the request body (if the body is an object).
 */
export function extractIdempotencyKey(
  request: NextRequest,
  body?: unknown
): string | null {
  const header = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  if (header && header.trim().length > 0) return header.trim()

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const candidate = (body as Record<string, unknown>).idempotencyKey
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

/**
 * Validates a raw idempotency key and returns the normalised value.
 *
 * @throws {IdempotencyKeyRequiredError} when the key is null/undefined/empty
 * @throws {IdempotencyKeyInvalidError}  when the key is malformed
 */
export function validateIdempotencyKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    throw new IdempotencyKeyRequiredError()
  }

  const key = raw.trim()

  if (key.length < MIN_IDEMPOTENCY_KEY_LENGTH) {
    throw new IdempotencyKeyInvalidError(
      `must be at least ${MIN_IDEMPOTENCY_KEY_LENGTH} characters`
    )
  }

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new IdempotencyKeyInvalidError(
      `must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`
    )
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new IdempotencyKeyInvalidError(
      'may only contain letters, digits and . _ : + / -'
    )
  }

  return key
}

/** Deterministic JSON serialisation (objects are key-sorted at every level). */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) as string
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

/**
 * Hashes a request payload so a replayed key can be matched to the original
 * request. Key order does not affect the hash.
 */
export function hashRequestPayload(payload: unknown): string {
  return createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
}
