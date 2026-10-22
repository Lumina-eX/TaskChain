export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { activityService } from '@/lib/activity'

type RouteContext = { params: Promise<{ id: string }> }

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

    const [dispute] = await sql`
      SELECT d.*, j.escrow_contract_id
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      WHERE d.id = ${id}
    `
    if (!dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (dispute.status === 'resolved') {
      return NextResponse.json(
        { error: 'Dispute is already resolved', code: 'ALREADY_RESOLVED' },
        { status: 409 }
      )
    }

    const [updated] = await sql`
      UPDATE disputes
      SET status = 'resolved',
          resolution = ${resolution},
          resolved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    await sql`
      UPDATE jobs
      SET escrow_status = ${newState}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${dispute.job_id}
    `

    activityService
      .log({
        actorId: auth.userId,
        disputeId: id,
        actionType: 'dispute_resolved',
        description: `Dispute resolved: ${resolution}`,
        metadata: { newState, resolution },
      })
      .catch((err: unknown) => console.error('[activity] Failed to log dispute_resolved:', err))

    return NextResponse.json(
      {
        message: 'Dispute resolved',
        disputeId: id,
        resolution,
        dispute: updated,
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
