import { render, screen, waitFor } from '@testing-library/react'
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

describe('DisputeResolutionPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockDispute,
      }) as Response,
    ))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders dispute details and evidence UI', async () => {
    render(<DisputeResolutionPage params={{ id: '42' }} />)

    expect(screen.getByText(/review dispute/i)).toBeInTheDocument()
    expect(screen.getByText(/dispute resolution/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/Website Rebuild/i)).toBeInTheDocument()
      expect(screen.getByText(/Quality issue with the final delivery/i)).toBeInTheDocument()
      expect(screen.getByText(/alice/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /choose files/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit evidence/i })).toBeInTheDocument()
  })
})
