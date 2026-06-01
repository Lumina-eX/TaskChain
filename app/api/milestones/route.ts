export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const body = await request.json()
    const { project_id, title, description, amount, currency, due_date, sort_order, deliverables } = body

    if (!project_id || !title || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, title, amount', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    // Verify caller is the project owner (client)
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    const [project] = await sql`SELECT id FROM projects WHERE id = ${project_id} AND client_id = ${user.id} LIMIT 1`
    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied', code: 'PROJECT_NOT_FOUND' }, { status: 404 })
    }

    const [milestone] = await sql`
      INSERT INTO milestones (project_id, title, description, amount, currency, due_date, sort_order, deliverables)
      VALUES (
        ${project_id},
        ${title},
        ${description ?? null},
        ${amount},
        ${currency ?? 'USDC'},
        ${due_date ?? null},
        ${sort_order ?? 0},
        ${JSON.stringify(deliverables ?? [])}
      )
      RETURNING *
    `

    return NextResponse.json({ milestone }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create milestone', code: 'MILESTONE_CREATE_FAILED' }, { status: 500 })
  }
})
