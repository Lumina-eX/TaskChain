import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ sql: vi.fn(), getUser: vi.fn(), submit: vi.fn(), txStatus: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => m.sql(...a) }))                              // REPLACE paths if needed
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => m.getUser(...a) }))              // REPLACE
vi.mock('@/lib/escrow-chain', () => ({
  escrowChain: { submitResolution: (...a: unknown[]) => m.submit(...a), getTxStatus: (...a: unknown[]) => m.txStatus(...a) },
}))

import { POST as createDispute } from '@/app/api/contracts/[id]/disputes/route'
import { POST as addEvidence } from '@/app/api/disputes/[id]/evidence/route'
import { GET as getDispute } from '@/app/api/disputes/[id]/route'
import { POST as resolve } from '@/app/api/disputes/[id]/resolve/route'

const ID = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: ID }) }
const post = (body?: unknown) =>
  new NextRequest('http://localhost/x', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const contract = { id: ID, client_id: 'client-1', freelancer_id: 'free-1', status: 'active' }
const REASON = 'The deliverable was never provided.'
const DECISION = { outcome: 'refund_to_client', reason: 'Freelancer did not deliver the work.' }

beforeEach(() => {
  m.sql.mockReset(); m.getUser.mockReset(); m.submit.mockReset(); m.txStatus.mockReset()
  m.getUser.mockResolvedValue({ id: 'client-1' })
  process.env.DISPUTE_ARBITRATOR_IDS = 'arb-1'
})

describe('create dispute', () => {
  it('401 when unauthenticated', async () => {
    m.getUser.mockResolvedValue(null)
    expect((await createDispute(post({ reason: REASON }), ctx)).status).toBe(401)
  })
  it('400 on short reason', async () => {
    expect((await createDispute(post({ reason: 'short' }), ctx)).status).toBe(400)
  })
  it('403 for non-participants', async () => {
    m.getUser.mockResolvedValue({ id: 'stranger' })
    m.sql.mockResolvedValueOnce([contract])
    expect((await createDispute(post({ reason: REASON }), ctx)).status).toBe(403)
  })
  it('409 when the contract status is not eligible', async () => {
    m.sql.mockResolvedValueOnce([{ ...contract, status: 'completed' }])
    expect((await createDispute(post({ reason: REASON }), ctx)).status).toBe(409)
  })
  it('409 on duplicate open dispute', async () => {
    m.sql.mockResolvedValueOnce([contract]).mockResolvedValueOnce([])
    const res = await createDispute(post({ reason: REASON }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('dispute_already_open')
  })
  it('201 creates a dispute', async () => {
    m.sql.mockResolvedValueOnce([contract]).mockResolvedValueOnce([{ id: 'd1', status: 'open' }])
    expect((await createDispute(post({ reason: REASON }), ctx)).status).toBe(201)
  })
})

describe('evidence', () => {
  const body = { kind: 'url', uri: 'https://example.com/proof.png' }
  it('rejects a bad uri scheme (400)', async () => {
    expect((await addEvidence(post({ kind: 'url', uri: 'http://x.com' }), ctx)).status).toBe(400)
  })
  it('403 for non-participants', async () => {
    m.getUser.mockResolvedValue({ id: 'stranger' })
    m.sql.mockResolvedValueOnce([{ id: ID, status: 'open', client_id: 'client-1', freelancer_id: 'free-1' }])
    expect((await addEvidence(post(body), ctx)).status).toBe(403)
  })
  it('409 when the dispute is no longer open', async () => {
    m.sql.mockResolvedValueOnce([{ id: ID, status: 'resolved', client_id: 'client-1', freelancer_id: 'free-1' }])
    expect((await addEvidence(post(body), ctx)).status).toBe(409)
  })
  it('201 stores new evidence', async () => {
    m.sql.mockResolvedValueOnce([{ id: ID, status: 'open', client_id: 'client-1', freelancer_id: 'free-1' }])
      .mockResolvedValueOnce([{ id: 'e1' }])
    expect((await addEvidence(post(body), ctx)).status).toBe(201)
  })
  it('duplicate evidence returns the existing record, no new one', async () => {
    m.sql.mockResolvedValueOnce([{ id: ID, status: 'open', client_id: 'client-1', freelancer_id: 'free-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'e1' }])
    const res = await addEvidence(post(body), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).duplicate).toBe(true)
  })
})

describe('get dispute', () => {
  it('403 for users outside the contract', async () => {
    m.getUser.mockResolvedValue({ id: 'stranger' })
    m.sql.mockResolvedValueOnce([{ client_id: 'client-1', freelancer_id: 'free-1' }])
    expect((await getDispute(new NextRequest('http://localhost/x'), ctx)).status).toBe(403)
  })
})

describe('resolve', () => {
  const row = { id: ID, status: 'open', client_id: 'client-1', freelancer_id: 'free-1', escrow_contract_id: 'C123' }

  it('403 for non-arbitrators', async () => {
    m.sql.mockResolvedValueOnce([row])
    expect((await resolve(post(DECISION), ctx)).status).toBe(403)
  })
  it('403 when the arbitrator is a participant (conflict of interest)', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.sql.mockResolvedValueOnce([{ ...row, client_id: 'arb-1' }])
    const res = await resolve(post(DECISION), ctx)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('conflict_of_interest')
  })
  it('400 when split has no split_bps', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    expect((await resolve(post({ ...DECISION, outcome: 'split' }), ctx)).status).toBe(400)
  })
  it('409 when already resolved (claim finds nothing)', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: ID, status: 'resolved' }])
    const res = await resolve(post(DECISION), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_resolved')
    expect(m.submit).not.toHaveBeenCalled()
  })
  it('200: claims, submits once and confirms', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.submit.mockResolvedValue({ txHash: 'abc' })
    m.txStatus.mockResolvedValue('confirmed')
    m.sql
      .mockResolvedValueOnce([row])                                                        // load
      .mockResolvedValueOnce([{ id: ID, status: 'resolution_pending' }])                   // claim
      .mockResolvedValueOnce([])                                                           // store tx hash
      .mockResolvedValueOnce([{ id: ID, status: 'resolution_pending', resolution_tx_hash: 'abc' }]) // reconcile select
      .mockResolvedValueOnce([{ id: ID, status: 'resolved' }])                             // reconcile update
    const res = await resolve(post(DECISION), ctx)
    expect(res.status).toBe(200)
    expect(m.submit).toHaveBeenCalledTimes(1)
    expect(m.submit).toHaveBeenCalledWith({ escrowContractId: 'C123', disputeId: ID, outcome: 'refund_to_client', splitBps: undefined })
  })
  it('202 while the chain transaction is still pending', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.submit.mockResolvedValue({ txHash: 'abc' })
    m.txStatus.mockResolvedValue('pending')
    m.sql
      .mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ID, status: 'resolution_pending', resolution_tx_hash: 'abc' }])
    expect((await resolve(post(DECISION), ctx)).status).toBe(202)
  })
  it('502 and recoverable state when submission fails', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.submit.mockRejectedValue(new Error('rpc down'))
    m.sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([])
    const res = await resolve(post(DECISION), ctx)
    expect(res.status).toBe(502)
    expect(JSON.stringify(m.sql.mock.calls.at(-1))).toContain('resolution_failed')
  })
  it('concurrent resolves: exactly one submits to the chain', async () => {
    m.getUser.mockResolvedValue({ id: 'arb-1' })
    m.submit.mockResolvedValue({ txHash: 'abc' })
    m.txStatus.mockResolvedValue('confirmed')
    let claimedOnce = false
    m.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?')
      if (q.includes('JOIN contracts')) return [row]
      if (q.includes('claimed AS')) {
        if (claimedOnce) return []
        claimedOnce = true
        return [{ id: ID, status: 'resolution_pending' }]
      }
      if (q.includes('SELECT * FROM disputes')) return [{ id: ID, status: 'resolved' }]
      return []
    })
    const results = await Promise.all([resolve(post(DECISION), ctx), resolve(post(DECISION), ctx)])
    expect(m.submit).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.status).sort()).toContain(409)
  })
})