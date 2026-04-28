export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { NONCE_TTL_SECONDS } from '@/lib/auth/constants'
import { randomNonce, sha256Hex } from '@/lib/auth/crypto'
import { saveNonce } from '@/lib/auth/store'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'
import { parseJson } from '@/lib/security/validation'
import { buildAuthMessage, isValidStellarAddress, normalizeWalletAddress } from '@/lib/auth/stellar'
import { z } from 'zod'

const nonceBodySchema = z.object({
  walletAddress: z.string().trim().min(1).max(56),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJson(request, nonceBodySchema)
    if ('response' in parsed) return parsed.response

    const walletAddress = parsed.data.walletAddress

    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(request, 'auth:nonce', walletAddress),
      limit: 5,
      windowMs: 60_000,
    })
    if (limited) return limited

    if (!isValidStellarAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address', code: 'INVALID_WALLET_ADDRESS' }, { status: 400 })
    }

    const normalizedWallet = normalizeWalletAddress(walletAddress)
    const nonce = randomNonce()
    const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000)

    await saveNonce({ walletAddress: normalizedWallet, nonceHash: sha256Hex(nonce), expiresAt })

    return NextResponse.json({
      walletAddress: normalizedWallet,
      nonce,
      message: buildAuthMessage(normalizedWallet, nonce),
      expiresAt: expiresAt.toISOString(),
    }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to create auth nonce', code: 'NONCE_ISSUE_FAILED' }, { status: 500 })
  }
}
