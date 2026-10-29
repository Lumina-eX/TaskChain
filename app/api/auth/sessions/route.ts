export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { readRefreshToken } from '@/lib/auth/session'
import { listSecuritySessions } from '@/lib/auth/sessions'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'

/**
 * GET /api/auth/sessions
 *
 * Returns the authenticated wallet's sessions (active, revoked and expired)
 * plus derived security alerts.
 *
 * Security notes:
 * - Scoped to `auth.walletAddress`; the client can never query another wallet.
 * - Response contains only non-sensitive fields (never `jti`, `token_hash`).
 * - The current session is flagged via the httpOnly refresh cookie, not via
 *   an attacker-controllable query parameter.
 */
export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(request, 'auth:sessions:list', auth.walletAddress),
      limit: 60,
      windowMs: 60_000,
    })
    if (limited) return limited

    const refreshToken = readRefreshToken(request)
    const payload = await listSecuritySessions(auth.walletAddress, refreshToken)

    return NextResponse.json(
      { data: payload, meta: { generatedAt: new Date().toISOString() } },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    )
  } catch (err) {
    console.error('[GET /api/auth/sessions]', err)
    return NextResponse.json(
      { error: 'Failed to load sessions', code: 'SESSIONS_LOAD_FAILED' },
      { status: 500 }
    )
  }
})
