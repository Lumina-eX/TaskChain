export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

// Only the contract freelancer can submit a milestone (status must be pending or in_progress)
export const POST = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const body = await request.json().catch(() => ({}))
    const { deliverables } = body

    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    // Fetch milestone with contract info to verify freelancer role
    const [milestone] = await sql`
      SELECT m.*, c.freelancer_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })

    // Must have a contract and caller must be the freelancer
    if (!milestone.contract_id || milestone.freelancer_id !== user.id) {
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
        status       = 'submitted',
        submitted_at = NOW(),
        deliverables = COALESCE(${deliverables ? JSON.stringify(deliverables) : null}, deliverables),
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to submit milestone', code: 'MILESTONE_SUBMIT_FAILED' }, { status: 500 })
  }
})
