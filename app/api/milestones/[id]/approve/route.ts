export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAnyRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { sql } from '@/lib/db'
import { activityService } from '@/lib/activity'

// Only the contract client can approve (or reject) a submitted milestone
export const POST = withAnyRbac(['milestone:approve', 'milestone:reject'], async (request: NextRequest, auth: RbacContext) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const body = await request.json().catch(() => ({}))
    const { action, rejection_reason } = body // action: 'approve' | 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: "Field 'action' must be 'approve' or 'reject'", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json(
        { error: "Field 'rejection_reason' is required when rejecting", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    // Fetch milestone with contract info to verify client role
    const [milestone] = await sql`
      SELECT m.*, c.client_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })

    if (!milestone.contract_id || milestone.client_id !== auth.userId) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    if (milestone.status !== 'submitted') {
      return NextResponse.json(
        { error: `Cannot ${action} a milestone with status '${milestone.status}'`, code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const [updated] = await sql`
      UPDATE milestones SET
        status           = ${newStatus},
        approved_at      = ${action === 'approve' ? sql`NOW()` : null},
        rejection_reason = ${action === 'reject' ? rejection_reason : null},
        last_reviewed_at = NOW(),
        last_reviewed_by = ${auth.userId},
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    // Record in submission history
    await sql`
      INSERT INTO milestone_submission_history (
        milestone_id,
        submission_type,
        submitted_by,
        reviewed_by,
        feedback
      ) VALUES (
        ${id},
        ${action === 'approve' ? 'approved' : 'rejected'},
        ${milestone.freelancer_id},
        ${auth.userId},
        ${action === 'reject' ? rejection_reason : body.approval_notes || null}
      )
    `

    activityService.log({
      actorId: auth.userId,
      milestoneId: id,
      contractId: milestone.contract_id,
      actionType: action === 'approve' ? 'milestone_approved' : 'milestone_rejected',
      description: action === 'approve'
        ? `Milestone "${updated.title}" approved`
        : `Milestone "${updated.title}" rejected: "${rejection_reason}"`,
      metadata: { action, rejection_reason: rejection_reason ?? null },
    }).catch((err: unknown) => console.error('[activity] Failed to log milestone approval:', err))

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to process milestone approval', code: 'MILESTONE_APPROVE_FAILED' }, { status: 500 })
  }
})
