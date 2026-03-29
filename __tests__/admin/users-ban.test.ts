import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({
  readAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: vi.fn() }))

import { sql } from '@/lib/db'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'
import {
  POST as banUser,
  DELETE as unbanUser,
} from '@/app/api/admin/users/[id]/ban/route'

const mockSql = vi.mocked(sql)
const mockReadToken = vi.mocked(readAccessToken)
const mockVerifyToken = vi.mocked(verifyAccessToken)

function asAdmin(adminId = 1) {
  mockReadToken.mockReturnValue('token')
  mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti' })
  mockSql.mockResolvedValueOnce([{ id: adminId, user_type: 'admin', is_banned: false }] as never)
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/admin/users/[id]/ban', () => {
  it('bans a user', async () => {
    asAdmin()
    mockSql
      .mockResolvedValueOnce([{ id: 42, is_banned: false, username: 'bob' }] as never)
      .mockResolvedValueOnce([{ id: 42, username: 'bob', is_banned: true, banned_at: new Date(), ban_reason: 'Fraud' }] as never)

    const req = new NextRequest('http://localhost/api/admin/users/42/ban', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Fraudulent activity' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await banUser(req, makeCtx('42'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.is_banned).toBe(true)
  })

  it('returns 400 when admin tries to ban themselves', async () => {
    asAdmin(5)
    const req = new NextRequest('http://localhost/api/admin/users/5/ban', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Self' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await banUser(req, makeCtx('5'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('SELF_BAN')
  })

  it('returns 409 if user is already banned', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([{ id: 42, is_banned: true, username: 'bob' }] as never)

    const req = new NextRequest('http://localhost/api/admin/users/42/ban', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Fraud' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await banUser(req, makeCtx('42'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_BANNED')
  })

  it('returns 404 for unknown user', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([] as never)

    const req = new NextRequest('http://localhost/api/admin/users/999/ban', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Test' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await banUser(req, makeCtx('999'))
    expect(res.status).toBe(404)
  })

  it('returns 422 when reason is missing', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/users/42/ban', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await banUser(req, makeCtx('42'))
    expect(res.status).toBe(422)
  })
})

describe('DELETE /api/admin/users/[id]/ban', () => {
  it('unbans a user', async () => {
    asAdmin()
    mockSql
      .mockResolvedValueOnce([{ id: 42, is_banned: true }] as never)
      .mockResolvedValueOnce([{ id: 42, username: 'bob', is_banned: false, updated_at: new Date() }] as never)

    const req = new NextRequest('http://localhost/api/admin/users/42/ban', {
      method: 'DELETE',
    })
    const res = await unbanUser(req, makeCtx('42'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.is_banned).toBe(false)
  })

  it('returns 409 if user is not banned', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([{ id: 42, is_banned: false }] as never)

    const req = new NextRequest('http://localhost/api/admin/users/42/ban', {
      method: 'DELETE',
    })
    const res = await unbanUser(req, makeCtx('42'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('NOT_BANNED')
  })
})
