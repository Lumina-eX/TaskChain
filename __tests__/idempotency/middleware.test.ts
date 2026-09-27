import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import { withIdempotency } from '@/lib/idempotency/middleware'
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
} from '@/lib/idempotency/errors'

vi.mock('@/lib/idempotency/service', () => ({
  idempotencyService: { run: vi.fn() },
  IdempotencyService: class {},
}))

import { idempotencyService } from '@/lib/idempotency/service'

const mockRun = vi.mocked(idempotencyService.run)
const KEY = 'test-key-1234567890abcd'
const AUTH = { walletAddress: 'GABC' }

function makeRequest(options: {
  body?: unknown
  key?: string
  rawBody?: string
}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.key) headers['Idempotency-Key'] = options.key
  return new NextRequest('http://localhost/api/escrow/fund', {
    method: 'POST',
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('withIdempotency', () => {
  it('returns 400 KEY_REQUIRED when no key is supplied', async () => {
    const handler = vi.fn()
    const wrapped = withIdempotency('escrow_fund', handler)

    const res = await wrapped(makeRequest({ body: { contractId: 'c-1' } }), AUTH)

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    expect(mockRun).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 400 KEY_INVALID for a malformed key', async () => {
    const wrapped = withIdempotency('escrow_fund', vi.fn())

    const res = await wrapped(
      makeRequest({ body: { contractId: 'c-1' }, key: 'short' }),
      AUTH
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('IDEMPOTENCY_KEY_INVALID')
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_JSON for an unparsable body', async () => {
    const wrapped = withIdempotency('escrow_fund', vi.fn())

    const res = await wrapped(
      makeRequest({ rawBody: 'not-json', key: KEY }),
      AUTH
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_JSON')
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('executes the handler and passes the parsed body', async () => {
    mockRun.mockImplementation(async (params) => ({
      ...(await params.handler()),
      replayed: false,
    }))
    const handler = vi.fn(async () => NextResponse.json({ contractId: 'c-1' }, { status: 200 }))
    const wrapped = withIdempotency('escrow_fund', handler)

    const res = await wrapped(
      makeRequest({ body: { contractId: 'c-1' }, key: KEY }),
      AUTH
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ contractId: 'c-1' })
    expect(res.headers.get('Idempotency-Replayed')).toBe('false')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][2]).toEqual({ contractId: 'c-1' })
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ key: KEY, operationType: 'escrow_fund' })
    )
  })

  it('accepts the key from the request body', async () => {
    mockRun.mockImplementation(async (params) => ({
      ...(await params.handler()),
      replayed: false,
    }))
    const wrapped = withIdempotency('escrow_fund', vi.fn(async () => NextResponse.json({ ok: true })))

    await wrapped(makeRequest({ body: { contractId: 'c-1', idempotencyKey: KEY } }), AUTH)

    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ key: KEY }))
  })

  it('replays a stored response and marks the header', async () => {
    mockRun.mockResolvedValue({ status: 201, body: { contractId: 'c-1' }, replayed: true })
    const handler = vi.fn()
    const wrapped = withIdempotency('escrow_fund', handler)

    const res = await wrapped(makeRequest({ body: { contractId: 'c-1' }, key: KEY }), AUTH)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ contractId: 'c-1' })
    expect(res.headers.get('Idempotency-Replayed')).toBe('true')
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 409 with Retry-After while a duplicate is in progress', async () => {
    mockRun.mockRejectedValue(new IdempotencyInProgressError())
    const wrapped = withIdempotency('escrow_fund', vi.fn())

    const res = await wrapped(makeRequest({ body: { contractId: 'c-1' }, key: KEY }), AUTH)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('IDEMPOTENCY_IN_PROGRESS')
    expect(res.headers.get('Retry-After')).toBe('1')
  })

  it('returns 409 when a key is reused with a different payload', async () => {
    mockRun.mockRejectedValue(new IdempotencyKeyReusedError())
    const wrapped = withIdempotency('escrow_fund', vi.fn())

    const res = await wrapped(makeRequest({ body: { contractId: 'c-2' }, key: KEY }), AUTH)

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})
