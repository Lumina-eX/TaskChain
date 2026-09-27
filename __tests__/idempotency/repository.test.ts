import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

import { sql } from '@/lib/db'
import { IdempotencyRepository } from '@/lib/idempotency/repository'

const mockSql = sql as unknown as ReturnType<typeof vi.fn>

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    idempotency_key: 'key-1234567890abcdef',
    operation_type: 'escrow_fund',
    request_hash: 'hash-1',
    request_payload: { contractId: 'c-1' },
    response_payload: null,
    response_status: null,
    status: 'in_progress',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IdempotencyRepository', () => {
  const repo = new IdempotencyRepository()

  it('claims a new key when the insert returns a row', async () => {
    mockSql.mockResolvedValueOnce([row()])

    const result = await repo.claim({
      key: 'key-1234567890abcdef',
      operationType: 'escrow_fund',
      requestHash: 'hash-1',
      requestPayload: { contractId: 'c-1' },
      ttlHours: 24,
    })

    expect(result.claimed).toBe(true)
    expect(result.record?.status).toBe('in_progress')
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('falls back to the existing record when the insert conflicts', async () => {
    mockSql
      .mockResolvedValueOnce([]) // ON CONFLICT … DO UPDATE WHERE → no row
      .mockResolvedValueOnce([row({ status: 'completed', response_status: 200, response_payload: { ok: true } })])

    const result = await repo.claim({
      key: 'key-1234567890abcdef',
      operationType: 'escrow_fund',
      requestHash: 'hash-1',
      requestPayload: { contractId: 'c-1' },
      ttlHours: 24,
    })

    expect(result.claimed).toBe(false)
    expect(result.record?.status).toBe('completed')
    expect(result.record?.responseStatus).toBe(200)
    expect(result.record?.responsePayload).toEqual({ ok: true })
    expect(mockSql).toHaveBeenCalledTimes(2)
  })

  it('parses string-serialised JSON payloads', async () => {
    mockSql.mockResolvedValueOnce([
      row({ request_payload: '{"contractId":"c-9"}', response_payload: '{"ok":true}' }),
    ])

    const record = await repo.get('key-1234567890abcdef', 'escrow_fund')

    expect(record?.requestPayload).toEqual({ contractId: 'c-9' })
    expect(record?.responsePayload).toEqual({ ok: true })
  })

  it('returns null when no record exists', async () => {
    mockSql.mockResolvedValueOnce([])
    expect(await repo.get('missing-key-123456', 'escrow_fund')).toBeNull()
  })

  it('marks a completed record and returns it', async () => {
    mockSql.mockResolvedValueOnce([row({ status: 'completed', response_status: 201, response_payload: { ok: true } })])

    const record = await repo.complete(
      'key-1234567890abcdef',
      'escrow_fund',
      { ok: true },
      201,
      24
    )

    expect(record?.status).toBe('completed')
    expect(record?.responseStatus).toBe(201)
  })

  it('purges expired records and returns the count', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'r-1' }, { id: 'r-2' }])
    expect(await repo.purgeExpired()).toBe(2)
  })

  it('marks failed and removes records', async () => {
    mockSql.mockResolvedValue([])
    await repo.markFailed('key-1234567890abcdef', 'escrow_fund')
    await repo.remove('key-1234567890abcdef', 'escrow_fund')
    expect(mockSql).toHaveBeenCalledTimes(2)
  })
})
