import { NextRequest, NextResponse } from 'next/server'
import {
  readRefreshToken,
  rotateSession,
  setSessionCookies,
} from '@/lib/auth/session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = readRefreshToken(request)
    if (!refreshToken) {
      return NextResponse.json(
        {
          error: 'Refresh token is required',
          code: 'REFRESH_TOKEN_REQUIRED',
        },
        { status: 401 }
      )
    }

    const session = await rotateSession(request, refreshToken)
    if (!session) {
      return NextResponse.json(
        {
          error: 'Invalid or expired refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        },
        { status: 401 }
      )
    }

    const response = NextResponse.json(
      {
        walletAddress: session.walletAddress,
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
        error: 'Failed to refresh session',
        code: 'SESSION_REFRESH_FAILED',
      },
      { status: 500 }
    )
  }
}
