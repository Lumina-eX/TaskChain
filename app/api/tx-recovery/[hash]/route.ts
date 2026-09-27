export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { txRecoveryService, TxRecoveryError } from '@/lib/tx-recovery'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params
    const cleanHash = (hash || '').trim().toLowerCase()

    if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash format. Must be a 64-character hex string.', code: 'INVALID_HASH' },
        { status: 422 }
      )
    }

    const txStatus = await txRecoveryService.getTransactionStatus(cleanHash)

    if (txStatus.status === 'expired') {
      return NextResponse.json(
        {
          error: 'Transaction processing timed out or expired without blockchain confirmation.',
          code: 'TX_EXPIRED_TIMEOUT',
          data: txStatus,
        },
        { status: 408 }
      )
    }

    return NextResponse.json({
      data: txStatus,
    })
  } catch (error) {
    if (error instanceof TxRecoveryError) return NextResponse.json(
      { error: error.message, code: error.code }, { status: error.httpStatus }
    )

    console.error('[api/tx-recovery/[hash]] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'TX_QUERY_FAILED' },
      { status: 500 }
    )
  }
}
