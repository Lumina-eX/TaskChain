import { describe, it, expect, vi, beforeEach } from 'vitest'

import { IdempotencyService } from '@/lib/idempotency/service'
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  IdempotencyStorageError,
} from '@/lib/idempotency/errors'
import { hashRequestPayload } from '@/lib/idempotency/validation'
import type {
  IdempotencyOperationType,
  IdempotencyRecord,
  IIdempotencyRepository,
} from '@/lib/idempotency/types'

const OPERATION: IdempotencyOperationType = 'escrow_fund'
const KEY = 'test-key-1234567890abcd'

function makeRecord(overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord {
  return {
    id: 'record-1',
    idempotencyKey: KEY,
    operationType: OPERATION,
    requestHash: hashRequestPayload({ contractId: 'c-1' }),
    requestPayload: { contractId: 'c-1' },
    responsePayload: null,
    responseStatus: null,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }
}

function makeRepo(): IIdempotencyRepository {
  return {
    claim: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    complete: vi.fn().mockResolvedValue(null),
    markFailed: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue(0),
  }
}

describe('IdempotencyService.run', () => {
  let repo: IIdempotencyRepository
  let service: IdempotencyService

  beforeEach(() => {
    repo = makeRepo()
    service = new IdempotencyService(repo, () => 24)
  })

  it('executes and stores the response for a new key', async () => {
    vi.mocked(repo.claim).mockResolvedValue({ claimed: true, record: makeRecord() })
    const handler = vi.fn().mockResolvedValue({ status: 200, body: { contractId: 'c-1' } })

    const outcome = await service.run({
      key: KEY,
      operationType: OPERATION,
      requestPayload: { contractId: 'c-1' },
      handler,
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ status: 200, body: { contractId: 'c-1' }, replayed: false })
    expect(repo.complete).toHaveBeenCalledWith(
      KEY,
      OPERATION,
      { contractId: 'c-1' },
      200,
      24
    )
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('replays the stored response without re-running the handler', async () => {
    vi.mocked(repo.claim).mockResolvedValue({
      claimed: false,
      record: makeRecord({
        status: 'completed',
        responseStatus: 201,
        responsePayload: { contractId: 'c-1', deployTxHash: 'tx-1' },
      }),
    })
    const handler = vi.fn()

    const outcome = await service.run({
      key: KEY,
      operationType: OPERATION,
      requestPayload: { contractId: 'c-1' },
      handler,
    })

    expect(handler).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      status: 201,
      body: { contractId: 'c-1', deployTxHash: 'tx-1' },
      replayed: true,
    })
  })

  it('rejects a key reused with a different payload', async () => {
    vi.mocked(repo.claim).mockResolvedValue({
      claimed: false,
      record: makeRecord({ status: 'completed', requestHash: hashRequestPayload({ contractId: 'OTHER' }) }),
    })

    await expect(
      service.run({
        key: KEY,
        operationType: OPERATION,
        requestPayload: { contractId: 'c-1' },
        handler: vi.fn(),
      })
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError)
  })

  it('rejects a duplicate request while the original is in progress', async () => {
    vi.mocked(repo.claim).mockResolvedValue({
      claimed: false,
      record: makeRecord({ status: 'in_progress' }),
    })

    await expect(
      service.run({
        key: KEY,
        operationType: OPERATION,
        requestPayload: { contractId: 'c-1' },
        handler: vi.fn(),
      })
    ).rejects.toBeInstanceOf(IdempotencyInProgressError)
  })

  it('does not cache a non-2xx response and releases the claim', async () => {
    vi.mocked(repo.claim).mockResolvedValue({ claimed: true, record: makeRecord() })
    const handler = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: 'conflict', code: 'ESCROW_INVALID_STATE' },
    })

    const outcome = await service.run({
      key: KEY,
      operationType: OPERATION,
      requestPayload: { contractId: 'c-1' },
      handler,
    })

    expect(outcome.status).toBe(409)
    expect(outcome.replayed).toBe(false)
    expect(repo.complete).not.toHaveBeenCalled()
    expect(repo.markFailed).toHaveBeenCalledWith(KEY, OPERATION)
  })

  it('releases the claim when the handler throws', async () => {
    vi.mocked(repo.claim).mockResolvedValue({ claimed: true, record: makeRecord() })
    const handler = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(
      service.run({
        key: KEY,
        operationType: OPERATION,
        requestPayload: { contractId: 'c-1' },
        handler,
      })
    ).rejects.toThrow('boom')

    expect(repo.markFailed).toHaveBeenCalledWith(KEY, OPERATION)
  })

  it('wraps store failures in IdempotencyStorageError', async () => {
    vi.mocked(repo.claim).mockRejectedValue(new Error('db down'))

    await expect(
      service.run({
        key: KEY,
        operationType: OPERATION,
        requestPayload: { contractId: 'c-1' },
        handler: vi.fn(),
      })
    ).rejects.toBeInstanceOf(IdempotencyStorageError)
  })

  it('uses the configured TTL when storing a response', async () => {
    const customService = new IdempotencyService(repo, () => 48)
    vi.mocked(repo.claim).mockResolvedValue({ claimed: true, record: makeRecord() })

    await customService.run({
      key: KEY,
      operationType: OPERATION,
      requestPayload: { contractId: 'c-1' },
      handler: vi.fn().mockResolvedValue({ status: 200, body: { ok: true } }),
    })

    expect(repo.claim).toHaveBeenCalledWith(
      expect.objectContaining({ ttlHours: 48 })
    )
    expect(repo.complete).toHaveBeenCalledWith(KEY, OPERATION, { ok: true }, 200, 48)
  })
})
