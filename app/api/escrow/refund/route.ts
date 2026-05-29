/**
 * POST /api/escrow/refund
 *
 * Refund all remaining escrowed funds back to the client.
 * Can be triggered by the client (voluntary cancellation) or an admin.
 *
 * Body:
 *   contractId  string (UUID)
 *   reason      string
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
    const result = await escrowService.refundEscrow({
      contractId: body.contractId as string,
      callerWalletAddress: auth.walletAddress,
      reason: body.reason as string,
    })

    return NextResponse.json({
      contractId: result.contract.id,
      contractStatus: result.contract.status,
      escrowStatus: result.contract.escrowStatus,
      refundTxHash: result.refundTxHash,
      cancelledAt: result.contract.cancelledAt,
      cancellationReason: result.contract.cancellationReason,
    })
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }
    console.error('[escrow/refund] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
