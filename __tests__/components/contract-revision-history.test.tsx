import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContractRevisionHistory from '@/components/dashboard/contract-revision-history'

const milestone = (amount: string, due: string) => ({
  id: 'm-1',
  title: 'Design phase',
  description: 'Wireframes',
  amount,
  currency: 'USD',
  due_date: due,
  status: 'pending',
  sort_order: 0,
})

const revisions = [
  {
    id: 'r-1',
    revision_number: 1,
    change_type: 'baseline',
    created_at: '2026-01-01T10:00:00.000Z',
    author: null,
    snapshot: { contract: { total_amount: '1000', currency: 'USD', terms: null }, milestones: [milestone('1000', '2026-02-01T00:00:00.000Z')] },
    changes: null,
  },
  {
    id: 'r-2',
    revision_number: 2,
    change_type: 'update',
    created_at: '2026-01-05T10:00:00.000Z',
    author: { display_name: 'Ada Client', username: 'ada', wallet_address: 'GWALLET' },
    snapshot: { contract: { total_amount: '1500', currency: 'USD', terms: null }, milestones: [milestone('1500', '2026-03-01T00:00:00.000Z')] },
    changes: {
      contract: [{ field: 'budget', from: '1000', to: '1500' }],
      milestones: [
        {
          id: 'm-1',
          title: 'Design phase',
          kind: 'changed',
          changes: [
            { field: 'budget', from: '1000', to: '1500' },
            { field: 'deadline', from: '2026-02-01T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' },
          ],
        },
      ],
    },
  },
]

describe('ContractRevisionHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows author, timestamp and highlighted changes, newest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revisions }) }),
    )

    render(<ContractRevisionHistory contractId="c-1" />)

    expect(await screen.findByText('Ada Client')).toBeInTheDocument()
    expect(screen.getByText('Revision v2')).toBeInTheDocument()
    expect(screen.getByText('Initial snapshot')).toBeInTheDocument()
    expect(document.querySelector('time[datetime="2026-01-05T10:00:00.000Z"]')).toBeInTheDocument()

    // Newest revision is expanded by default and lists the diff.
    expect(await screen.findByText('Changes in this revision')).toBeInTheDocument()
    expect(screen.getAllByText('1,500').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Budget').length).toBeGreaterThan(0)
  })

  it('shows a read-only empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revisions: [] }) }),
    )

    render(<ContractRevisionHistory contractId="c-1" />)

    expect(await screen.findByText(/No revisions yet/)).toBeInTheDocument()
  })

  it('toggles a revision open and closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revisions }) }),
    )

    render(<ContractRevisionHistory contractId="c-1" />)
    const toggle = await screen.findByText('Revision v2')

    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.queryByText('Changes in this revision')).not.toBeInTheDocument(),
    )
  })
})
