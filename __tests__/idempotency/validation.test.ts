import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import {
  extractIdempotencyKey,
  validateIdempotencyKey,
  hashRequestPayload,
  stableStringify,
} from '@/lib/idempotency/validation'
import {
  IdempotencyKeyInvalidError,
  IdempotencyKeyRequiredError,
} from '@/lib/idempotency/errors'

const VALID_KEY = 'a4f8c2e0-6b1d-4f3a-9c7e-1234567890ab'

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/escrow/fund', {
    method: 'POST',
    headers,
  })
}

describe('extractIdempotencyKey', () => {
  it('prefers the Idempotency-Key header', () => {
    const request = makeRequest({ 'Idempotency-Key': 'header-key-1234567890' })
    expect(extractIdempotencyKey(request, { idempotencyKey: 'body-key-1234567890' })).toBe(
      'header-key-1234567890'
    )
  })

  it('falls back to the body field', () => {
    const request = makeRequest()
    expect(extractIdempotencyKey(request, { idempotencyKey: 'body-key-1234567890' })).toBe(
      'body-key-1234567890'
    )
  })

  it('returns null when no key is provided', () => {
    expect(extractIdempotencyKey(makeRequest(), {})).toBeNull()
  })

  it('trims whitespace around a key', () => {
    const request = makeRequest({ 'Idempotency-Key': '  spaced-key-1234567890  ' })
    expect(extractIdempotencyKey(request)).toBe('spaced-key-1234567890')
  })
})

describe('validateIdempotencyKey', () => {
  it('accepts a UUID key', () => {
    expect(validateIdempotencyKey(VALID_KEY)).toBe(VALID_KEY)
  })

  it('accepts a hex hash key', () => {
    const hash = 'f'.repeat(64)
    expect(validateIdempotencyKey(hash)).toBe(hash)
  })

  it('throws KEY_REQUIRED when missing', () => {
    expect(() => validateIdempotencyKey(null)).toThrow(IdempotencyKeyRequiredError)
    expect(() => validateIdempotencyKey('')).toThrow(IdempotencyKeyRequiredError)
    try {
      validateIdempotencyKey('   ')
    } catch (err) {
      expect((err as IdempotencyKeyRequiredError).code).toBe('IDEMPOTENCY_KEY_REQUIRED')
      expect((err as IdempotencyKeyRequiredError).status).toBe(400)
    }
  })

  it('throws KEY_INVALID when too short', () => {
    expect(() => validateIdempotencyKey('short')).toThrow(IdempotencyKeyInvalidError)
  })

  it('throws KEY_INVALID on illegal characters', () => {
    expect(() => validateIdempotencyKey('invalid key with spaces!!')).toThrow(
      IdempotencyKeyInvalidError
    )
  })

  it('throws KEY_INVALID when too long', () => {
    expect(() => validateIdempotencyKey('a'.repeat(256))).toThrow(
      IdempotencyKeyInvalidError
    )
  })
})

describe('stableStringify / hashRequestPayload', () => {
  it('produces the same hash regardless of key order', () => {
    const a = { b: 1, a: { d: 2, c: 3 } }
    const b = { a: { c: 3, d: 2 }, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
    expect(hashRequestPayload(a)).toBe(hashRequestPayload(b))
  })

  it('produces different hashes for different payloads', () => {
    expect(hashRequestPayload({ amount: '10' })).not.toBe(
      hashRequestPayload({ amount: '20' })
    )
  })

  it('handles arrays, null and primitives', () => {
    expect(stableStringify([1, null, 'x'])).toBe('[1,null,"x"]')
    expect(typeof hashRequestPayload(null)).toBe('string')
  })
})
