import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: { query } }))

import { TxRecoveryService } from '@/lib/tx-recovery/service'

const hash = 'a'.repeat(64)
const contractId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333', tx_hash: hash, network: 'stellar',
  contract_id: contractId, milestone_id: null, user_id: userId, action_type: 'escrow_fund',
  status: 'pending', retry_count: 0, max_retries: 3, last_polled_at: null,
  next_poll_at: '2026-09-26T07:35:00Z', confirmed_at: null, error_code: null,
  error_message: null, metadata: {}, created_at: '2026-09-26T07:30:00Z',
  updated_at: '2026-09-26T07:30:00Z', ...overrides,
})

describe('TxRecoveryService', () => {
  beforeEach(() => query.mockReset())

  it('rejects malformed transaction hashes', async () => {
    const service = new TxRecoveryService()
    await expect(service.submitTransaction({ txHash: 'bad', network: 'stellar', actionType: 'escrow_fund', contractId, userId }))
      .rejects.toMatchObject({ code: 'INVALID_TX_HASH', httpStatus: 422 })
  })

  it('registers a transaction and pending audit event in one statement', async () => {
    query.mockResolvedValueOnce([row()])
    const service = new TxRecoveryService()
    const result = await service.submitTransaction({ txHash: hash, network: 'stellar', actionType: 'escrow_fund', contractId, userId })
    expect(result.isDuplicate).toBe(false)
    expect(query.mock.calls[0][0]).toContain('transaction_lifecycle_events')
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (tx_hash) DO NOTHING')
  })

  it('rejects replay of a hash with different context', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row({ contract_id: contractId })])
    const service = new TxRecoveryService()
    await expect(service.submitTransaction({
      txHash: hash, network: 'stellar', actionType: 'contract_deploy', contractId, userId,
    })).rejects.toMatchObject({ code: 'TX_HASH_CONTEXT_CONFLICT', httpStatus: 409 })
  })

  it('keeps an unconfirmed transaction pending and schedules a retry', async () => {
    query.mockResolvedValueOnce([])
    const service = new TxRecoveryService({ verifier: async () => ({ status: 'pending' }) })
    await expect(service.verifyAndSyncTransaction(service['mapRow'](row()))).resolves.toBe('pending')
    expect(query.mock.calls[0][0]).toContain("status = 'pending'")
  })

  it('expires a transaction when the retry budget is exhausted', async () => {
    query.mockResolvedValueOnce([{ id: row().id }])
    const service = new TxRecoveryService({ verifier: async () => ({ status: 'pending' }) })
    await expect(service.verifyAndSyncTransaction(service['mapRow'](row({ retry_count: 2 })))).resolves.toBe('expired')
    expect(query.mock.calls[0][1][1]).toBe('expired')
  })

  it('atomically gates domain sync and audit on the pending-to-success transition', async () => {
    query.mockResolvedValueOnce([{ id: row().id }])
    const service = new TxRecoveryService({ verifier: async () => ({ status: 'success', ledger: 42 }) })
    await expect(service.verifyAndSyncTransaction(service['mapRow'](row()))).resolves.toBe('success')
    const statement = query.mock.calls[0][0] as string
    expect(statement).toContain("status='pending'")
    expect(statement).toContain('domain_update AS')
    expect(statement).toContain('transaction_lifecycle_events')
  })

  it('returns a structured not-found error', async () => {
    query.mockResolvedValueOnce([])
    await expect(new TxRecoveryService().getTransactionStatus(hash))
      .rejects.toMatchObject({ code: 'TX_NOT_FOUND', httpStatus: 404 })
  })
})
