/**
 * GET /api/reconciliation/[id]/export
 *
 * Exports a reconciliation report's discrepancies as a CSV file download.
 * If the report has no discrepancies, returns a JSON message indicating
 * the empty state.
 *
 * Access: requires 'reconciliation:view' (admin only).
 *
 * Response:
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="reconciliation_report_<id>_<date>.csv"
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { csvContentDisposition } from '@/lib/csv'
import {
  reconciliationService,
  ReconciliationError,
  reconciliationErrorToHttpStatus,
  ReconciliationValidationError,
  ReconciliationNotFoundError,
} from '@/lib/reconciliation'

export const GET = withRbac('reconciliation:view', async (request: NextRequest, _auth: RbacContext) => {
  const parts = request.nextUrl.pathname.split('/')
  // /api/reconciliation/[id]/export  →  parts: ['', 'api', 'reconciliation', '<id>', 'export']
  const id = parts[parts.length - 2]

  if (!id) {
    return NextResponse.json(
      { error: 'Report ID is required', code: 'MISSING_REPORT_ID' },
      { status: 400 }
    )
  }

  try {
    const result = await reconciliationService.exportReportCsv(id)

    if (result.totalRows === 0) {
      return NextResponse.json(
        {
          error: 'No discrepancies found in this report',
          code: 'EMPTY_EXPORT',
        },
        { status: 200 }
      )
    }

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': csvContentDisposition(result.filename),
      },
    })
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
    console.error('[reconciliation/[id]/export GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
