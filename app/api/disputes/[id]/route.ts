export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuthCtx } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }
type UserRow = { id: string | number; role: string }
type DisputeRow = {
  client_id: string | number
  freelancer_id: string | number | null
  [key: string]: unknown
}

export const GET = withAuthCtx(async (_request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  try {
    const users = (await sql`
      SELECT id, role FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `) as UserRow[]
    const user = users[0]
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    const disputes = (await sql`
      SELECT d.*, j.title as job_title, j.client_id, j.freelancer_id,
             u.username as raised_by_username, u.wallet_address as raised_by_wallet
      FROM disputes d JOIN jobs j ON d.job_id = j.id JOIN users u ON d.raised_by = u.id
      WHERE d.id = ${id}
    `) as DisputeRow[]
    const dispute = disputes[0]
    if (!dispute) return NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 })

    const userId = String(user.id)
    const isParticipant = String(dispute.client_id) === userId || String(dispute.freelancer_id) === userId
    if (user.role !== 'admin' && !isParticipant) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    return NextResponse.json(dispute, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch dispute', code: 'DISPUTE_DETAILS_FAILED' }, { status: 500 })
  }
})
