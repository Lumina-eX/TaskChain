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
import { GET as listDisputes } from '@/app/api/admin/disputes/route'
import { GET as getDispute, PATCH as patchDispute } from '@/app/api/admin/disputes/[id]/route'

const mockSql = vi.mocked(sql)
const mockReadToken = vi.mocked(readAccessToken)
const mockVerifyToken = vi.mocked(verifyAccessToken)

function asAdmin() {
  mockReadToken.mockReturnValue('token')
  mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti' })
  // First sql call in checkAdmin/withAdmin resolves the admin user
  mockSql.mockResolvedValueOnce([{ id: 1, user_type: 'admin', is_banned: false }] as never)
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/disputes', () => {
  it('returns list of disputes', async () => {
    asAdmin()
    const disputes = [{ id: 1, status: 'open', reason: 'test' }]
    mockSql
      .mockResolvedValueOnce(disputes as never)
      .mockResolvedValueOnce([{ total: 1 }] as never)

    const req = new NextRequest('http://localhost/api/admin/disputes')
    const res = await listDisputes(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.disputes).toHaveLength(1)
    expect(body.pagination.total).toBe(1)
  })

  it('rejects invalid status filter', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/disputes?status=bogus')
    const res = await listDisputes(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_STATUS')
  })
})

describe('GET /api/admin/disputes/[id]', () => {
  it('returns 404 for unknown dispute', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([] as never)
    const req = new NextRequest('http://localhost/api/admin/disputes/999')
    const res = await getDispute(req, makeCtx('999'))
    expect(res.status).toBe(404)
  })

  it('returns dispute detail', async () => {
    asAdmin()
    const dispute = { id: 5, status: 'open', job_title: 'Fix bug' }
    mockSql.mockResolvedValueOnce([dispute] as never)
    const req = new NextRequest('http://localhost/api/admin/disputes/5')
    const res = await getDispute(req, makeCtx('5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispute.id).toBe(5)
  })

  it('returns 400 for non-numeric id', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/disputes/abc')
    const res = await getDispute(req, makeCtx('abc'))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/disputes/[id]', () => {
  it('updates dispute status', async () => {
    asAdmin()
    mockSql
      .mockResolvedValueOnce([{ id: 3 }] as never)  // existing check
      .mockResolvedValueOnce([{ id: 3, status: 'resolved', resolution: 'Closed', resolved_at: new Date(), updated_at: new Date() }] as never) // update

    const req = new NextRequest('http://localhost/api/admin/disputes/3', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', resolution: 'Closed by admin' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchDispute(req, makeCtx('3'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispute.status).toBe('resolved')
  })

  it('returns 422 on invalid body', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/disputes/3', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid_status' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchDispute(req, makeCtx('3'))
    expect(res.status).toBe(422)
  })

  it('returns 400 when body is empty of updates', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/disputes/3', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchDispute(req, makeCtx('3'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('EMPTY_UPDATE')
  })
})
