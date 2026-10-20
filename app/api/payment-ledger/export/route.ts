/**
 * GET /api/payment-ledger/export
 *
 * Exports ledger entries as a CSV file download.  Applies the same
 * filters as the main ledger endpoint.
 *
 * Query params:
 *   contractId  — filter by contract UUID
 *   userId      — filter by actor or counterparty UUID
 *   currency    — filter by token/currency
 *   entryType   — filter by type
 *   status      — filter by status
 *   dateFrom    — ISO date string (inclusive)
 *   dateTo      — ISO date string (inclusive)
 *
 * Response:
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="ledger_export_YYYY-MM-DD.csv"
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { csvContentDisposition } from '@/lib/csv'
import {
  paymentLedgerService,
  LedgerError,
  ledgerErrorToHttpStatus,
  LedgerValidationError,
  LedgerForbiddenError,
} from '@/lib/payment-ledger'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const { searchParams } = request.nextUrl

  try {
    const result = await paymentLedgerService.exportCsv({
      walletAddress: auth.walletAddress,
      contractId: searchParams.get('contractId'),
      userId: searchParams.get('userId'),
      currency: searchParams.get('currency'),
      entryType: searchParams.get('entryType'),
      status: searchParams.get('status'),
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    })

    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: 'No ledger entries found matching the specified filters', code: 'EMPTY_EXPORT' },
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
    if (err instanceof LedgerValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      )
    }
    if (err instanceof LedgerForbiddenError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 403 }
      )
    }
    if (err instanceof LedgerError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: ledgerErrorToHttpStatus(err) }
      )
    }
    console.error('[payment-ledger/export GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
