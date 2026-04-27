/**
 * POST /api/escrow/fund
 *
 * Record that the client has funded the escrow contract on-chain.
 * Verifies the funding transaction before updating state.
 *
 * Body:
 *   contractId    string (UUID)
 *   fundingTxHash string  — on-chain transaction hash
 *   amount        string  — amount funded, e.g. "500.00"
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
    const result = await escrowService.fundEscrow({
      contractId: body.contractId as string,
      callerWalletAddress: auth.walletAddress,
      fundingTxHash: body.fundingTxHash as string,
      amount: body.amount as string,
    })

    return NextResponse.json({
      contractId: result.contract.id,
      escrowStatus: result.contract.escrowStatus,
      contractStatus: result.contract.status,
      fundedAt: result.fundedAt,
      fundingTxHash: result.contract.fundingTxHash,
    })
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }
    console.error('[escrow/fund] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
