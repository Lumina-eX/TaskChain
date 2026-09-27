import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(() => undefined),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
}))

import {
  buildEarningsAnalytics,
  filterTransactions,
  formatMoney,
  getDemoEarningsTransactions,
  resolveDateRange,
  summarizeEarnings,
  type EarningsTransaction,
} from '@/lib/freelancer-earnings'

describe('freelancer earnings analytics', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')

  const sample: EarningsTransaction[] = [
    {
      id: '1',
      contractId: 'c1',
      contractTitle: 'A',
      type: 'released',
      amount: 1000,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: '2026-09-20T10:00:00.000Z',
    },
    {
      id: '2',
      contractId: 'c2',
      contractTitle: 'B',
      type: 'escrow_held',
      amount: 400,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: '2026-09-22T10:00:00.000Z',
    },
    {
      id: '3',
      contractId: 'c3',
      contractTitle: 'C',
      type: 'released',
      amount: 250,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: '2026-08-01T10:00:00.000Z',
    },
  ]

  it('formats currency with symbol and decimals', () => {
    expect(formatMoney(1200, 'USD')).toContain('1,200')
    expect(formatMoney(12.5, 'USD')).toMatch(/12\.50/)
  })

  it('resolves quick date-range presets', () => {
    const seven = resolveDateRange('7d', null, null, now)
    expect(seven.from).not.toBeNull()
    expect(seven.to).not.toBeNull()
    const spanMs = seven.to!.getTime() - seven.from!.getTime()
    expect(spanMs).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000)
    expect(spanMs).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000)

    const ytd = resolveDateRange('ytd', null, null, now)
    expect(ytd.from!.getMonth()).toBe(0)
    expect(ytd.from!.getDate()).toBe(1)

    const all = resolveDateRange('all', null, null, now)
    expect(all.from).toBeNull()
    expect(all.to).toBeNull()
  })

  it('filters transactions by date range', () => {
    const range = resolveDateRange('7d', null, null, now)
    const filtered = filterTransactions(sample, range)
    expect(filtered.map((t) => t.id)).toEqual(['2', '1'])
  })

  it('summarizes released vs pending escrow', () => {
    const summary = summarizeEarnings(sample, new Set(['c1', 'c3']))
    expect(summary.totalEarnings).toBe(1250)
    expect(summary.releasedPayments).toBe(1250)
    expect(summary.pendingEscrow).toBe(400)
    expect(summary.completedContracts).toBe(2)
  })

  it('builds analytics with empty state when no txs in range', () => {
    const analytics = buildEarningsAnalytics({
      transactions: sample,
      completedContractIds: ['c1'],
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
      now,
    })
    expect(analytics.empty).toBe(true)
    expect(analytics.transactions).toHaveLength(0)
    expect(analytics.summary.totalEarnings).toBe(0)
  })

  it('paginates transaction history', () => {
    const demo = getDemoEarningsTransactions(now)
    const analytics = buildEarningsAnalytics({
      ...demo,
      preset: 'all',
      page: 1,
      pageSize: 3,
      now,
    })
    expect(analytics.pagination.pageSize).toBe(3)
    expect(analytics.transactions).toHaveLength(3)
    expect(analytics.pagination.total).toBeGreaterThan(3)
    expect(analytics.empty).toBe(false)
  })

  it('demo seed meets acceptance chart + summary shape', () => {
    const demo = getDemoEarningsTransactions(now)
    const analytics = buildEarningsAnalytics({
      ...demo,
      preset: '30d',
      now,
    })
    expect(analytics.monthly).toHaveLength(6)
    expect(analytics.summary.totalEarnings).toBeGreaterThan(0)
    expect(analytics.summary.pendingEscrow).toBeGreaterThan(0)
    expect(analytics.summary.completedContracts).toBeGreaterThan(0)
  })
})
