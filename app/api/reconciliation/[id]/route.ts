/**
 * GET /api/reconciliation/[id]
 *
 * Returns a single reconciliation report with all its discrepancies.
 * Access: requires 'reconciliation:view' (admin only).
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

export const GET = withRbac('reconciliation:view', async (request: NextRequest, _auth: RbacContext) => {
  const id = request.nextUrl.pathname.split('/').pop()

  if (!id) {
    return NextResponse.json(
      { error: 'Report ID is required', code: 'MISSING_REPORT_ID' },
      { status: 400 }
    )
  }

  try {
    const detail = await reconciliationService.getReport(id)

    if (detail.discrepancies.length === 0 && detail.report.status === 'completed') {
      return NextResponse.json(
        {
          ...detail,
          empty: true,
          message: 'No discrepancies found. Ledger data is consistent.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(detail, { status: 200 })
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
    console.error('[reconciliation/[id] GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
