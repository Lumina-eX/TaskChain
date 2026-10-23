// app/api/proposals/[id]/accept/route.ts
//
// POST /api/proposals/:id/accept
//
// Accepts a freelancer's proposal and atomically creates:
//   - A contract record (status='pending', escrow_status='unfunded')
//   - Milestone rows from the proposal's milestone_breakdown
//   - An audit log entry
//
// Authorization:
//   - Caller must be authenticated (Bearer JWT via withAuthCtx).
//   - Caller must be the client who owns the project.
//   - Freelancers cannot accept proposals.
//
// Error codes returned:
//   400 INVALID_UUID           — proposal ID in path is not a valid UUID
//   401 AUTH_REQUIRED          — missing or invalid JWT
//   403 FORBIDDEN              — caller is not the project client
//   404 PROPOSAL_NOT_FOUND     — no proposal with that ID
//   409 PROPOSAL_ALREADY_ACCEPTED  — proposal was already accepted
//   409 PROPOSAL_NOT_PENDING   — proposal is in a non-acceptable state
//   409 PROJECT_NOT_ACTIVE     — project is not open / in_progress
//   422 INVALID_REQUEST_BODY   — body fails schema validation
//   500 SERVER_ERROR           — unexpected failure

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthCtx } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { AcceptProposalSchema } from '@/lib/validations'
import {
  acceptProposal,
  ProposalNotFoundError,
  ProposalAlreadyAcceptedError,
  ProposalNotPendingError,
  ProjectNotActiveError,
  UnauthorizedAcceptanceError,
} from '@/lib/proposals'

// ─── Route context type (Next.js App Router) ──────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── ID validation ────────────────────────────────────────────────────────

const UUIDSchema = z.string().uuid()

// ─── POST handler ─────────────────────────────────────────────────────────

export const POST = withAuthCtx<RouteContext>(
  async (request: NextRequest, auth, context: RouteContext) => {
    // 1. Extract and validate proposal ID from path
    const { id: rawId } = await context.params
    const idResult = UUIDSchema.safeParse(rawId)
    if (!idResult.success) {
      return NextResponse.json(
        { error: 'Proposal ID must be a valid UUID', code: 'INVALID_UUID' },
        { status: 400 },
      )
    }
    const proposalId = idResult.data

    // 2. Parse request body (body is optional for this endpoint)
    let body: unknown = {}
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        body = await request.json()
      } catch {
        return NextResponse.json(
          { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
          { status: 400 },
        )
      }
    }

    const parsed = AcceptProposalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'INVALID_REQUEST_BODY',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      )
    }

    // 3. Resolve the authenticated user's DB id from their wallet address
    const userRows = (await sql`
      SELECT id, role
      FROM users
      WHERE wallet_address = ${auth.walletAddress}
      LIMIT 1
    `) as Array<{ id: string; role: string }>

    if (userRows.length === 0) {
      return NextResponse.json(
        { error: 'Authenticated user not found', code: 'USER_NOT_FOUND' },
        { status: 401 },
      )
    }

    const { id: callerId, role: callerRole } = userRows[0]

    // 4. Only clients (or admins) may accept proposals
    if (callerRole !== 'client' && callerRole !== 'admin') {
      return NextResponse.json(
        {
          error: 'Only clients can accept proposals',
          code: 'FORBIDDEN',
        },
        { status: 403 },
      )
    }

    // 5. Run the atomic acceptance flow
    try {
      const result = await acceptProposal(proposalId, callerId)

      return NextResponse.json(
        {
          message: 'Proposal accepted and contract created',
          proposal: result.proposal,
          contract: result.contract,
          milestones: result.milestones,
        },
        { status: 201 },
      )
    } catch (err) {
      // ── Known domain errors → deterministic HTTP responses ──────────────

      if (err instanceof ProposalNotFoundError) {
        return NextResponse.json(
          { error: err.message, code: 'PROPOSAL_NOT_FOUND' },
          { status: 404 },
        )
      }

      if (err instanceof ProposalAlreadyAcceptedError) {
        return NextResponse.json(
          { error: err.message, code: 'PROPOSAL_ALREADY_ACCEPTED' },
          { status: 409 },
        )
      }

      if (err instanceof ProposalNotPendingError) {
        return NextResponse.json(
          { error: err.message, code: 'PROPOSAL_NOT_PENDING' },
          { status: 409 },
        )
      }

      if (err instanceof ProjectNotActiveError) {
        return NextResponse.json(
          { error: err.message, code: 'PROJECT_NOT_ACTIVE' },
          { status: 409 },
        )
      }

      if (err instanceof UnauthorizedAcceptanceError) {
        return NextResponse.json(
          { error: err.message, code: 'FORBIDDEN' },
          { status: 403 },
        )
      }

      // ── DB unique constraint violation on uq_proposals_one_accepted_per_project
      //    This is a last-resort guard if two concurrent requests race through ──
      if (
        err instanceof Error &&
        err.message.includes('uq_proposals_one_accepted_per_project')
      ) {
        return NextResponse.json(
          {
            error: 'Another proposal has already been accepted for this project',
            code: 'PROJECT_ALREADY_HAS_ACCEPTED_PROPOSAL',
          },
          { status: 409 },
        )
      }

      // ── Unexpected error ─────────────────────────────────────────────────
      console.error('[POST /api/proposals/[id]/accept]', err)
      return NextResponse.json(
        { error: 'Failed to accept proposal', code: 'SERVER_ERROR' },
        { status: 500 },
      )
    }
  },
)
