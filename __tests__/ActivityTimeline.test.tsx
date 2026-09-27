import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  ActivityTimeline,
  extractTransactionHash,
  formatEventTimestamp,
  sortEventsChronologically,
  type ContractTimelineEvent,
} from '@/components/ActivityTimeline'

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span data-testid="badge" {...props}>{children}</span>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

const sampleEvents: ContractTimelineEvent[] = [
  {
    id: '2',
    actionType: 'escrow_funded',
    description: 'Escrow funded with 500 USDC',
    createdAt: '2026-09-22T12:00:00.000Z',
    actorUsername: 'client1',
    metadata: { txHash: 'abcdef0123456789abcdef0123456789abcdef01' },
  },
  {
    id: '1',
    actionType: 'contract_created',
    description: 'Contract created',
    createdAt: '2026-09-21T10:00:00.000Z',
    actorUsername: 'client1',
    metadata: {},
  },
  {
    id: '3',
    actionType: 'milestone_submitted',
    description: 'Milestone 1 submitted for review',
    createdAt: '2026-09-23T08:30:00.000Z',
    actorUsername: 'freelancer1',
    metadata: {},
  },
]

describe('ActivityTimeline helpers', () => {
  it('sorts events chronologically ascending', () => {
    const sorted = sortEventsChronologically(sampleEvents)
    expect(sorted.map((e) => e.id)).toEqual(['1', '2', '3'])
  })

  it('extracts transaction hash from metadata aliases', () => {
    expect(extractTransactionHash({ txHash: 'abc' })).toBe('abc')
    expect(extractTransactionHash({ transactionHash: 'xyz' })).toBe('xyz')
    expect(extractTransactionHash({})).toBeNull()
  })

  it('formats timestamps with date and time', () => {
    const formatted = formatEventTimestamp('2026-09-21T10:00:00.000Z')
    expect(formatted).toMatch(/2026/)
    expect(formatted.length).toBeGreaterThan(8)
  })
})

describe('ActivityTimeline component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders events in chronological order with timestamps and tx hash', () => {
    render(<ActivityTimeline events={sampleEvents} />)

    expect(screen.getByTestId('contract-activity-timeline')).toBeInTheDocument()
    expect(screen.getByText('Contract Activity Timeline')).toBeInTheDocument()
    expect(screen.getByText('Contract created')).toBeInTheDocument()
    expect(screen.getByText('Escrow funded with 500 USDC')).toBeInTheDocument()
    expect(screen.getByText(/tx:/)).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Contract created')
    expect(items[1]).toHaveTextContent('Escrow funded')
    expect(items[2]).toHaveTextContent('Milestone 1 submitted')
  })

  it('shows empty state when there are no events', () => {
    render(<ActivityTimeline events={[]} />)
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    render(<ActivityTimeline events={[]} loading />)
    expect(screen.getByTestId('timeline-loading')).toBeInTheDocument()
  })

  it('fetches activity for a contractId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [
          {
            id: 'a1',
            actionType: 'contract_created',
            description: 'Contract opened',
            createdAt: '2026-09-20T09:00:00.000Z',
            actorUsername: 'alice',
            actorWalletAddress: null,
            metadata: {},
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1, nextOffset: null, hasMore: false },
      }),
    })

    render(<ActivityTimeline contractId="11111111-1111-1111-1111-111111111111" />)

    await waitFor(() => {
      expect(screen.getByText('Contract opened')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalled()
    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(calledUrl).toContain('contractId=11111111-1111-1111-1111-111111111111')
  })
})
