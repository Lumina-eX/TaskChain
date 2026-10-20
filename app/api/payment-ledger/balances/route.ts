/**
 * GET /api/payment-ledger/balances
 *
 * Returns funded, released, refunded, and remaining balances per
 * contract and currency.  Also supports a summary mode via ?summary=true
 * which returns a single aggregated view across all currencies.
 *
 * Query params:
 *   summary     — if 'true', returns a global balance summary instead of
 *                 paginated per-contract balances
 *   limit/offset — pagination (ignored when summary=true)
 *   contractId  — filter by contract UUID
 *   userId      — filter by actor or counterparty UUID
 *   currency    — filter by token/currency
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
  const summary = searchParams.get('summary') === 'true'

  try {
    if (summary) {
      const summaryResult = await paymentLedgerService.getSummary({
        walletAddress: auth.walletAddress,
        contractId: searchParams.get('contractId'),
        currency: searchParams.get('currency'),
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
      })
      return NextResponse.json({ summary: summaryResult }, { status: 200 })
    }

    const page = await paymentLedgerService.getBalances({
      walletAddress: auth.walletAddress,
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      contractId: searchParams.get('contractId'),
      userId: searchParams.get('userId'),
      currency: searchParams.get('currency'),
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
    console.error('[payment-ledger/balances GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
