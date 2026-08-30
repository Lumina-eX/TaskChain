export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

// GET /api/milestones/:id/history - Get submission history for a milestone
export const GET = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    // Verify user has access to this milestone (either client or freelancer)
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

    // Check if user is involved in this milestone
    const hasAccess = milestone.client_id === user.id || milestone.freelancer_id === user.id
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    // Fetch submission history
    const history = await sql`
      SELECT 
        h.*,
        submitter.name as submitter_name,
        submitter.wallet_address as submitter_wallet,
        reviewer.name as reviewer_name,
        reviewer.wallet_address as reviewer_wallet
      FROM milestone_submission_history h
      LEFT JOIN users submitter ON submitter.id = h.submitted_by
      LEFT JOIN users reviewer ON reviewer.id = h.reviewed_by
      WHERE h.milestone_id = ${id}
      ORDER BY h.created_at DESC
    `

    return NextResponse.json({ 
      milestone: {
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
      },
      history 
    })
  } catch (error) {
    console.error('[milestone-history] Error fetching history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submission history', code: 'HISTORY_FETCH_FAILED' },
      { status: 500 }
    )
  }
})
