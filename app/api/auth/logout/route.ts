export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  clearSessionCookies,
  readRefreshToken,
  revokeSession,
} from '@/lib/auth/session'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(request, 'auth:logout'),
      limit: 20,
      windowMs: 60_000,
    })
    if (limited) return limited

    const refreshToken = readRefreshToken(request)
    if (refreshToken) {
      await revokeSession(refreshToken)
    }

    const response = NextResponse.json({ ok: true }, { status: 200 })
    clearSessionCookies(response)
    return response
  } catch {
    return NextResponse.json(
      { error: 'Failed to log out', code: 'LOGOUT_FAILED' },
      { status: 500 }
    )
  }
}
