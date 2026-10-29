import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  sql: Object.assign(mockSql, { raw: vi.fn() }),
}))

vi.mock('@/lib/auth/middleware', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/auth/middleware')
  >('@/lib/auth/middleware')
  const injectAuth = (handler: (...args: unknown[]) => unknown) =>
    async (request: unknown, ...rest: unknown[]) =>
      handler(request, { walletAddress: 'GWALLET', tokenJti: 'jti' }, ...rest)
  return { ...actual, withAuth: injectAuth, withAuthCtx: injectAuth }
})

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: vi.fn(async () => null),
  buildRateLimitKey: vi.fn(() => 'test-key'),
}))

import { GET } from '@/app/api/auth/sessions/route'
import { POST } from '@/app/api/auth/sessions/[id]/revoke/route'

function row() {
  return {
    id: 1,
    jti: 'secret-jti',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
    ip_address: '203.0.113.10',
    created_at: '2026-01-01T00:00:00.000Z',
    last_used_at: null,
    expires_at: '2030-01-01T00:00:00.000Z',
    revoked_at: null,
    replaced_by_jti: null,
  }
}

function revokeRequest(id: string) {
  return {
    request: new NextRequest(
      `http://localhost/api/auth/sessions/${id}/revoke`,
      { method: 'POST' }
    ),
    context: { params: Promise.resolve({ id }) },
  }
}

describe('GET /api/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the wallet sessions without sensitive fields', async () => {
    mockSql.mockResolvedValueOnce([row()])

    const response = await GET(
      new NextRequest('http://localhost/api/auth/sessions')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.sessions).toHaveLength(1)
    expect(body.data.sessions[0].id).toBe(1)
    expect(body.data.sessions[0].status).toBe('active')

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('secret-jti')
    expect(serialized).not.toContain('token_hash')
  })

  it('returns 500 when the query fails', async () => {
    mockSql.mockRejectedValueOnce(new Error('db down'))

    const response = await GET(
      new NextRequest('http://localhost/api/auth/sessions')
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.code).toBe('SESSIONS_LOAD_FAILED')
  })
})

describe('POST /api/auth/sessions/[id]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a non-numeric session id', async () => {
    const { request, context } = revokeRequest('not-a-number')
    const response = await POST(request, context)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_SESSION_ID')
  })

  it('returns 404 when the session is not owned by the wallet', async () => {
    mockSql.mockResolvedValueOnce([])
    const { request, context } = revokeRequest('9')
    const response = await POST(request, context)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe('SESSION_NOT_FOUND')
  })

  it('revokes an owned active session', async () => {
    mockSql.mockResolvedValueOnce([{ id: 9 }])
    mockSql.mockResolvedValueOnce([{ id: 9 }])
    const { request, context } = revokeRequest('9')
    const response = await POST(request, context)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toEqual({ id: 9, status: 'revoked' })
  })

  it('returns 409 when the session is no longer revocable', async () => {
    mockSql.mockResolvedValueOnce([{ id: 9 }])
    mockSql.mockResolvedValueOnce([])
    const { request, context } = revokeRequest('9')
    const response = await POST(request, context)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe('SESSION_NOT_REVOCABLE')
  })

  it('returns 500 when revocation fails unexpectedly', async () => {
    mockSql.mockRejectedValueOnce(new Error('db down'))
    const { request, context } = revokeRequest('9')
    const response = await POST(request, context)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.code).toBe('SESSION_REVOKE_FAILED')
  })
})
