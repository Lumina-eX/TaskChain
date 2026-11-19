import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (
    handler: (request: NextRequest, auth: { walletAddress: string; tokenJti: string }) => unknown,
  ) =>
    (request: NextRequest) => handler(request, { walletAddress: 'GWALLET', tokenJti: 'jti' }),
}))

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

import * as route from '@/app/api/contracts/[id]/revisions/route'
import { sql } from '@/lib/db'

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>
const contractId = '11111111-1111-1111-1111-111111111111'

function queueSql(responses: unknown[]) {
  for (const response of responses) {
    sqlMock.mockResolvedValueOnce(response)
  }
}

function makeRequest() {
  return new NextRequest(new Request(`http://localhost/api/contracts/${contractId}/revisions`))
}

const baselineSnapshot = {
  contract: { total_amount: '100.000000', currency: 'USDC', terms: 'Original terms' },
  milestones: [
    {
      id: 'm1',
      title: 'Design',
      description: null,
      amount: '100.000000',
      currency: 'USDC',
      due_date: '2026-01-10T00:00:00.000Z',
      status: 'pending',
      sort_order: 0,
    },
  ],
}

const updatedSnapshot = {
  contract: { total_amount: '200.000000', currency: 'USDC', terms: 'Original terms' },
  milestones: [
    {
      ...baselineSnapshot.milestones[0],
      amount: '200.000000',
      due_date: '2026-02-01T00:00:00.000Z',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/contracts/[id]/revisions', () => {
  it('is read-only: only a GET handler is exported', () => {
    expect(typeof route.GET).toBe('function')
    expect(route).not.toHaveProperty('POST')
    expect(route).not.toHaveProperty('PATCH')
    expect(route).not.toHaveProperty('PUT')
    expect(route).not.toHaveProperty('DELETE')
  })

  it('returns 404 when the authenticated wallet has no user row', async () => {
    queueSql([[]])

    const response = await route.GET(makeRequest())
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('USER_NOT_FOUND')
  })

  it('returns 404 when the contract does not exist', async () => {
    queueSql([[{ id: 'user-1' }], []])

    const response = await route.GET(makeRequest())
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('CONTRACT_NOT_FOUND')
  })

  it('forbids users who are not the client or freelancer', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [{ id: contractId, client_id: 'client', freelancer_id: 'freelancer' }],
    ])

    const response = await route.GET(makeRequest())
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('ACCESS_DENIED')
  })

  it('returns revisions with author, timestamp and computed changes to a party', async () => {
    queueSql([
      [{ id: 'client' }],
      [{ id: contractId, client_id: 'client', freelancer_id: 'freelancer' }],
      [
        {
          id: 'rev-1',
          snapshot: baselineSnapshot,
          change_type: 'baseline',
          author_wallet: null,
          created_at: '2026-01-01T00:00:00.000Z',
          display_name: null,
          username: null,
          wallet_address: null,
        },
        {
          id: 'rev-2',
          snapshot: updatedSnapshot,
          change_type: 'update',
          author_wallet: 'GWALLET',
          created_at: '2026-01-05T00:00:00.000Z',
          display_name: 'Ola',
          username: 'olatechy0',
          wallet_address: 'GWALLET',
        },
      ],
    ])

    const response = await route.GET(makeRequest())
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.contractId).toBe(contractId)
    expect(body.revisions).toHaveLength(2)

    const [baseline, update] = body.revisions
    expect(baseline.revision_number).toBe(1)
    expect(baseline.changes).toBeNull()
    expect(baseline.author).toBeNull()

    expect(update.revision_number).toBe(2)
    expect(update.author).toEqual({
      display_name: 'Ola',
      username: 'olatechy0',
      wallet_address: 'GWALLET',
    })
    expect(update.created_at).toBe('2026-01-05T00:00:00.000Z')
    expect(update.changes.contract).toEqual([
      { field: 'budget', from: '100.000000', to: '200.000000' },
    ])
    expect(update.changes.milestones[0].changes).toEqual(
      expect.arrayContaining([
        { field: 'budget', from: '100.000000', to: '200.000000' },
        {
          field: 'deadline',
          from: '2026-01-10T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
        },
      ]),
    )
  })

  it('returns 500 when the database fails', async () => {
    sqlMock.mockRejectedValueOnce(new Error('db down'))

    const response = await route.GET(makeRequest())
    expect(response.status).toBe(500)
    expect((await response.json()).code).toBe('REVISIONS_FETCH_FAILED')
  })
})
