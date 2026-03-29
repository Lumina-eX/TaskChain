import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  readAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))

import { sql } from '@/lib/db'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'
import { checkAdmin, withAdmin } from '@/lib/auth/admin-middleware'

const mockSql = vi.mocked(sql)
const mockReadToken = vi.mocked(readAccessToken)
const mockVerifyToken = vi.mocked(verifyAccessToken)

function makeReq(url = 'http://localhost/api/admin/test') {
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkAdmin', () => {
  it('returns 401 when no token present', async () => {
    mockReadToken.mockReturnValue(null)
    const result = await checkAdmin(makeReq())
    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('AUTH_REQUIRED')
  })

  it('returns 401 when token is invalid', async () => {
    mockReadToken.mockReturnValue('bad-token')
    mockVerifyToken.mockReturnValue(null)
    const result = await checkAdmin(makeReq())
    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    mockReadToken.mockReturnValue('valid-token')
    mockVerifyToken.mockReturnValue({ walletAddress: 'GTEST', jti: 'jti1' })
    mockSql.mockResolvedValue([{ id: 1, user_type: 'client', is_banned: false }] as never)
    const result = await checkAdmin(makeReq())
    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('ADMIN_REQUIRED')
  })

  it('returns 403 when admin user is banned', async () => {
    mockReadToken.mockReturnValue('valid-token')
    mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti2' })
    mockSql.mockResolvedValue([{ id: 2, user_type: 'admin', is_banned: true }] as never)
    const result = await checkAdmin(makeReq())
    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('ACCOUNT_BANNED')
  })

  it('returns AdminContext for valid admin', async () => {
    mockReadToken.mockReturnValue('valid-token')
    mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti3' })
    mockSql.mockResolvedValue([{ id: 5, user_type: 'admin', is_banned: false }] as never)
    const result = await checkAdmin(makeReq())
    expect(result).not.toBeInstanceOf(NextResponse)
    const ctx = result as Awaited<ReturnType<typeof checkAdmin>>
    if (ctx instanceof NextResponse) throw new Error('unexpected')
    expect(ctx.userId).toBe(5)
    expect(ctx.walletAddress).toBe('GADMIN')
  })
})

describe('withAdmin HOF', () => {
  it('calls handler with admin context on valid admin', async () => {
    mockReadToken.mockReturnValue('valid-token')
    mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti4' })
    mockSql.mockResolvedValue([{ id: 7, user_type: 'admin', is_banned: false }] as never)

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
    const route = withAdmin(handler)
    const req = makeReq()
    const res = await route(req)

    expect(handler).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
  })

  it('does not call handler when not admin', async () => {
    mockReadToken.mockReturnValue('valid-token')
    mockVerifyToken.mockReturnValue({ walletAddress: 'GUSER', jti: 'jti5' })
    mockSql.mockResolvedValue([{ id: 3, user_type: 'freelancer', is_banned: false }] as never)

    const handler = vi.fn()
    const route = withAdmin(handler)
    const res = await route(makeReq())

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })
})
