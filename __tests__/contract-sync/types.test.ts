import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SOROBAN_EVENTS,
  normalizeSorobanEvent,
} from '@/lib/contract-sync/types'

describe('Soroban event standardization', () => {
  it('exposes the canonical event vocabulary', () => {
    expect(CANONICAL_SOROBAN_EVENTS).toContain('escrow_created')
    expect(CANONICAL_SOROBAN_EVENTS).toContain('payment_released')
    expect(CANONICAL_SOROBAN_EVENTS).toContain('dispute_created')
    expect(CANONICAL_SOROBAN_EVENTS).toContain('stake_claimed')
  })

  it.each([
    ['EscrowCreated', 'escrow_created'],
    ['PaymentReleased', 'payment_released'],
    ['DisputeRaised', 'dispute_raised'],
    ['dispute_resolved', 'dispute_resolved'],
    ['fund', 'escrow_funded'],
    ['release', 'payment_released'],
  ])('normalizes %s to %s', (topic, expected) => {
    expect(normalizeSorobanEvent(topic)).toBe(expected)
  })

  it('rejects unknown topics', () => {
    expect(normalizeSorobanEvent('unknown_event')).toBeNull()
  })
})
