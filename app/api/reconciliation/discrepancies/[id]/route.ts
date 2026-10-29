/**
 * PATCH /api/reconciliation/discrepancies/[id]
 *
 * Resolve a reconciliation discrepancy by marking it as 'resolved' with
 * resolution notes.  Access: requires 'reconciliation:resolve' (admin only).
 *
 * Body (JSON):
 *   resolutionNotes — string (required, min 3 chars) explaining the
 *                     resolution and any corrective actions taken.
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
} from '@/lib/reconciliation'

export const PATCH = withRbac('reconciliation:resolve', async (request: NextRequest, auth: RbacContext) => {
  const id = request.nextUrl.pathname.split('/').pop()

  if (!id) {
    return NextResponse.json(
      { error: 'Discrepancy ID is required', code: 'MISSING_DISCREPANCY_ID' },
      { status: 400 }
    )
  }

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
    const discrepancy = await reconciliationService.resolveDiscrepancy(
      id,
      auth.walletAddress,
      (body.resolutionNotes as string) ?? ''
    )

    return NextResponse.json({ discrepancy }, { status: 200 })
  } catch (err) {
    if (err instanceof ReconciliationValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      )
    }
    if (err instanceof ReconciliationNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 404 }
      )
    }
    if (err instanceof ReconciliationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: reconciliationErrorToHttpStatus(err) }
      )
    }
    console.error('[reconciliation/discrepancies/[id] PATCH]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
