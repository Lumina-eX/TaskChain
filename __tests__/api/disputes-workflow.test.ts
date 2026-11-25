import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import {
  DisputeConflictError,
  DisputeForbiddenError,
  DisputeValidationError,
} from '@/lib/disputes/types'

const { mockService } = vi.hoisted(() => ({
  mockService: {
    createDispute: vi.fn(),
    submitEvidence: vi.fn(),
    getDispute: vi.fn(),
    resolveDispute: vi.fn(),
    reconcileResolution: vi.fn(),
  },
}))

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    token: 'token' as string | null,
    payload: { walletAddress: 'GWALLET', jti: 'jti-1' } as Record<string, unknown> | null,
  },
}))

vi.mock('@/lib/auth/session', () => ({
  readAccessToken: vi.fn(() => sessionState.token),
  verifyAccessToken: vi.fn(() => sessionState.payload),
}))

vi.mock('@/lib/disputes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/disputes')>()
  return { ...actual, disputeWorkflowService: mockService }
})

import { POST as createDispute } from '@/app/api/contracts/[id]/disputes/route'
import { GET as getDispute } from '@/app/api/disputes/[id]/route'
import {
  GET as getEvidence,
  POST as submitEvidence,
} from '@/app/api/disputes/[id]/evidence/route'
import { POST as resolveDispute } from '@/app/api/disputes/[id]/resolve/route'

const CONTRACT_ID = 'b3f1c2d4-1111-4111-8111-111111111111'
const DISPUTE_ID = 'a1f2c3d4-2222-4222-8222-222222222222'

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new NextRequest(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )
}

function getRequest(url: string) {
  return new NextRequest(new Request(url))
}

const createdDispute = {
  id: DISPUTE_ID,
  contractId: CONTRACT_ID,
  status: 'open',
  reason: 'The delivered work does not match the contract',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.token = 'token'
  sessionState.payload = { walletAddress: 'GWALLET', jti: 'jti-1' }
})

describe('POST /api/contracts/:id/disputes', () => {
  it('requires authentication', async () => {
    sessionState.token = null
    const response = await createDispute(
      jsonRequest(`http://localhost/api/contracts/${CONTRACT_ID}/disputes`, {}, {
        'idempotency-key': 'key-00000001',
      }),
      context(CONTRACT_ID)
    )
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe('AUTH_REQUIRED')
  })

  it('rejects malformed ids and bodies', async () => {
    const badId = await createDispute(
      jsonRequest('http://localhost/api/contracts/42/disputes', {}),
      context('42')
    )
    expect(badId.status).toBe(400)
    expect((await badId.json()).code).toBe('INVALID_ID')

    const badBody = await createDispute(
      new NextRequest(
        new Request(`http://localhost/api/contracts/${CONTRACT_ID}/disputes`, {
          method: 'POST',
          body: 'not-json',
          headers: { 'content-type': 'application/json' },
        })
      ),
      context(CONTRACT_ID)
    )
    expect(badBody.status).toBe(400)
    expect((await badBody.json()).code).toBe('INVALID_JSON')
  })

  it('requires an idempotency key', async () => {
    const response = await createDispute(
      jsonRequest(`http://localhost/api/contracts/${CONTRACT_ID}/disputes`, {
        reason: 'The delivered work does not match the contract',
        milestoneId: 'milestone-1',
      }),
      context(CONTRACT_ID)
    )
    expect(response.status).toBe(422)
    expect((await response.json()).code).toBe('DISPUTE_VALIDATION_ERROR')
  })

  it('creates a dispute and returns 201', async () => {
    mockService.createDispute.mockResolvedValue({
      dispute: createdDispute,
      contractStatus: 'disputed',
      replayed: false,
    })

    const response = await createDispute(
      jsonRequest(
        `http://localhost/api/contracts/${CONTRACT_ID}/disputes`,
        {
          reason: 'The delivered work does not match the contract',
          milestoneId: 'milestone-1',
          evidence: [{ type: 'url', url: 'https://proof.test/1' }],
        },
        { 'idempotency-key': 'key-00000001' }
      ),
      context(CONTRACT_ID)
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.dispute.id).toBe(DISPUTE_ID)
    expect(body.contractStatus).toBe('disputed')
    expect(mockService.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: CONTRACT_ID,
        actorWalletAddress: 'GWALLET',
        idempotencyKey: 'key-00000001',
      })
    )
  })

  it('replays an idempotent creation with 200', async () => {
    mockService.createDispute.mockResolvedValue({
      dispute: createdDispute,
      contractStatus: 'disputed',
      replayed: true,
    })

    const response = await createDispute(
      jsonRequest(
        `http://localhost/api/contracts/${CONTRACT_ID}/disputes`,
        { reason: 'The delivered work does not match the contract', milestoneId: 'm-1' },
        { 'idempotency-key': 'key-00000001' }
      ),
      context(CONTRACT_ID)
    )

    expect(response.status).toBe(200)
    expect((await response.json()).replayed).toBe(true)
  })

  it('maps authorization and conflict errors consistently', async () => {
    mockService.createDispute.mockRejectedValueOnce(new DisputeForbiddenError())
    const forbidden = await createDispute(
      jsonRequest(
        `http://localhost/api/contracts/${CONTRACT_ID}/disputes`,
        { reason: 'The delivered work does not match the contract' },
        { 'idempotency-key': 'key-00000002' }
      ),
      context(CONTRACT_ID)
    )
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).code).toBe('DISPUTE_FORBIDDEN')

    mockService.createDispute.mockRejectedValueOnce(
      new DisputeConflictError('already active', 'DISPUTE_ALREADY_EXISTS', {
        existingDisputeId: DISPUTE_ID,
      })
    )
    const conflict = await createDispute(
      jsonRequest(
        `http://localhost/api/contracts/${CONTRACT_ID}/disputes`,
        { reason: 'The delivered work does not match the contract' },
        { 'idempotency-key': 'key-00000003' }
      ),
      context(CONTRACT_ID)
    )
    expect(conflict.status).toBe(409)
    const conflictBody = await conflict.json()
    expect(conflictBody.existingDisputeId).toBe(DISPUTE_ID)
  })
})

