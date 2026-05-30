/**
 * POST /api/escrow/logs
 * GET  /api/escrow/logs?limit=&offset=&contractId=&projectId=&transactionType=
 *
 * Stores and fetches escrow transaction audit logs for deposits, milestone
 * releases, refunds, and disputes. Results are scoped to the authenticated
 * user's contracts unless the caller is an admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import {
  escrowTransactionHistoryService,
  EscrowError,
  escrowErrorToHttpStatus,
} from '@/lib/escrow'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (request: NextRequest, auth) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  try {
    const log = await escrowTransactionHistoryService.createLog(
      body,
      auth.walletAddress
    )

    return NextResponse.json({ log }, { status: 201 })
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }

    console.error('[escrow/logs:POST] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})

export const GET = withAuth(async (request: NextRequest, auth) => {
  const searchParams = request.nextUrl.searchParams

  try {
    const result = await escrowTransactionHistoryService.listLogs({
      walletAddress: auth.walletAddress,
      limitParam: searchParams.get('limit'),
      offsetParam: searchParams.get('offset'),
      contractId: searchParams.get('contractId'),
      projectId: searchParams.get('projectId'),
      transactionType: searchParams.get('transactionType'),
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }

    console.error('[escrow/logs:GET] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
