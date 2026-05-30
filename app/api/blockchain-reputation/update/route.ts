import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { updateReputationOnChain } from '@/lib/blockchain-reputation'

/**
 * Update on-chain reputation data
 * POST /api/blockchain-reputation/update
 * 
 * This updates the immutable reputation record on the Stellar blockchain
 */
export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const body = await request.json()
    const { completionScore, disputeCount, totalContracts } = body

    // Validate that at least one field is being updated
    if (completionScore === undefined && disputeCount === undefined && totalContracts === undefined) {
      return NextResponse.json(
        { error: 'At least one field must be specified for update', code: 'NO_UPDATE_FIELDS' },
        { status: 400 }
      )
    }

    // Validate completion score range if provided
    if (completionScore !== undefined && (completionScore < 0 || completionScore > 100)) {
      return NextResponse.json(
        { error: 'Completion score must be between 0 and 100', code: 'INVALID_SCORE' },
        { status: 400 }
      )
    }

    // Validate counts are non-negative if provided
    if (disputeCount !== undefined && disputeCount < 0) {
      return NextResponse.json(
        { error: 'Dispute count cannot be negative', code: 'INVALID_DISPUTE_COUNT' },
        { status: 400 }
      )
    }

    if (totalContracts !== undefined && totalContracts < 0) {
      return NextResponse.json(
        { error: 'Total contracts cannot be negative', code: 'INVALID_CONTRACT_COUNT' },
        { status: 400 }
      )
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    
    const result = await updateReputationOnChain(
      auth.walletAddress,
      {
        completionScore,
        disputeCount,
        totalContracts
      },
      horizonUrl
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'UPDATE_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Reputation updated successfully',
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