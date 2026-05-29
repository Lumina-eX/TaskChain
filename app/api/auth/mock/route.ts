export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { signSessionToken } from '@/lib/auth/jwt'
import { setSessionCookies } from '@/lib/auth/session'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '@/lib/auth/constants'
import { sha256Hex } from '@/lib/auth/crypto'
import { sql } from '@/lib/db'

const MOCK_WALLET = 'GMOCKUSER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'JWT_SECRET is not set or too short. Check your .env file.' }, { status: 500 })
  }

  const { token: accessToken, payload: accessPayload } = signSessionToken({
    subject: MOCK_WALLET, walletAddress: MOCK_WALLET,
    type: 'access', expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS, secret,
  })

  const { token: refreshToken, payload: refreshPayload } = signSessionToken({
    subject: MOCK_WALLET, walletAddress: MOCK_WALLET,
    type: 'refresh', expiresInSeconds: REFRESH_TOKEN_TTL_SECONDS, secret,
  })

  try {
    await sql`
      INSERT INTO auth_refresh_tokens (wallet_address, jti, token_hash, expires_at, user_agent, ip_address)
      VALUES (
        ${MOCK_WALLET}, ${refreshPayload.jti}, ${sha256Hex(refreshToken)},
        ${new Date(refreshPayload.exp * 1000).toISOString()},
        ${request.headers.get('user-agent')}, ${request.headers.get('x-forwarded-for') ?? null}
      )
      ON CONFLICT (jti) DO NOTHING
    `
  } catch (err) {
    console.warn('[mock auth] Could not persist refresh token:', err)
  }

  const session = {
    walletAddress: MOCK_WALLET,
    accessToken, refreshToken,
    accessTokenExpiresAt: new Date(accessPayload.exp * 1000),
    refreshTokenExpiresAt: new Date(refreshPayload.exp * 1000),
    refreshJti: refreshPayload.jti,
  }

  const response = NextResponse.json({
    walletAddress: MOCK_WALLET, mock: true, accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
  }, { status: 200 })

  setSessionCookies(response, session)
  return response
}
