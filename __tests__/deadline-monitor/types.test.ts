import { describe, it, expect } from 'vitest'
import { DEADLINE_EXEMPT_STATUSES, getReminderWindowMs } from '@/lib/deadline-monitor/types'

describe('deadline-monitor types', () => {
  it('exempts approved, paid, and rejected milestones from deadline tracking', () => {
    expect(DEADLINE_EXEMPT_STATUSES).toEqual([
      'approved',
      'paid',
      'rejected',
      'disputed',
      'refunded',
      'expired',
      'auto_expired',
    ])
  })

  it('uses a 24 hour reminder window', () => {
    expect(getReminderWindowMs()).toBe(24 * 60 * 60 * 1000)
  })
})
