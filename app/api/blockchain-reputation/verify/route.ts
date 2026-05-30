import { NextRequest, NextResponse } from 'next/server'
import { verifyReputationRegistry } from '@/lib/blockchain-reputation'

/**
 * Verify if reputation registry exists on-chain
 * GET /api/blockchain-reputation/verify?wallet=ADDRESS
 * 
 * This checks if a wallet has initialized their reputation registry
 */
export const GET = async (request: NextRequest) => {
  try {
    const walletAddress = request.nextUrl.searchParams.get('wallet')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required', code: 'MISSING_WALLET' },
        { status: 400 }
      )
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    
    const result = await verifyReputationRegistry(walletAddress, horizonUrl)

    return NextResponse.json({
      success: true,
      exists: result.exists,
      wallet: walletAddress,
      error: result.error
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
}