/**
 * GET /api/payment-ledger/pending
 *
 * Lists pending transactions only — clearly separated from confirmed
 * ledger entries.  Same filters and pagination as the main ledger endpoint.
 *
 * Query params:
 *   limit/offset — pagination
 *   contractId  — filter by contract UUID
 *   userId      — filter by actor or counterparty UUID
 *   currency    — filter by token/currency
 *   entryType   — filter by type: deposit | milestone_release | refund | dispute
 *   dateFrom    — ISO date string (inclusive)
 *   dateTo      — ISO date string (inclusive)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
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
    const page = await paymentLedgerService.listPending({
      walletAddress: auth.walletAddress,
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      contractId: searchParams.get('contractId'),
      userId: searchParams.get('userId'),
      currency: searchParams.get('currency'),
      entryType: searchParams.get('entryType'),
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    })

    return NextResponse.json(page, { status: 200 })
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
    console.error('[payment-ledger/pending GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
