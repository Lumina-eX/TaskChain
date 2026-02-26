import { NextRequest, NextResponse } from 'next/server'
import { createSession, setSessionCookies } from '@/lib/auth/session'
import { consumeNonce, hasActiveNonce } from '@/lib/auth/store'
import { sha256Hex } from '@/lib/auth/crypto'
import {
  buildAuthMessage,
  isValidStellarAddress,
  normalizeWalletAddress,
  verifyStellarSignature,
} from '@/lib/auth/stellar'

interface VerifyRequestBody {
  walletAddress?: string
  nonce?: string
  signature?: string
  message?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: VerifyRequestBody = await request.json()

    const walletAddress = body.walletAddress?.trim()
    const nonce = body.nonce?.trim()
    const signature = body.signature?.trim()

    if (!walletAddress || !nonce || !signature) {
      return NextResponse.json(
        {
          error: 'Missing walletAddress, nonce, or signature',
          code: 'INVALID_AUTH_PAYLOAD',
        },
        { status: 400 }
      )
    }

    if (!isValidStellarAddress(walletAddress)) {
      return NextResponse.json(
        {
          error: 'Invalid wallet address',
          code: 'INVALID_WALLET_ADDRESS',
        },
        { status: 400 }
      )
    }

    const normalizedWallet = normalizeWalletAddress(walletAddress)
    const nonceHash = sha256Hex(nonce)
    const expectedMessage = buildAuthMessage(normalizedWallet, nonce)

    if (body.message && body.message !== expectedMessage) {
      return NextResponse.json(
        {
          error: 'Signed message does not match expected format',
          code: 'MESSAGE_MISMATCH',
        },
        { status: 400 }
      )
    }

    const nonceIsValid = await hasActiveNonce({
      walletAddress: normalizedWallet,
      nonceHash,
    })
    if (!nonceIsValid) {
      return NextResponse.json(
        {
          error: 'Nonce is invalid, expired, or already used',
          code: 'INVALID_NONCE',
        },
        { status: 401 }
      )
    }

    const signatureIsValid = verifyStellarSignature({
      walletAddress: normalizedWallet,
      message: expectedMessage,
      signature,
    })
    if (!signatureIsValid) {
      return NextResponse.json(
        {
          error: 'Invalid wallet signature',
          code: 'INVALID_SIGNATURE',
        },
        { status: 401 }
      )
    }

    const consumed = await consumeNonce({
      walletAddress: normalizedWallet,
      nonceHash,
    })
    if (!consumed) {
      return NextResponse.json(
        {
          error: 'Nonce is invalid, expired, or already used',
          code: 'INVALID_NONCE',
        },
        { status: 401 }
      )
    }

    const session = await createSession(request, normalizedWallet)
    const response = NextResponse.json(
      {
        walletAddress: normalizedWallet,
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
      },
      { status: 200 }
    )
    setSessionCookies(response, session)

    return response
  } catch {
    return NextResponse.json(
      {
        error: 'Authentication failed',
        code: 'AUTH_VERIFICATION_FAILED',
      },
      { status: 500 }
    )
  }
}
