export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

// Only the contract client can approve (or reject) a submitted milestone
export const POST = withAuth(async (request: NextRequest, auth) => {
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

    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    // Fetch milestone with contract info to verify client role
    const [milestone] = await sql`
      SELECT m.*, c.client_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })

    if (!milestone.contract_id || milestone.client_id !== user.id) {
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
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to process milestone approval', code: 'MILESTONE_APPROVE_FAILED' }, { status: 500 })
  }
})