describe('GET /api/disputes/:id', () => {
  it('returns the dispute for an authorized actor', async () => {
    mockService.getDispute.mockResolvedValue({
      dispute: createdDispute,
      evidence: [],
      resolutionAttempt: null,
      attempts: [],
      auditTrail: [],
    })

    const response = await getDispute(
      getRequest(`http://localhost/api/disputes/${DISPUTE_ID}`),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(200)
    expect((await response.json()).dispute.id).toBe(DISPUTE_ID)
  })

  it('returns 403 for unauthorized users without leaking details', async () => {
    mockService.getDispute.mockRejectedValue(new DisputeForbiddenError())

    const response = await getDispute(
      getRequest(`http://localhost/api/disputes/${DISPUTE_ID}`),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('DISPUTE_FORBIDDEN')
    expect(body.evidence).toBeUndefined()
  })
})

describe('POST /api/disputes/:id/evidence', () => {
  it('stores evidence references and returns 201', async () => {
    mockService.submitEvidence.mockResolvedValue({
      evidence: [{ id: 'evidence-1', referenceUrl: 'https://proof.test/1' }],
      duplicates: [],
    })

    const response = await submitEvidence(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/evidence`,
        { references: [{ type: 'url', url: 'https://proof.test/1' }] },
        { 'idempotency-key': 'evidence-key-01' }
      ),
      context(DISPUTE_ID)
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.evidence).toHaveLength(1)
    expect(mockService.submitEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ disputeId: DISPUTE_ID, actorWalletAddress: 'GWALLET' })
    )
  })

  it('reports a fully duplicate submission as 200 with no new rows', async () => {
    mockService.submitEvidence.mockResolvedValue({
      evidence: [],
      duplicates: ['https://proof.test/1'],
    })

    const response = await submitEvidence(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/evidence`,
        { references: [{ type: 'url', url: 'https://proof.test/1' }] },
        { 'idempotency-key': 'evidence-key-02' }
      ),
      context(DISPUTE_ID)
    )

    expect(response.status).toBe(200)
    expect((await response.json()).replayed).toBe(true)
  })

  it('rejects evidence without references or description', async () => {
    const response = await submitEvidence(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/evidence`,
        {},
        { 'idempotency-key': 'evidence-key-03' }
      ),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(422)
  })

  it('maps forbidden submissions to 403', async () => {
    mockService.submitEvidence.mockRejectedValue(new DisputeForbiddenError())

    const response = await submitEvidence(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/evidence`,
        { references: [{ type: 'url', url: 'https://proof.test/2' }] },
        { 'idempotency-key': 'evidence-key-04' }
      ),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(403)
  })

  it('lists evidence for authorized actors', async () => {
    mockService.getDispute.mockResolvedValue({
      dispute: createdDispute,
      evidence: [{ id: 'evidence-1' }],
      resolutionAttempt: null,
      attempts: [],
      auditTrail: [],
    })

    const response = await getEvidence(
      getRequest(`http://localhost/api/disputes/${DISPUTE_ID}/evidence`),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(200)
    expect((await response.json()).evidence).toHaveLength(1)
  })
})

describe('POST /api/disputes/:id/resolve', () => {
  const attempt = {
    id: 'attempt-1',
    status: 'confirmed',
    outcome: 'resolved_freelancer',
    txHash: 'tx-1',
  }

  it('returns 200 once the resolution is confirmed on-chain', async () => {
    mockService.resolveDispute.mockResolvedValue({
      state: 'confirmed',
      dispute: { ...createdDispute, status: 'resolved_freelancer' },
      attempt,
      contractStatus: 'completed',
      replayed: false,
      retryable: false,
    })

    const response = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        {
          outcome: 'resolved_freelancer',
          reasons: 'Evidence shows the freelancer delivered the agreed work',
          metadata: { evidenceReviewed: true },
        },
        { 'idempotency-key': 'resolve-key-001' }
      ),
      context(DISPUTE_ID)
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.state).toBe('confirmed')
    expect(body.contractStatus).toBe('completed')
    expect(mockService.resolveDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        disputeId: DISPUTE_ID,
        actorWalletAddress: 'GWALLET',
        outcome: 'resolved_freelancer',
        idempotencyKey: 'resolve-key-001',
      })
    )
  })

  it('returns 202 while the transaction is pending', async () => {
    mockService.resolveDispute.mockResolvedValue({
      state: 'pending',
      dispute: createdDispute,
      attempt: { ...attempt, status: 'pending', txHash: 'tx-pending' },
      contractStatus: 'disputed',
      replayed: false,
      retryable: true,
    })

    const response = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-002' }
      ),
      context(DISPUTE_ID)
    )

    expect(response.status).toBe(202)
    expect((await response.json()).state).toBe('pending')
  })

  it('distinguishes recoverable RPC failures (503) from reverted transactions (502)', async () => {
    mockService.resolveDispute.mockResolvedValueOnce({
      state: 'failed',
      dispute: createdDispute,
      attempt,
      contractStatus: 'disputed',
      replayed: false,
      retryable: true,
    })

    const recoverable = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-003' }
      ),
      context(DISPUTE_ID)
    )
    expect(recoverable.status).toBe(503)

    mockService.resolveDispute.mockResolvedValueOnce({
      state: 'failed',
      dispute: createdDispute,
      attempt,
      contractStatus: 'disputed',
      replayed: false,
      retryable: false,
    })

    const reverted = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-004' }
      ),
      context(DISPUTE_ID)
    )
    expect(reverted.status).toBe(502)
  })

  it('validates the resolution reason and outcome before calling the service', async () => {
    const missingReason = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'short' },
        { 'idempotency-key': 'resolve-key-005' }
      ),
      context(DISPUTE_ID)
    )
    expect(missingReason.status).toBe(422)

    const badOutcome = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'refund-now', reasons: 'A sufficiently long resolution reason' },
        { 'idempotency-key': 'resolve-key-006' }
      ),
      context(DISPUTE_ID)
    )
    expect(badOutcome.status).toBe(422)
    expect(mockService.resolveDispute).not.toHaveBeenCalled()
  })

  it('maps duplicate resolutions and forbidden actors to 409/403', async () => {
    mockService.resolveDispute.mockRejectedValueOnce(
      new DisputeConflictError('already resolved', 'RESOLUTION_ALREADY_FINALISED')
    )
    const conflict = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-007' }
      ),
      context(DISPUTE_ID)
    )
    expect(conflict.status).toBe(409)

    mockService.resolveDispute.mockRejectedValueOnce(new DisputeForbiddenError())
    const forbidden = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-008' }
      ),
      context(DISPUTE_ID)
    )
    expect(forbidden.status).toBe(403)
  })

  it('supports reconciling a pending resolution', async () => {
    mockService.reconcileResolution.mockResolvedValue({
      state: 'confirmed',
      dispute: createdDispute,
      attempt,
      contractStatus: 'completed',
      replayed: true,
      retryable: false,
    })

    const response = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { reconcile: true },
        { 'idempotency-key': 'resolve-key-009' }
      ),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(200)
    expect(mockService.reconcileResolution).toHaveBeenCalledWith(DISPUTE_ID, 'GWALLET')

    mockService.reconcileResolution.mockResolvedValue(null)
    const none = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { reconcile: true },
        { 'idempotency-key': 'resolve-key-010' }
      ),
      context(DISPUTE_ID)
    )
    expect(none.status).toBe(409)
  })

  it('rejects invalid JSON bodies with 400', async () => {
    const response = await resolveDispute(
      new NextRequest(
        new Request(`http://localhost/api/disputes/${DISPUTE_ID}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{bad',
        })
      ),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(400)
  })

  it('maps validation errors from the service to 422', async () => {
    mockService.resolveDispute.mockRejectedValue(
      new DisputeValidationError('metadata exceeds the 16 KB limit')
    )
    const response = await resolveDispute(
      jsonRequest(
        `http://localhost/api/disputes/${DISPUTE_ID}/resolve`,
        { outcome: 'resolved_client', reasons: 'Refund authorised after evidence review' },
        { 'idempotency-key': 'resolve-key-011' }
      ),
      context(DISPUTE_ID)
    )
    expect(response.status).toBe(422)
  })
})
