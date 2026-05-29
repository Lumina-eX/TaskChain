/**
 * POST /api/escrow/dispute/resolve
 *
 * Resolve an open dispute. Admin only.
 *
 * Body:
 *   disputeId                string (UUID)
 *   outcome                  'resolved_client' | 'resolved_freelancer' | 'resolved_split' | 'withdrawn'
 *   resolutionNotes          string
 *   clientRefundAmount?      string  — required when outcome = 'resolved_split'
 *   freelancerPayoutAmount?  string  — required when outcome = 'resolved_split'
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, AdminContext } from '@/lib/auth/adminMiddleware'
import {
  escrowService,
  EscrowError,
  EscrowDisputeNotFoundError,
  escrowErrorToHttpStatus,
} from '@/lib/escrow'

const VALID_OUTCOMES = [
  'resolved_client',
  'resolved_freelancer',
  'resolved_split',
  'withdrawn',
] as const

type Outcome = (typeof VALID_OUTCOMES)[number]

export async function POST(request: NextRequest) {
  return withAdmin(async (req: NextRequest, auth: AdminContext) => {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return Response.json(
        { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    if (!body.outcome || !VALID_OUTCOMES.includes(body.outcome as Outcome)) {
      return Response.json(
        {
          error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`,
          code: 'INVALID_OUTCOME',
        },
        { status: 400 }
      )
    }

    try {
      const result = await escrowService.resolveDispute({
        disputeId: body.disputeId as string,
        resolverUserId: auth.userId,
        outcome: body.outcome as Outcome,
        resolutionNotes: body.resolutionNotes as string,
        clientRefundAmount: body.clientRefundAmount as string | undefined,
        freelancerPayoutAmount: body.freelancerPayoutAmount as string | undefined,
      })

      return Response.json({
        disputeId: result.dispute.id,
        disputeStatus: result.dispute.status,
        resolutionNotes: result.dispute.resolutionNotes,
        resolvedAt: result.dispute.resolvedAt,
        clientRefundAmount: result.dispute.clientRefundAmount,
        freelancerPayoutAmount: result.dispute.freelancerPayoutAmount,
        contractId: result.contract.id,
        contractStatus: result.contract.status,
        escrowStatus: result.contract.escrowStatus,
      })
    } catch (err) {
      if (err instanceof EscrowDisputeNotFoundError) {
        return Response.json(
          { error: err.message, code: err.code },
          { status: 404 }
        )
      }
      if (err instanceof EscrowError) {
        return Response.json(
          { error: err.message, code: err.code },
          { status: escrowErrorToHttpStatus(err) }
        )
      }
      console.error('[escrow/dispute/resolve] Unexpected error:', err)
      return Response.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })(request)
}
