import { NextRequest, NextResponse } from 'next/server'
import {
  clearSessionCookies,
  readRefreshToken,
  revokeSession,
} from '@/lib/auth/session'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = readRefreshToken(request)
    if (refreshToken) {
      await revokeSession(refreshToken)
    }

    const response = NextResponse.json({ ok: true }, { status: 200 })
    clearSessionCookies(response)
    return response
  } catch {
    return NextResponse.json(
      {
        error: 'Failed to log out',
        code: 'LOGOUT_FAILED',
      },
      { status: 500 }
    )
  }
}
