import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  sql: Object.assign(mockSql, { raw: vi.fn() }),
}))

vi.mock('@/lib/auth/crypto', () => ({
  sha256Hex: (value: string) => `hash:${value}`,
}))

import {
  groupSessionRows,
  listSecuritySessions,
  revokeWalletSession,
  type RevokeSessionResult,
} from '@/lib/auth/sessions'
import {
  buildSecurityAlerts,
  parseUserAgent,
  type SecuritySession,
} from '@/lib/auth/session-types'

interface RowOverrides {
  id?: number | string
  jti?: string
  user_agent?: string | null
  ip_address?: string | null
  created_at?: string
  last_used_at?: string | null
  expires_at?: string
  revoked_at?: string | null
  replaced_by_jti?: string | null
}

function row(overrides: RowOverrides = {}) {
  return {
    id: 1,
    jti: 'jti-1',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
    ip_address: '203.0.113.10',
    created_at: '2026-01-01T00:00:00.000Z',
    last_used_at: null,
    expires_at: '2030-01-01T00:00:00.000Z',
    revoked_at: null,
    replaced_by_jti: null,
    ...overrides,
  }
}

function session(overrides: Partial<SecuritySession> = {}): SecuritySession {
  return {
    id: 1,
    status: 'active',
    current: false,
    device: {
      browser: 'Chrome',
      os: 'Windows',
      type: 'desktop',
      label: 'Chrome on Windows',
    },
    ipAddress: '203.0.113.10',
    loginAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

describe('parseUserAgent', () => {
  it('detects desktop chrome on windows', () => {
    const device = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    )
    expect(device.browser).toBe('Chrome')
    expect(device.os).toBe('Windows')
    expect(device.type).toBe('desktop')
    expect(device.label).toBe('Chrome on Windows')
  })

  it('detects mobile safari on iOS', () => {
    const device = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1'
    )
    expect(device.os).toBe('iOS')
    expect(device.type).toBe('mobile')
    expect(device.browser).toBe('Safari')
  })

  it('handles a missing user agent safely', () => {
    expect(parseUserAgent(null)).toEqual({
      browser: 'Unknown browser',
      os: 'Unknown OS',
      type: 'unknown',
      label: 'Unknown device',
    })
  })
})

describe('groupSessionRows', () => {
  const now = Date.parse('2026-01-10T00:00:00.000Z')

  it('collapses a rotation chain into a single session', () => {
    const rows = [
      row({
        id: 3,
        jti: 'c',
        created_at: '2026-01-05T00:00:00.000Z',
        last_used_at: '2026-01-06T00:00:00.000Z',
      }),
      row({
        id: 2,
        jti: 'b',
        created_at: '2026-01-03T00:00:00.000Z',
        revoked_at: '2026-01-05T00:00:00.000Z',
        replaced_by_jti: 'c',
      }),
      row({
        id: 1,
        jti: 'a',
        created_at: '2026-01-01T00:00:00.000Z',
        revoked_at: '2026-01-03T00:00:00.000Z',
        replaced_by_jti: 'b',
      }),
    ]

    const sessions = groupSessionRows(rows, { now })

    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(1)
    expect(sessions[0].status).toBe('active')
    expect(sessions[0].loginAt).toBe('2026-01-01T00:00:00.000Z')
    expect(sessions[0].lastActiveAt).toBe('2026-01-06T00:00:00.000Z')
  })

  it('marks revoked and expired tips', () => {
    const rows = [
      row({ id: 1, jti: 'a', revoked_at: '2026-01-02T00:00:00.000Z' }),
      row({
        id: 2,
        jti: 'b',
        created_at: '2025-01-01T00:00:00.000Z',
        expires_at: '2025-06-01T00:00:00.000Z',
      }),
    ]

    const sessions = groupSessionRows(rows, { now })
    const byId = new Map(sessions.map((s) => [s.id, s]))

    expect(byId.get(1)?.status).toBe('revoked')
    expect(byId.get(2)?.status).toBe('expired')
  })

  it('flags the current session from its jti', () => {
    const rows = [
      row({ id: 1, jti: 'a' }),
      row({ id: 2, jti: 'b', created_at: '2026-01-02T00:00:00.000Z' }),
    ]

    const sessions = groupSessionRows(rows, { now, currentJti: 'a' })
    expect(sessions.find((s) => s.id === 1)?.current).toBe(true)
    expect(sessions.find((s) => s.id === 2)?.current).toBe(false)
  })

  it('never exposes token material', () => {
    const rows = [row({ id: 1, jti: 'secret-jti' })]
    const sessions = groupSessionRows(rows, { now })
    expect(JSON.stringify(sessions)).not.toContain('secret-jti')
    expect(JSON.stringify(sessions)).not.toContain('token_hash')
  })
})

describe('buildSecurityAlerts', () => {
  const now = Date.parse('2026-01-10T00:00:00.000Z')

  it('returns no alerts for a single current session', () => {
    const alerts = buildSecurityAlerts(
      [session({ current: true, loginAt: '2026-01-01T00:00:00.000Z' })],
      { now }
    )
    expect(alerts).toHaveLength(0)
  })

  it('warns about a recent sign-in from another device', () => {
    const alerts = buildSecurityAlerts(
      [
        session({
          id: 1,
          current: true,
          ipAddress: '203.0.113.10',
          loginAt: '2026-01-01T00:00:00.000Z',
        }),
        session({
          id: 2,
          ipAddress: '198.51.100.4',
          loginAt: '2026-01-09T12:00:00.000Z',
        }),
      ],
      { now }
    )

    expect(alerts.map((a) => a.id)).toContain('recent-sign-in')
    expect(alerts.map((a) => a.id)).toContain('unfamiliar-network')
    expect(
      alerts.find((a) => a.id === 'unfamiliar-network')?.severity
    ).toBe('critical')
  })

  it('reports a recent revocation', () => {
    const alerts = buildSecurityAlerts(
      [session({ status: 'revoked', revokedAt: '2026-01-08T00:00:00.000Z' })],
      { now }
    )
    expect(alerts.map((a) => a.id)).toContain('recent-revocation')
  })
})

describe('listSecuritySessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns grouped sessions and alerts', async () => {
    const rows = [row({ id: 1, jti: 'a' })]
    mockSql.mockResolvedValueOnce(rows)

    const result = await listSecuritySessions('GWALLET', null)

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].id).toBe(1)
    expect(Array.isArray(result.alerts)).toBe(true)
  })
})

describe('revokeWalletSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns not_found when the session does not belong to the wallet', async () => {
    mockSql.mockResolvedValueOnce([])
    const result: RevokeSessionResult = await revokeWalletSession('GWALLET', 7)
    expect(result).toBe('not_found')
  })

  it('revokes an owned active session', async () => {
    mockSql.mockResolvedValueOnce([{ id: 7 }])
    mockSql.mockResolvedValueOnce([{ id: 7 }])

    const result = await revokeWalletSession('GWALLET', 7)
    expect(result).toBe('revoked')
  })

  it('returns not_revocable when nothing was updated', async () => {
    mockSql.mockResolvedValueOnce([{ id: 7 }])
    mockSql.mockResolvedValueOnce([])

    const result = await revokeWalletSession('GWALLET', 7)
    expect(result).toBe('not_revocable')
  })
})
