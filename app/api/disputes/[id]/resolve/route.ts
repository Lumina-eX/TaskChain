export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { withAuthCtx } from '@/lib/auth/middleware'
import { activityService } from '@/lib/activity'
import {
  disputeWorkflowService,
  isUuid,
  parseResolveDisputeInput,
} from '@/lib/disputes'
import {
  disputeErrorResponse,
  invalidJsonResponse,
} from '@/lib/disputes/http'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_RESOLUTION_STATES = ['resolved', 'fully_released', 'refunded'] as const

/**
 * Legacy job-scoped resolution (integer dispute ids). Kept for backward
 * compatibility with the existing dashboard.
 */
const legacyResolve = withRbac('dispute:resolve', async (request: NextRequest, auth: RbacContext) => {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const id = segments[segments.length - 2] ?? ''
  try {
    const body = await request.json().catch(() => ({}))
    const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : ''
    if (!resolution) {
      return NextResponse.json(
        { error: 'Missing required field: resolution', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const newState =
      typeof body.newState === 'string' && body.newState.trim()
        ? body.newState.trim()
        : 'resolved'

    if (!(VALID_RESOLUTION_STATES as readonly string[]).includes(newState)) {
      return NextResponse.json(
        { error: `newState must be one of: ${VALID_RESOLUTION_STATES.join(', ')}`, code: 'INVALID_STATE' },
        { status: 400 }
      )
    }

    // Atomic: lock the dispute row, verify it is active, and apply both updates
    // in a single transaction so resolution can never be partially applied and
    // concurrent/duplicate resolution attempts are serialized.
    const result = await sql.begin(async (tx) => {
      const [dispute] = await tx`
        SELECT d.*, j.escrow_contract_id
        FROM disputes d
        JOIN jobs j ON d.job_id = j.id
        WHERE d.id = ${id}
        FOR UPDATE OF d
      `
      if (!dispute) {
        return { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND', status: 404 as const }
      }

      if (dispute.status === 'resolved') {
        return { error: 'Dispute is already resolved', code: 'ALREADY_RESOLVED', status: 409 as const }
      }

      if (dispute.status !== 'open' && dispute.status !== 'active') {
        return { error: 'Dispute is not active', code: 'DISPUTE_NOT_ACTIVE', status: 409 as const }
      }

      const [updated] = await tx`
        UPDATE disputes
        SET status = 'resolved',
            resolution = ${resolution},
            resolved_by = ${auth.userId},
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `

      await tx`
        UPDATE jobs
        SET escrow_status = ${newState}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${dispute.job_id}
      `

      return { dispute: updated, jobId: dispute.job_id as string }
    })

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      )
    }

    activityService
      .log({
        actorId: auth.userId,
        disputeId: id,
        actionType: 'dispute_resolved',
        description: `Dispute resolved: ${resolution}`,
        metadata: { newState, resolution, resolverId: auth.userId },
      })
      .catch((err: unknown) => console.error('[activity] Failed to log dispute_resolved:', err))

    return NextResponse.json(
      {
        message: 'Dispute resolved',
        disputeId: id,
        resolution,
        dispute: result.dispute,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve dispute', code: 'RESOLVE_FAILED' },
      { status: 500 }
    )
  }
})

/**
 * POST /api/disputes/:id/resolve
 *
 * Resolve a contract-scoped dispute. Only the arbitrator, a designated
 * decision-maker or an admin may resolve, and the escrow contract's own
 * arbiter authorization still applies on-chain.
 *
 * Body:
 *   outcome                  'resolved_client' | 'resolved_freelancer' | 'resolved_split' | 'withdrawn'
 *   reasons                  string (>= 10 chars, stored immutably)
 *   metadata?                object
 *   clientRefundAmount?      string (split only)
 *   freelancerPayoutAmount?  string (split only)
 *   retryAttemptId?          uuid (retry a failed on-chain attempt)
 *   reconcile?               boolean (verify a pending transaction)
 *
 * Headers:
 *   Idempotency-Key          string (required)
 */
export const POST = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    const { id } = await context.params

    if (!isUuid(id)) return legacyResolve(request)

    let body: Record<string, unknown>
    try {
      const parsed = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return invalidJsonResponse()
      }
      body = parsed as Record<string, unknown>
    } catch {
      return invalidJsonResponse()
    }

    try {
      if (body.reconcile === true) {
        const reconciled = await disputeWorkflowService.reconcileResolution(
          id,
          auth.walletAddress
        )
        if (!reconciled) {
          return NextResponse.json(
            {
              error: 'There is no pending resolution to reconcile',
              code: 'NO_PENDING_RESOLUTION',
            },
            { status: 409 }
          )
        }
        return NextResponse.json(reconciled, {
          status: reconciled.state === 'pending' ? 202 : 200,
        })
      }

      const parsed = parseResolveDisputeInput(
        body,
        request.headers.get('idempotency-key')
      )

      const result = await disputeWorkflowService.resolveDispute({
        disputeId: id,
        actorWalletAddress: auth.walletAddress,
        outcome: parsed.outcome,
        reasons: parsed.reasons,
        metadata: parsed.metadata,
        clientRefundAmount: parsed.clientRefundAmount,
        freelancerPayoutAmount: parsed.freelancerPayoutAmount,
        idempotencyKey: parsed.idempotencyKey,
        retryAttemptId: parsed.retryAttemptId,
      })

      const status =
        result.state === 'confirmed' ? 200 : result.state === 'pending' ? 202 : result.retryable ? 503 : 502

      return NextResponse.json(result, { status })
    } catch (error) {
      return disputeErrorResponse(error)
    }
  }
)