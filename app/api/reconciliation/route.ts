/**
 * GET  /api/reconciliation       — list reconciliation reports (admin only)
 * POST /api/reconciliation       — run a new reconciliation (admin only)
 *
 * GET query params:
 *   limit/offset — pagination
 *   status       — pending | completed | failed | discrepancies_found
 *   contractId   — filter by contract UUID
 *
 * POST body (JSON):
 *   contractId?  — restrict reconciliation to a single contract
 *   token?       — restrict to a specific currency/token
 *   dateFrom?    — ISO date string (inclusive lower bound)
 *   dateTo?      — ISO date string (inclusive upper bound)
 *
 * Access: requires 'reconciliation:view' (GET) or 'reconciliation:run' (POST).
 * Both permissions are admin-only in the current RBAC model.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import {
  reconciliationService,
  ReconciliationError,
  reconciliationErrorToHttpStatus,
  ReconciliationValidationError,
  ReconciliationNotFoundError,
  ReconciliationExecutionError,
} from '@/lib/reconciliation'

// ---------------------------------------------------------------------------
// GET — list reports
// ---------------------------------------------------------------------------

export const GET = withRbac('reconciliation:view', async (request: NextRequest, _auth: RbacContext) => {
  const { searchParams } = request.nextUrl

  try {
    const page = await reconciliationService.listReports({
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      status: searchParams.get('status'),
      contractId: searchParams.get('contractId'),
    })

    return NextResponse.json(page, { status: 200 })
  } catch (err) {
    if (err instanceof ReconciliationValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      )
    }
    if (err instanceof ReconciliationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: reconciliationErrorToHttpStatus(err) }
      )
    }
    console.error('[reconciliation GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})

// ---------------------------------------------------------------------------
// POST — run reconciliation
// ---------------------------------------------------------------------------

export const POST = withRbac('reconciliation:run', async (request: NextRequest, auth: RbacContext) => {
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Request body must be a JSON object', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  try {
    const report = await reconciliationService.runReconciliation({
      walletAddress: auth.walletAddress,
      contractId: (body.contractId as string) ?? null,
      token: (body.token as string) ?? null,
      dateFrom: (body.dateFrom as string) ?? null,
      dateTo: (body.dateTo as string) ?? null,
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (err) {
    if (err instanceof ReconciliationValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      )
    }
    if (err instanceof ReconciliationExecutionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 500 }
      )
    }
    if (err instanceof ReconciliationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: reconciliationErrorToHttpStatus(err) }
      )
    }
    console.error('[reconciliation POST]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
