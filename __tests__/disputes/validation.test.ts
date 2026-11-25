import { describe, it, expect } from 'vitest'

import {
  assertSplitAmounts,
  parseCreateDisputeInput,
  parseIdempotencyKey,
  parseResolveDisputeInput,
  parseSubmitEvidenceInput,
  toBaseUnits,
} from '@/lib/disputes/validation'
import { DisputeValidationError } from '@/lib/disputes/types'

const KEY = 'idempotency-key-0001'

describe('parseIdempotencyKey', () => {
  it('accepts a header key and falls back to the body', () => {
    expect(parseIdempotencyKey(KEY, undefined)).toBe(KEY)
    expect(parseIdempotencyKey(undefined, KEY)).toBe(KEY)
  })

  it('rejects missing, short or malformed keys', () => {
    expect(() => parseIdempotencyKey(null, undefined)).toThrow(DisputeValidationError)
    expect(() => parseIdempotencyKey('short', undefined)).toThrow(DisputeValidationError)
    expect(() => parseIdempotencyKey('bad key with spaces!!', undefined)).toThrow(
      DisputeValidationError
    )
  })
})

describe('parseCreateDisputeInput', () => {
  it('parses a valid payload', () => {
    const parsed = parseCreateDisputeInput(
      {
        reason: 'Delivered work does not match the agreed specification',
        milestoneId: 'milestone-1',
        evidence: [{ type: 'url', url: 'https://proof.test/a', label: 'scope' }],
      },
      KEY
    )

    expect(parsed.idempotencyKey).toBe(KEY)
    expect(parsed.evidence[0]).toEqual({
      type: 'url',
      url: 'https://proof.test/a',
      label: 'scope',
      description: undefined,
    })
  })

  it('rejects short reasons, bad evidence types and oversized lists', () => {
    expect(() => parseCreateDisputeInput({ reason: 'too short' }, KEY)).toThrow(
      DisputeValidationError
    )
    expect(() =>
      parseCreateDisputeInput(
        {
          reason: 'Delivered work does not match the specification',
          evidence: [{ type: 'executable', url: 'https://x.test' }],
        },
        KEY
      )
    ).toThrow(DisputeValidationError)
    expect(() =>
      parseCreateDisputeInput(
        {
          reason: 'Delivered work does not match the specification',
          evidence: Array.from({ length: 21 }, (_, i) => ({
            type: 'url',
            url: `https://x.test/${i}`,
          })),
        },
        KEY
      )
    ).toThrow(DisputeValidationError)
  })

  it('rejects non-object bodies', () => {
    expect(() => parseCreateDisputeInput(null, KEY)).toThrow(DisputeValidationError)
    expect(() => parseCreateDisputeInput([], KEY)).toThrow(DisputeValidationError)
  })
})

describe('parseSubmitEvidenceInput', () => {
  it('requires references or a description', () => {
    expect(() => parseSubmitEvidenceInput({}, KEY)).toThrow(DisputeValidationError)
    const parsed = parseSubmitEvidenceInput(
      { description: 'Written statement from the client' },
      KEY
    )
    expect(parsed.references).toEqual([])
    expect(parsed.description).toBe('Written statement from the client')
  })
})

describe('parseResolveDisputeInput', () => {
  it('requires a documented reason and a valid outcome', () => {
    expect(() =>
      parseResolveDisputeInput({ outcome: 'resolved_client', reasons: 'nope' }, KEY)
    ).toThrow(DisputeValidationError)
    expect(() =>
      parseResolveDisputeInput(
        { outcome: 'resolved_everything', reasons: 'A documented resolution reason' },
        KEY
      )
    ).toThrow(DisputeValidationError)
  })

  it('accepts metadata and rejects non-object metadata', () => {
    const parsed = parseResolveDisputeInput(
      {
        outcome: 'resolved_client',
        reasons: 'Evidence shows the deliverable was never submitted',
        metadata: { evidenceIds: ['e1'], reviewedBy: 'arbiter' },
      },
      KEY
    )
    expect(parsed.metadata).toEqual({ evidenceIds: ['e1'], reviewedBy: 'arbiter' })

    expect(() =>
      parseResolveDisputeInput(
        {
          outcome: 'resolved_client',
          reasons: 'Evidence shows the deliverable was never submitted',
          metadata: ['not', 'an', 'object'],
        },
        KEY
      )
    ).toThrow(DisputeValidationError)
  })
})

describe('amount handling', () => {
  it('parses decimal strings exactly', () => {
    expect(toBaseUnits('1.000001', 'amount')).toBe(BigInt(1000001))
    expect(() => toBaseUnits('1.0000001', 'amount')).toThrow(DisputeValidationError)
    expect(() => toBaseUnits('-1', 'amount')).toThrow(DisputeValidationError)
  })

  it('requires split amounts to sum to the contract total', () => {
    expect(() =>
      assertSplitAmounts('resolved_split', '1000.000000', '400.000000', '600.000000')
    ).not.toThrow()

    expect(() =>
      assertSplitAmounts('resolved_split', '1000.000000', '400.000000', '500.000000')
    ).toThrow(DisputeValidationError)

    expect(() => assertSplitAmounts('resolved_split', '1000.000000')).toThrow(
      DisputeValidationError
    )
  })

  it('does not enforce split amounts for other outcomes', () => {
    expect(() => assertSplitAmounts('resolved_client', '1000')).not.toThrow()
  })
})
