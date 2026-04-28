export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_request: NextRequest, _auth, context: RouteContext) => {
  const { id } = await context.params
  try {
    const [dispute] = await sql`
      SELECT d.*, j.title as job_title, u.username as raised_by_username, u.wallet_address as raised_by_wallet
      FROM disputes d JOIN jobs j ON d.job_id = j.id JOIN users u ON d.raised_by = u.id
      WHERE d.id = ${id}
    `
    if (!dispute) return NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 })
    return NextResponse.json(dispute, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch dispute', code: 'DISPUTE_DETAILS_FAILED' }, { status: 500 })
  }
})
