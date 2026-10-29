/**
 * GET /api/reconciliation/discrepancies
 *
 * Lists discrepancies across all reconciliation reports with filtering
 * and pagination.  Access: requires 'reconciliation:view' (admin only).
 *
 * Query params:
 *   limit/offset     — pagination
 *   reportId         — filter by report UUID
 *   contractId       — filter by contract UUID
 *   discrepancyType  — amount_mismatch | missing_blockchain_event |
 *                      missing_application_record | duplicate_entry |
 *                      status_mismatch | other
 *   severity         — low | medium | high | critical
 *   status           — open | investigating | resolved
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import {
  reconciliationService,
  ReconciliationError,
  reconciliationErrorToHttpStatus,
  ReconciliationValidationError,
} from '@/lib/reconciliation'

export const GET = withRbac('reconciliation:view', async (request: NextRequest, _auth: RbacContext) => {
  const { searchParams } = request.nextUrl

  try {
    const page = await reconciliationService.listDiscrepancies({
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      reportId: searchParams.get('reportId'),
      contractId: searchParams.get('contractId'),
      discrepancyType: searchParams.get('discrepancyType'),
      severity: searchParams.get('severity'),
      status: searchParams.get('status'),
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
    console.error('[reconciliation/discrepancies GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
