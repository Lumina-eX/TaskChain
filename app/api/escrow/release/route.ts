/**
 * POST /api/escrow/release
 *
 * Release funds for an approved milestone to the freelancer.
 * Only the contract client can trigger a release.
 *
 * Body:
 *   contractId   string (UUID)
 *   milestoneId  string (UUID)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { escrowService, EscrowError, escrowErrorToHttpStatus } from '@/lib/escrow'

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

  try {
    const result = await escrowService.releaseFunds({
      contractId: body.contractId as string,
      milestoneId: body.milestoneId as string,
      callerWalletAddress: auth.walletAddress,
    })

    return NextResponse.json({
      milestoneId: result.milestone.id,
      milestoneStatus: result.milestone.status,
      releaseTxHash: result.releaseTxHash,
      paidAt: result.milestone.paidAt,
      contractId: result.contract.id,
      contractStatus: result.contract.status,
      escrowStatus: result.contract.escrowStatus,
      allMilestonesPaid: result.allMilestonesPaid,
    })
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }
    console.error('[escrow/release] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
