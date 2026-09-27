/**
 * POST /api/escrow/refund
 *
 * Refund all remaining escrowed funds back to the client.
 * Can be triggered by the client (voluntary cancellation) or an admin.
 *
 * Idempotency:
 *   Requires an "Idempotency-Key" header (or `idempotencyKey` body field).
 *
 * Body:
 *   contractId  string (UUID)
 *   reason      string
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAnyRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { withIdempotency } from '@/lib/idempotency'
import { escrowService, EscrowError, escrowErrorToHttpStatus } from '@/lib/escrow'
import { dispatchNotification } from '@/lib/notifications'

export const POST = withAnyRbac(
  ['escrow:refund', 'admin:contracts_freeze'],
  withIdempotency('escrow_refund', async (
    _request: NextRequest,
    auth: RbacContext,
    body: Record<string, unknown>
  ) => {
  try {
    const result = await escrowService.refundEscrow({
      contractId: body.contractId as string,
      callerWalletAddress: auth.walletAddress,
      reason: body.reason as string,
    })

    const amount = `${result.contract.totalAmount} ${result.contract.currency}`
    await Promise.all([
      dispatchNotification(result.contract.clientId, 'wallet_activity', {
        contractId: result.contract.id,
        description: 'Escrow funds were refunded to your wallet',
        amount,
        txHash: result.refundTxHash,
      }),
      dispatchNotification(result.contract.freelancerId, 'escrow_refunded', {
        contractId: result.contract.id,
        amount,
        txHash: result.refundTxHash,
      }),
    ])

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
)
