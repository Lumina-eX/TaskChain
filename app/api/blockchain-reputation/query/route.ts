import { NextRequest, NextResponse } from 'next/server'
import { getReputationFromChain, verifyReputationRegistry } from '@/lib/blockchain-reputation'

/**
 * Query on-chain reputation data
 * GET /api/blockchain-reputation/query?wallet=ADDRESS
 * 
 * This retrieves the immutable reputation record from the Stellar blockchain
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
    
    const result = await getReputationFromChain(walletAddress, horizonUrl)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: 'QUERY_FAILED' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      wallet: walletAddress
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