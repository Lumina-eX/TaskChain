/**
 * GET /api/payment-ledger
 *
 * List ledger entries (confirmed, pending, and failed) with filtering and
 * pagination.  Access is scoped to contracts the authenticated user
 * participates in (as client, freelancer, actor, or counterparty).
 *
 * Query params:
 *   limit       — pagination page size (default 50, max 100)
 *   offset      — pagination offset (default 0)
 *   contractId  — filter by contract UUID
 *   userId      — filter by actor or counterparty UUID
 *   currency    — filter by token/currency (e.g. 'USDC')
 *   entryType   — filter by type: deposit | milestone_release | refund | dispute
 *   status      — filter by status: pending | confirmed | failed
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
    const page = await paymentLedgerService.listEntries({
      walletAddress: auth.walletAddress,
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      contractId: searchParams.get('contractId'),
      userId: searchParams.get('userId'),
      currency: searchParams.get('currency'),
      entryType: searchParams.get('entryType'),
      status: searchParams.get('status'),
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
    console.error('[payment-ledger GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
