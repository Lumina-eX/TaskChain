export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').pop()

  const userRows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const projectRows = await sql<{
    id: string; title: string; description: string; status: string
    budget_max: string | null; currency: string; deadline: string | null; created_at: string
  }[]>`
    SELECT id, title, description, status, budget_max, currency, deadline, created_at
    FROM projects WHERE id = ${id} AND client_id = ${userRows[0].id} LIMIT 1
  `
  if (!projectRows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const milestones = await sql<{
    id: string; title: string; description: string | null; amount: string
    currency: string; due_date: string | null; status: string; sort_order: number
  }[]>`
    SELECT id, title, description, amount, currency, due_date, status, sort_order
    FROM milestones WHERE project_id = ${id} ORDER BY sort_order ASC, created_at ASC
  `

  return NextResponse.json({ project: projectRows[0], milestones })
})
