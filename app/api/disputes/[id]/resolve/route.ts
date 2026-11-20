export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { activityService } from '@/lib/activity'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_RESOLUTION_STATES = ['resolved', 'fully_released', 'refunded'] as const

export const POST = withRbac('dispute:resolve', async (request: NextRequest, auth: RbacContext, context: RouteContext) => {
  const { id } = await context.params
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
