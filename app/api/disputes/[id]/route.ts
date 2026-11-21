export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuthCtx } from '@/lib/auth/middleware'
import { disputeWorkflowService, isUuid } from '@/lib/disputes'
import { disputeErrorResponse } from '@/lib/disputes/http'

type RouteContext = { params: Promise<{ id: string }> }
type UserRow = { id: string | number; role: string }
type DisputeRow = {
  client_id: string | number
  freelancer_id: string | number | null
  [key: string]: unknown
}

/**
 * GET /api/disputes/:id
 *
 * Contract-scoped disputes (UUID ids) are served by the dispute workflow,
 * which enforces participant/arbitrator authorization and only exposes
 * evidence and audit history to authorized actors.
 *
 * Job-scoped legacy disputes (integer ids) keep the original behaviour so the
 * existing dashboard continues to work.
 */
export const GET = withAuthCtx(async (request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params

  if (isUuid(id)) {
    try {
      const result = await disputeWorkflowService.getDispute(id, auth.walletAddress)
      return NextResponse.json(result, { status: 200 })
    } catch (error) {
      return disputeErrorResponse(error)
    }
  }

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
