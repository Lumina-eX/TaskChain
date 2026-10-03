/**
 * POST /api/proposals/[id]/accept
 *
 * Client accepts a freelancer proposal. Atomically:
 *   - marks the proposal Accepted (rejects siblings)
 *   - creates a Draft / Pending Funding contract linked to the proposal
 *   - seeds milestones from the proposal breakdown (or request body)
 *   - initializes job escrow_status to pending (Pending Funding)
 *
 * Only the job's client may call this endpoint. Freelancers are rejected.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx, resolveUserIdByWallet } from '@/lib/auth/middleware'
import {
  proposalAcceptanceService,
  ProposalAcceptanceError,
  proposalErrorToHttpStatus,
  type ProposalMilestoneBreakdown,
} from '@/lib/proposals'

type RouteCtx = { params: Promise<{ id: string }> }

export const POST = withAuthCtx(async (request: NextRequest, auth, context: RouteCtx) => {
  const { id: idParam } = await context.params
  const proposalId = Number(idParam)
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return NextResponse.json(
      { error: 'Invalid proposal id', code: 'VALIDATION' },
      { status: 400 }
    )
  }

  const actorUserId = await resolveUserIdByWallet(auth.walletAddress)
  if (actorUserId == null) {
    return NextResponse.json(
      { error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' },
      { status: 401 }
    )
  }

  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text.trim()) {
      body = JSON.parse(text) as Record<string, unknown>
    }
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  try {
    const result = await proposalAcceptanceService.acceptProposal({
      proposalId,
      actorUserId,
      terms: typeof body.terms === 'string' ? body.terms : undefined,
      milestones: body.milestones as ProposalMilestoneBreakdown[] | undefined,
    })

    return NextResponse.json(
      {
        proposalId: result.proposal.id,
        proposalStatus: result.proposal.status,
        jobId: result.job.id,
        jobStatus: result.job.status,
        contractId: result.contract.id,
        contractStatus: result.contract.status,
        proposalLinked: result.contract.proposalId === result.proposal.id,
        escrowStatus: result.escrowStatus,
        milestonesCreated: result.milestones.length,
        milestones: result.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          amount: m.amount,
          status: m.status,
        })),
        auditEvents: result.auditEvents.map((e) => e.event),
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof ProposalAcceptanceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: proposalErrorToHttpStatus(err) }
      )
    }
    console.error('[proposals/accept] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
