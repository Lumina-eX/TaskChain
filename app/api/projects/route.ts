export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export const GET = withAuth(async (_request: NextRequest, auth) => {
  const userRows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (!userRows.length) {
    return NextResponse.json({ projects: [] })
  }

  const rows = await sql<{
    id: string; title: string; description: string; status: string
    budget_max: string | null; currency: string; deadline: string | null
    created_at: string; milestones_count: number; completed_milestones: number
  }[]>`
    SELECT
      p.id, p.title, p.description, p.status, p.budget_max, p.currency,
      p.deadline, p.created_at,
      COUNT(m.id)::int                                        AS milestones_count,
      COUNT(m.id) FILTER (WHERE m.status = 'approved')::int  AS completed_milestones
    FROM projects p
    LEFT JOIN milestones m ON m.project_id = p.id
    WHERE p.client_id = ${userRows[0].id}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `

  return NextResponse.json({ projects: rows })
})
