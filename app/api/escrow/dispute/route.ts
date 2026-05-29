/**
 * POST /api/escrow/dispute
 *
 * Raise a dispute on an active contract.
 * Either the client or the freelancer can raise a dispute.
 *
 * Body:
 *   contractId       string (UUID)
 *   milestoneId?     string (UUID)  — optional, scope dispute to a milestone
 *   reason           string
 *   desiredOutcome?  string
 *   evidence?        Array<{ type, url, label? }>
 *   responseDeadline? string  — ISO date string
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import {
  escrowService,
  EscrowError,
  EscrowDisputeAlreadyActiveError,
  escrowErrorToHttpStatus,
  type DisputeRaisedBy,
} from '@/lib/escrow'

export const POST = withAuth(async (request: NextRequest, auth) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  // --- Resolve authenticated wallet to a DB user and determine their role ---
  const users = await sql`
    SELECT id, role FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (users.length === 0) {
    return NextResponse.json(
      { error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' },
      { status: 401 }
    )
  }
  const { id: userId, role } = users[0] as { id: string; role: string }

  // Map DB role to dispute_raised_by enum
  const raisedBy: DisputeRaisedBy =
    role === 'admin' ? 'admin' : role === 'client' ? 'client' : 'freelancer'

  try {
    const result = await escrowService.raiseDispute({
      contractId: body.contractId as string,
      milestoneId: body.milestoneId as string | undefined,
      raisedByUserId: userId,
      raisedBy,
      reason: body.reason as string,
      desiredOutcome: body.desiredOutcome as string | undefined,
      evidence: body.evidence as Array<{ type: string; url: string; label?: string }> | undefined,
      responseDeadline: body.responseDeadline as string | undefined,
    })

    return NextResponse.json(
      {
        disputeId: result.dispute.id,
        contractId: result.contract.id,
        contractStatus: result.contract.status,
        disputeStatus: result.dispute.status,
        raisedBy: result.dispute.raisedBy,
        createdAt: result.dispute.createdAt,
        responseDeadline: result.dispute.responseDeadline,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof EscrowDisputeAlreadyActiveError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          existingDisputeId: err.existingDisputeId,
        },
        { status: 409 }
      )
    }
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }
    console.error('[escrow/dispute] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
