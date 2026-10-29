import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DisputeResolutionPage from './page'

const mockDispute = {
  id: 42,
  job_title: 'Website Rebuild',
  reason: 'Quality issue with the final delivery',
  status: 'open',
  created_at: '2024-02-01T12:00:00.000Z',
  updated_at: '2024-02-01T12:00:00.000Z',
  raised_by_username: 'alice',
  raised_by_wallet: 'GABCDE1234',
}

const mockEvidence = {
  evidence: [
    {
      id: 7,
      file_name: 'scope-change.pdf',
      mime_type: 'application/pdf',
      file_size: 1200,
      file_hash: 'abcdef1234567890',
      description: 'Shows the disputed scope change',
      created_at: '2024-02-01T13:00:00.000Z',
      uploaded_by_username: 'alice',
    },
  ],
}

describe('DisputeResolutionPage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let payload: unknown = mockDispute
      if (url.endsWith('/api/auth/me')) payload = { role: 'admin' }
      else if (url.endsWith('/evidence')) payload = mockEvidence
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as Promise<Response>
    }))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders dispute details and evidence management UI', async () => {
    render(<DisputeResolutionPage params={{ id: '42' }} />)

    expect(screen.getByText(/evidence review/i)).toBeInTheDocument()
    expect(screen.getByText(/dispute resolution/i)).toBeInTheDocument()

    expect(await screen.findByText(/Quality issue with the final delivery/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Website Rebuild/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/alice/i).length).toBeGreaterThan(0)

    expect(screen.getByText(/choose files/i)).toBeInTheDocument()
    expect(screen.getAllByText(/submit evidence/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/scope-change\.pdf/i)).toBeInTheDocument()
    expect(screen.getAllByText(/preview/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/download/i).length).toBeGreaterThan(0)
  })

  it('shows moderator resolution controls to admins', async () => {
    render(<DisputeResolutionPage params={{ id: '42' }} />)

    expect(await screen.findByText(/moderator resolution/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolve dispute/i })).toBeInTheDocument()
  })

  it('makes a resolved dispute read-only', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let payload: unknown = {
        ...mockDispute,
        resolution: 'Split 60/40 in favour of the freelancer.',
        status: 'resolved',
      }
      if (url.endsWith('/api/auth/me')) payload = { role: 'admin' }
      else if (url.endsWith('/evidence')) payload = mockEvidence
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as Promise<Response>
    }))

    render(<DisputeResolutionPage params={{ id: '42' }} />)

    expect(await screen.findByText('Dispute resolved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit evidence/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/moderator resolution/i)).not.toBeInTheDocument()
  })
})
