import { describe, expect, it } from 'vitest'
import {
  diffSnapshots,
  type ContractSnapshot,
  type MilestoneSnapshot,
} from '@/lib/contracts/revisions'

function milestone(overrides: Partial<MilestoneSnapshot> = {}): MilestoneSnapshot {
  return {
    id: 'm1',
    title: 'Design',
    description: 'Landing page',
    amount: '100.000000',
    currency: 'USDC',
    due_date: '2026-01-10T00:00:00.000Z',
    status: 'pending',
    sort_order: 0,
    ...overrides,
  }
}

function snapshot(overrides: Partial<ContractSnapshot> = {}): ContractSnapshot {
  return {
    contract: { total_amount: '100.000000', currency: 'USDC', terms: 'Original terms' },
    milestones: [milestone()],
    ...overrides,
  }
}

describe('diffSnapshots', () => {
  it('returns no changes for identical snapshots', () => {
    const diff = diffSnapshots(snapshot(), snapshot())
    expect(diff.contract).toEqual([])
    expect(diff.milestones).toEqual([])
  })

  it('highlights budget changes on the contract and a milestone', () => {
    const current = snapshot({
      contract: { total_amount: '250.000000', currency: 'USDC', terms: 'Original terms' },
      milestones: [milestone({ amount: '250.000000' })],
    })
    const diff = diffSnapshots(snapshot(), current)

    expect(diff.contract).toEqual([
      { field: 'budget', from: '100.000000', to: '250.000000' },
    ])
    expect(diff.milestones[0].kind).toBe('changed')
    expect(diff.milestones[0].changes).toContainEqual({
      field: 'budget',
      from: '100.000000',
      to: '250.000000',
    })
  })

  it('treats numeric formatting differences as unchanged', () => {
    const diff = diffSnapshots(
      snapshot(),
      snapshot({ contract: { total_amount: '100', currency: 'USDC', terms: 'Original terms' } }),
    )
    expect(diff.contract).toEqual([])
  })

  it('highlights deadline changes', () => {
    const current = snapshot({
      milestones: [milestone({ due_date: '2026-02-01T00:00:00.000Z' })],
    })
    const diff = diffSnapshots(snapshot(), current)

    expect(diff.milestones[0].changes).toContainEqual({
      field: 'deadline',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    })
  })

  it('highlights scope changes in title, description and contract terms', () => {
    const current = snapshot({
      contract: { total_amount: '100.000000', currency: 'USDC', terms: 'New terms' },
      milestones: [milestone({ title: 'Design & build', description: 'Full site' })],
    })
    const diff = diffSnapshots(snapshot(), current)

    expect(diff.contract).toContainEqual({ field: 'scope', from: 'Original terms', to: 'New terms' })
    expect(diff.milestones[0].changes).toEqual([
      { field: 'scope', from: 'Design', to: 'Design & build' },
      { field: 'scope', from: 'Landing page', to: 'Full site' },
    ])
  })

  it('detects added and removed milestones', () => {
    const current = snapshot({
      milestones: [
        milestone({ id: 'm2', title: 'New milestone', sort_order: 1 }),
      ],
    })
    const diff = diffSnapshots(snapshot(), current)

    expect(diff.milestones).toEqual(
      expect.arrayContaining([
        { id: 'm2', title: 'New milestone', kind: 'added', changes: [] },
        { id: 'm1', title: 'Design', kind: 'removed', changes: [] },
      ]),
    )
  })

  it('highlights status changes', () => {
    const diff = diffSnapshots(
      snapshot(),
      snapshot({ milestones: [milestone({ status: 'approved' })] }),
    )
    expect(diff.milestones[0].changes).toContainEqual({
      field: 'status',
      from: 'pending',
      to: 'approved',
    })
  })
})
