export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

// GET /api/milestones/:id/deliverables - Get all deliverables for a milestone
export const GET = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    // Verify user has access to this milestone
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

    // Fetch deliverable files from database
    const deliverables = await sql`
      SELECT 
        id,
        milestone_id,
        original_filename,
        mime_type,
        file_size,
        created_at,
        uploader_id
      FROM milestone_deliverables
      WHERE milestone_id = ${id} AND is_removed = FALSE
      ORDER BY created_at DESC
    `

    return NextResponse.json({ 
      deliverables,
      milestone: {
        id: milestone.id,
        title: milestone.title,
      }
    })
  } catch (error) {
    console.error('[milestone-deliverables] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch deliverables', code: 'DELIVERABLES_FETCH_FAILED' },
      { status: 500 }
    )
  }
})
