import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { toastSuccess, toastError, pushMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/wallet-provider', () => ({
  useStellarWallet: () => ({
    address: null,
    network: 'UNKNOWN',
    isWrongNetwork: false,
    isConnecting: false,
    connect: vi.fn(),
  }),
  truncateStellarAddress: (address: string) => address,
  networkLabel: (network: string) => network,
  REQUIRED_NETWORK: 'TESTNET',
}))

import { SecurityDashboard } from './security-client'

const remoteSession = {
  id: 1,
  status: 'active' as const,
  current: false,
  device: {
    browser: 'Chrome',
    os: 'Windows',
    type: 'desktop' as const,
    label: 'Chrome on Windows',
  },
  ipAddress: '203.0.113.10',
  loginAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: '2026-01-02T00:00:00.000Z',
  expiresAt: '2030-01-01T00:00:00.000Z',
  revokedAt: null,
}

const currentSession = {
  ...remoteSession,
  id: 2,
  current: true,
  device: { ...remoteSession.device, label: 'Firefox on macOS' },
  ipAddress: '203.0.113.10',
}

function mockSessionsFetch(
  sessions: unknown[],
  alerts: unknown[] = [],
  revokeResponse: { ok: boolean; status?: number; body?: unknown } = {
    ok: true,
    body: { data: { id: 1, status: 'revoked' } },
  }
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.includes('/revoke')) {
      return Promise.resolve({
        ok: revokeResponse.ok,
        status: revokeResponse.status ?? (revokeResponse.ok ? 200 : 409),
        json: async () =>
          revokeResponse.body ?? { error: 'Failed to revoke session' },
      }) as Promise<Response>
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ data: { sessions, alerts } }),
    }) as Promise<Response>
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SecurityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders sessions and distinguishes the current device', async () => {
    mockSessionsFetch([remoteSession, currentSession])

    render(<SecurityDashboard />)

    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('Firefox on macOS')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('This device')).toBeInTheDocument()
  })

  it('shows the empty state when there are no active sessions', async () => {
    mockSessionsFetch([])
    render(<SecurityDashboard />)
    expect(await screen.findByText('No active sessions.')).toBeInTheDocument()
  })

  it('shows an error state and retries on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Failed to load sessions' }),
        }) as Promise<Response>
      )
    )

    render(<SecurityDashboard />)

    expect(
      await screen.findByText('Failed to load sessions')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
  })

  it('confirms before revoking and only then updates the UI', async () => {
    const fetchMock = mockSessionsFetch([remoteSession, currentSession])

    render(<SecurityDashboard />)

    const revokeButton = await screen.findByRole('button', { name: 'Revoke' })
    fireEvent.click(revokeButton)

    // Confirmation dialog is shown and no request has been made yet.
    expect(
      await screen.findByText('Revoke this session?')
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /revoke session/i }))

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Session revoked')
    })

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === 'POST' && String(url).includes('/sessions/1/revoke')
      )
    ).toBe(true)

    // The revoked session moves out of the active list.
    expect(screen.queryByText('Chrome on Windows')).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /revoked \(1\)/i })
    ).toBeInTheDocument()

    // Radix tabs activate on mouseDown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /revoked \(1\)/i }))
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('Revoked')).toBeInTheDocument()
  })

  it('keeps the session active and surfaces an error when revocation fails', async () => {
    mockSessionsFetch([remoteSession, currentSession], [], {
      ok: false,
      status: 409,
      body: { error: 'This session is no longer active' },
    })

    render(<SecurityDashboard />)

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: /revoke session/i }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'This session is no longer active'
      )
    })

    // The dialog closes and the session is still listed as active.
    expect(screen.queryByText('Revoked')).not.toBeInTheDocument()
  })
})
