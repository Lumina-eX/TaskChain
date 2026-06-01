import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { recordDispute } from '@/lib/blockchain-reputation'

/**
 * Record a dispute on-chain
 * POST /api/blockchain-reputation/record-dispute
 * 
 * This updates the on-chain reputation when a dispute is filed
 */
export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    
    const result = await recordDispute(auth.walletAddress, horizonUrl)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'RECORD_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Dispute recorded successfully',
      transactionHash: result.transactionHash,
      data: result.data
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
})