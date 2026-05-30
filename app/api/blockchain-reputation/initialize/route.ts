import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { initializeReputationRegistry } from '@/lib/blockchain-reputation'

/**
 * Initialize on-chain reputation registry for a user
 * POST /api/blockchain-reputation/initialize
 * 
 * This creates the initial reputation data entry on the Stellar blockchain
 */
export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const body = await request.json()
    const { secretKey } = body

    if (!secretKey) {
      return NextResponse.json(
        { error: 'Secret key is required', code: 'MISSING_SECRET_KEY' },
        { status: 400 }
      )
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    
    const result = await initializeReputationRegistry(
      auth.walletAddress,
      secretKey,
      horizonUrl
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'INITIALIZATION_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Reputation registry initialized successfully',
      transactionHash: result.transactionHash,
      data: result.data
    }, { status: 201 })
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