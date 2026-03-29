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
  POST as freezeContract,
  DELETE as unfreezeContract,
} from '@/app/api/admin/contracts/[id]/freeze/route'

const mockSql = vi.mocked(sql)
const mockReadToken = vi.mocked(readAccessToken)
const mockVerifyToken = vi.mocked(verifyAccessToken)

function asAdmin() {
  mockReadToken.mockReturnValue('token')
  mockVerifyToken.mockReturnValue({ walletAddress: 'GADMIN', jti: 'jti' })
  mockSql.mockResolvedValueOnce([{ id: 1, user_type: 'admin', is_banned: false }] as never)
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/admin/contracts/[id]/freeze', () => {
  it('freezes a contract', async () => {
    asAdmin()
    mockSql
      .mockResolvedValueOnce([{ id: 10, is_frozen: false, status: 'in_progress' }] as never)
      .mockResolvedValueOnce([{ id: 10, is_frozen: true, frozen_at: new Date(), freeze_reason: 'Suspicious' }] as never)

    const req = new NextRequest('http://localhost/api/admin/contracts/10/freeze', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Suspicious activity' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await freezeContract(req, makeCtx('10'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contract.is_frozen).toBe(true)
  })

  it('returns 409 if already frozen', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([{ id: 10, is_frozen: true, status: 'in_progress' }] as never)

    const req = new NextRequest('http://localhost/api/admin/contracts/10/freeze', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Double freeze' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await freezeContract(req, makeCtx('10'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_FROZEN')
  })

  it('returns 404 for unknown contract', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([] as never)

    const req = new NextRequest('http://localhost/api/admin/contracts/999/freeze', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Test' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await freezeContract(req, makeCtx('999'))
    expect(res.status).toBe(404)
  })

  it('returns 422 when reason is missing', async () => {
    asAdmin()
    const req = new NextRequest('http://localhost/api/admin/contracts/10/freeze', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await freezeContract(req, makeCtx('10'))
    expect(res.status).toBe(422)
  })
})

describe('DELETE /api/admin/contracts/[id]/freeze', () => {
  it('unfreezes a contract', async () => {
    asAdmin()
    mockSql
      .mockResolvedValueOnce([{ id: 10, is_frozen: true }] as never)
      .mockResolvedValueOnce([{ id: 10, is_frozen: false, updated_at: new Date() }] as never)

    const req = new NextRequest('http://localhost/api/admin/contracts/10/freeze', {
      method: 'DELETE',
    })
    const res = await unfreezeContract(req, makeCtx('10'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contract.is_frozen).toBe(false)
  })

  it('returns 409 if contract is not frozen', async () => {
    asAdmin()
    mockSql.mockResolvedValueOnce([{ id: 10, is_frozen: false }] as never)

    const req = new NextRequest('http://localhost/api/admin/contracts/10/freeze', {
      method: 'DELETE',
    })
    const res = await unfreezeContract(req, makeCtx('10'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('NOT_FROZEN')
  })
})
