import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: { query } }))
vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (handler: Function) => (request: NextRequest) => handler(request, { walletAddress: 'GTEST' }),
}))

import { POST as submit } from '@/app/api/tx-recovery/submit/route'
import { POST as poll } from '@/app/api/tx-recovery/poll/route'

describe('transaction recovery routes', () => {
  beforeEach(() => {
    query.mockReset()
    process.env.TX_RECOVERY_WORKER_SECRET = 'test-secret'
  })

  it('returns 422 for invalid submission input', async () => {
    const response = await submit(new NextRequest('http://local/api/tx-recovery/submit', {
      method: 'POST', body: JSON.stringify({ txHash: 'bad', actionType: 'escrow_fund' }),
    }))
    expect(response.status).toBe(422)
    expect((await response.json()).code).toBe('INVALID_TRANSACTION')
  })

  it('protects the polling endpoint', async () => {
    const response = await poll(new NextRequest('http://local/api/tx-recovery/poll', { method: 'POST' }))
    expect(response.status).toBe(401)
  })

  it('accepts an authorized empty polling cycle', async () => {
    query.mockResolvedValueOnce([])
    const response = await poll(new NextRequest('http://local/api/tx-recovery/poll', {
      method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: '{}',
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data.processed).toBe(0)
  })
})
