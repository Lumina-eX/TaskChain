import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { recordContractCompletion } from '@/lib/blockchain-reputation'

/**
 * Record a contract completion on-chain
 * POST /api/blockchain-reputation/record-completion
 * 
 * This updates the on-chain reputation when a contract is completed
 */
export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const body = await request.json()
    const { successful } = body

    if (typeof successful !== 'boolean') {
      return NextResponse.json(
        { error: 'successful boolean field is required', code: 'MISSING_SUCCESSFUL' },
        { status: 400 }
      )
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    
    const result = await recordContractCompletion(
      auth.walletAddress,
      successful,
      horizonUrl
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'RECORD_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: successful ? 'Contract completion recorded successfully' : 'Contract failure recorded',
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