/**
 * POST /api/contracts/:id/disputes
 *
 * Open a dispute on a contract. Only contract participants, the arbitrator or
 * a designated decision-maker may raise one, and only while the contract is
 * active/paused with funded escrow.
 *
 * Body:
 *   reason           string  (>= 10 chars)
 *   desiredOutcome?  string
 *   milestoneId?     uuid   (required for on-chain escrowed contracts)
 *   evidence?        Array<{ type, url, label? }>
 *
 * Headers:
 *   Idempotency-Key  string  (required; a replay returns the original dispute)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

import { withAuthCtx } from '@/lib/auth/middleware'
import {
  disputeWorkflowService,
  isUuid,
  parseCreateDisputeInput,
} from '@/lib/disputes'
import {
  disputeErrorResponse,
  invalidIdResponse,
  invalidJsonResponse,
} from '@/lib/disputes/http'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    const { id } = await context.params
    if (!isUuid(id)) return invalidIdResponse('contract')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return invalidJsonResponse()
    }

    try {
      const parsed = parseCreateDisputeInput(
        body,
        request.headers.get('idempotency-key')
      )

      const result = await disputeWorkflowService.createDispute({
        contractId: id,
        actorWalletAddress: auth.walletAddress,
        reason: parsed.reason,
        desiredOutcome: parsed.desiredOutcome,
        milestoneId: parsed.milestoneId,
        evidence: parsed.evidence,
        idempotencyKey: parsed.idempotencyKey,
      })

      return NextResponse.json(
        {
          dispute: result.dispute,
          contractStatus: result.contractStatus,
          replayed: result.replayed,
        },
        { status: result.replayed ? 200 : 201 }
      )
    } catch (error) {
      return disputeErrorResponse(error)
    }
  }
)
