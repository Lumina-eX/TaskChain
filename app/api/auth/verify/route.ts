export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSession, setSessionCookies } from '@/lib/auth/session'
import { consumeNonce, hasActiveNonce } from '@/lib/auth/store'
import { sha256Hex } from '@/lib/auth/crypto'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'
import { parseJson } from '@/lib/security/validation'
import {
  buildAuthMessage,
  isValidStellarAddress,
  normalizeWalletAddress,
  verifyStellarSignature,
} from '@/lib/auth/stellar'
import { z } from 'zod'

const verifyBodySchema = z.object({
  walletAddress: z.string().trim().min(1).max(56),
  nonce: z.string().trim().min(1).max(256),
  signature: z.string().trim().min(1).max(4096),
  message: z.string().trim().min(1).max(512).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJson(request, verifyBodySchema)
    if ('response' in parsed) return parsed.response
    const body = parsed.data

    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(request, 'auth:verify', body.walletAddress),
      limit: 10,
      windowMs: 60_000,
    })
    if (limited) return limited

    if (!isValidStellarAddress(body.walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address', code: 'INVALID_WALLET_ADDRESS' },
        { status: 400 }
      )
    }

    const normalizedWallet = normalizeWalletAddress(body.walletAddress)
    const nonceHash = sha256Hex(body.nonce)
    const expectedMessage = buildAuthMessage(normalizedWallet, body.nonce)

    if (body.message && body.message !== expectedMessage) {
      return NextResponse.json(
        { error: 'Signed message does not match expected format', code: 'MESSAGE_MISMATCH' },
        { status: 400 }
      )
    }

    const nonceIsValid = await hasActiveNonce({ walletAddress: normalizedWallet, nonceHash })
    if (!nonceIsValid) {
      return NextResponse.json(
        { error: 'Nonce is invalid, expired, or already used', code: 'INVALID_NONCE' },
        { status: 401 }
      )
    }

    const signatureIsValid = verifyStellarSignature({
      walletAddress: normalizedWallet,
      message: expectedMessage,
      signature: body.signature,
    })
    if (!signatureIsValid) {
      return NextResponse.json(
        { error: 'Invalid wallet signature', code: 'INVALID_SIGNATURE' },
        { status: 401 }
      )
    }

    const consumed = await consumeNonce({ walletAddress: normalizedWallet, nonceHash })
    if (!consumed) {
      return NextResponse.json(
        { error: 'Nonce is invalid, expired, or already used', code: 'INVALID_NONCE' },
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
      { error: 'Authentication failed', code: 'AUTH_VERIFICATION_FAILED' },
      { status: 500 }
    )
  }
}
