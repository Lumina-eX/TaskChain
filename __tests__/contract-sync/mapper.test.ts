import { describe, it, expect } from 'vitest'
import { mapEventToAction } from '@/lib/contract-sync/mapper'
import type { SorobanEventPayload } from '@/lib/contract-sync/types'

function makePayload(overrides: Partial<SorobanEventPayload> = {}): SorobanEventPayload {
  return {
    event: 'init',
    contractAddress: 'CA1234',
    ledgerSequence: 1000,
    timestamp: Date.now(),
    txHash: 'abc123',
    data: [],
    ...overrides,
  }
}

describe('mapEventToAction', () => {
  it('maps init to noop', () => {
    const payload = makePayload({ event: 'init' })
    const action = mapEventToAction('init', payload)
    expect(action.kind).toBe('noop')
    expect(action.contractUpdate).toBeNull()
    expect(action.milestoneUpdate).toBeNull()
  })

  it('maps fund to contract escrow_status=funded', () => {
    const payload = makePayload({ event: 'fund' })
    const action = mapEventToAction('fund', payload)
    expect(action.kind).toBe('update_contract')
    expect(action.contractUpdate?.escrowStatus).toBe('funded')
    expect(action.contractUpdate?.contractStatus).toBe('active')
    expect(action.contractUpdate?.fundedAt).toBeDefined()
    expect(action.contractUpdate?.startedAt).toBeDefined()
    expect(action.milestoneUpdate).toBeNull()
  })

  it('maps submit to milestone status=submitted', () => {
    const payload = makePayload({ event: 'submit', milestoneId: 1 })
    const action = mapEventToAction('submit', payload)
    expect(action.kind).toBe('update_milestone')
    expect(action.milestoneUpdate?.status).toBe('submitted')
    expect(action.milestoneUpdate?.submittedAt).toBeDefined()
    expect(action.milestoneId).toBe(1)
    expect(action.contractUpdate).toBeNull()
  })

  it('maps approve to milestone status=approved', () => {
    const payload = makePayload({ event: 'approve', milestoneId: 2 })
    const action = mapEventToAction('approve', payload)
    expect(action.kind).toBe('update_milestone')
    expect(action.milestoneUpdate?.status).toBe('approved')
    expect(action.milestoneUpdate?.approvedAt).toBeDefined()
  })

  it('maps confirm to milestone status=approved', () => {
    const payload = makePayload({ event: 'confirm', milestoneId: 2 })
    const action = mapEventToAction('confirm', payload)
    expect(action.kind).toBe('update_milestone')
    expect(action.milestoneUpdate?.status).toBe('approved')
  })

  it('maps release to both contract and milestone update', () => {
    const payload = makePayload({ event: 'release', milestoneId: 1, amount: '100' })
    const action = mapEventToAction('release', payload)
    expect(action.kind).toBe('update_both')
    expect(action.contractUpdate?.escrowStatus).toBe('fully_released')
    expect(action.contractUpdate?.contractStatus).toBe('completed')
    expect(action.contractUpdate?.completedAt).toBeDefined()
    expect(action.milestoneUpdate?.status).toBe('paid')
    expect(action.milestoneUpdate?.paidAt).toBeDefined()
    expect(action.milestoneId).toBe(1)
  })

  it('maps refund to both contract and milestone update', () => {
    const payload = makePayload({ event: 'refund', milestoneId: 1, amount: '50' })
    const action = mapEventToAction('refund', payload)
    expect(action.kind).toBe('update_both')
    expect(action.contractUpdate?.escrowStatus).toBe('refunded')
    expect(action.contractUpdate?.contractStatus).toBe('cancelled')
    expect(action.milestoneUpdate?.status).toBe('refunded')
    expect(action.contractUpdate?.cancelledReason).toBe('Refunded on-chain')
  })

  it('maps dispute to contract status=disputed and milestone status=disputed', () => {
    const payload = makePayload({ event: 'dispute', milestoneId: 1 })
    const action = mapEventToAction('dispute', payload)
    expect(action.kind).toBe('update_both')
    expect(action.contractUpdate?.contractStatus).toBe('disputed')
    expect(action.milestoneUpdate?.status).toBe('disputed')
    expect(action.disputeInfo).not.toBeNull()
    expect(action.disputeInfo?.reason).toBe('Dispute raised on-chain')
  })

  it('maps resolve to contract completed and milestone paid', () => {
    const payload = makePayload({ event: 'resolve', milestoneId: 1 })
    const action = mapEventToAction('resolve', payload)
    expect(action.kind).toBe('update_both')
    expect(action.contractUpdate?.contractStatus).toBe('completed')
    expect(action.milestoneUpdate?.status).toBe('paid')
  })

  it('maps expire to milestone auto_expired', () => {
    const payload = makePayload({ event: 'expire', milestoneId: 1, amount: '100' })
    const action = mapEventToAction('expire', payload)
    expect(action.kind).toBe('update_milestone')
    expect(action.milestoneUpdate?.status).toBe('auto_expired')
    expect(action.milestoneUpdate?.rejectionReason).toBe('Milestone deadline exceeded')
    expect(action.milestoneId).toBe(1)
  })

  it('maps deadline_set to a milestone due date', () => {
    const action = mapEventToAction('deadline_set', makePayload({
      event: 'deadline_set',
      milestoneId: 3,
      deadline: 2_000_000_000,
    }))
    expect(action.kind).toBe('update_milestone')
    expect(action.milestoneUpdate?.dueDate).toBe('2033-05-18T03:33:20.000Z')
    expect(action.milestoneId).toBe(3)
  })

  it('maps deadline_expired to the expired milestone state', () => {
    const action = mapEventToAction('deadline_expired', makePayload({
      event: 'deadline_expired',
      milestoneId: 3,
    }))
    expect(action.milestoneUpdate?.status).toBe('expired')
    expect(action.milestoneId).toBe(3)
  })

  it('maps deadline_extended to an extended milestone and its new due date', () => {
    const action = mapEventToAction('deadline_extended', makePayload({
      event: 'deadline_extended',
      milestoneId: 3,
      deadline: 2_000_000_000,
      wasExpired: true,
    }))
    expect(action.milestoneUpdate?.status).toBe('extended')
    expect(action.milestoneUpdate?.dueDate).toBe('2033-05-18T03:33:20.000Z')
    expect(action.milestoneUpdate?.isOverdue).toBe(false)
  })

  it('handles unknown event as noop', () => {
    const payload = makePayload({ event: 'unknown' as any })
    const action = mapEventToAction('unknown' as any, payload)
    expect(action.kind).toBe('noop')
  })

  it('handles submit event without milestoneId gracefully', () => {
    const payload = makePayload({ event: 'submit', milestoneId: undefined })
    const action = mapEventToAction('submit', payload)
    expect(action.milestoneId).toBeNull()
  })
})
