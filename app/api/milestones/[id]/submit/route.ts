export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { sql } from '@/lib/db'
import { dispatchNotification } from '@/lib/notifications'

// Only the contract freelancer can submit a milestone (status must be pending or in_progress)
export const POST = withRbac('milestone:submit', async (request: NextRequest, auth: RbacContext) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const body = await request.json().catch(() => ({}))
    const { deliverables } = body

    // Fetch milestone with contract info to verify freelancer role
    const [milestone] = await sql`
      SELECT m.*, c.freelancer_id, c.client_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })

    // Must have a contract and caller must be the freelancer
    if (!milestone.contract_id || milestone.freelancer_id !== auth.userId) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    const submittableStatuses = ['pending', 'in_progress']
    if (!submittableStatuses.includes(milestone.status)) {
      return NextResponse.json(
        { error: `Cannot submit a milestone with status '${milestone.status}'`, code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }

    const [updated] = await sql`
      UPDATE milestones SET
        status              = 'submitted',
        submitted_at        = NOW(),
        deliverables        = COALESCE(${deliverables ? JSON.stringify(deliverables) : null}, deliverables),
        submission_notes    = ${body.submission_notes || null},
        revision_requested  = FALSE,
        updated_at          = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    // Record submission in history
    await sql`
      INSERT INTO milestone_submission_history (
        milestone_id,
        submission_type,
        submitted_by,
        deliverable_notes,
        deliverable_links
      ) VALUES (
        ${id},
        'submitted',
        ${auth.userId},
        ${body.submission_notes || null},
        ${body.deliverable_links ? JSON.stringify(body.deliverable_links) : null}
      )
    `

    await dispatchNotification(milestone.client_id, 'milestone_submitted', {
      milestoneId: updated.id,
      milestoneName: updated.title,
      contractId: milestone.contract_id,
    })

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to submit milestone', code: 'MILESTONE_SUBMIT_FAILED' }, { status: 500 })
  }
})
