export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { activityService } from '@/lib/activity'
import { dispatchNotification } from '@/lib/notifications'

// POST /api/milestones/:id/request-changes - Request revisions on a submitted milestone
export const POST = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const body = await request.json().catch(() => ({}))
    const { revision_notes } = body

    if (!revision_notes || typeof revision_notes !== 'string' || revision_notes.trim().length === 0) {
      return NextResponse.json(
        { error: 'Field "revision_notes" is required and must not be empty', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    // Fetch milestone with contract info to verify client role
    const [milestone] = await sql`
      SELECT m.*, c.client_id, c.freelancer_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })
    }

    // Only client can request changes
    if (!milestone.contract_id || milestone.client_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    // Can only request changes on submitted milestones
    if (milestone.status !== 'submitted') {
      return NextResponse.json(
        { error: `Cannot request changes on a milestone with status '${milestone.status}'`, code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }

    // Update milestone status to in_progress with revision flag
    const [updated] = await sql`
      UPDATE milestones SET
        status              = 'in_progress',
        revision_requested  = TRUE,
        revision_count      = COALESCE(revision_count, 0) + 1,
        last_reviewed_at    = NOW(),
        last_reviewed_by    = ${user.id},
        updated_at          = NOW()
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
        revision_notes
      ) VALUES (
        ${id},
        'revision_requested',
        ${milestone.freelancer_id},
        ${user.id},
        ${revision_notes}
      )
    `

    // Log activity
    activityService.log({
      actorId: user.id,
      milestoneId: id,
      contractId: milestone.contract_id,
      actionType: 'milestone_revision_requested',
      description: `Revisions requested for milestone "${updated.title}"`,
      metadata: { revision_notes, revision_count: updated.revision_count },
    }).catch((err: unknown) => console.error('[activity] Failed to log milestone_revision_requested:', err))

    // Notify freelancer
    await dispatchNotification(milestone.freelancer_id, 'milestone_revision_requested', {
      milestoneId: updated.id,
      milestoneName: updated.title,
      contractId: milestone.contract_id,
      revisionNotes: revision_notes,
    })

    return NextResponse.json({ 
      milestone: updated,
      message: 'Revision request sent successfully'
    })
  } catch (error) {
    console.error('[milestone-request-changes] Error:', error)
    return NextResponse.json(
      { error: 'Failed to request changes', code: 'REQUEST_CHANGES_FAILED' },
      { status: 500 }
    )
  }
})
