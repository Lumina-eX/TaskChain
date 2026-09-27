/**
 * POST /api/escrow/fund
 *
 * Record that the client has funded the escrow contract on-chain.
 * Verifies the funding transaction before updating state.
 *
 * Idempotency:
 *   Requires an "Idempotency-Key" header (or `idempotencyKey` body field).
 *
 * Body:
 *   contractId    string (UUID)
 *   fundingTxHash string  — on-chain transaction hash
 *   amount        string  — amount funded, e.g. "500.00"
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { withIdempotency } from '@/lib/idempotency'
import { escrowService, EscrowError, escrowErrorToHttpStatus } from '@/lib/escrow'
import { dispatchNotification } from '@/lib/notifications'

export const POST = withRbac('escrow:fund', withIdempotency('escrow_fund', async (
  _request: NextRequest,
  auth: RbacContext,
  body: Record<string, unknown>
) => {
  try {
    const result = await escrowService.fundEscrow({
      contractId: body.contractId as string,
      callerWalletAddress: auth.walletAddress,
      fundingTxHash: body.fundingTxHash as string,
      amount: body.amount as string,
    })

    const amount = `${body.amount} ${result.contract.currency}`
    await Promise.all([
      dispatchNotification(result.contract.clientId, 'wallet_activity', {
        contractId: result.contract.id,
        description: 'Your wallet funded the escrow contract',
        amount,
        txHash: result.contract.fundingTxHash,
      }),
      dispatchNotification(result.contract.freelancerId, 'escrow_funded', {
        contractId: result.contract.id,
        amount,
        txHash: result.contract.fundingTxHash,
      }),
    ])

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
}))
