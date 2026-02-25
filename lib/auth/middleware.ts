import { NextRequest, NextResponse } from 'next/server'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'

export interface AuthContext {
  walletAddress: string
  tokenJti: string
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<NextResponse> | NextResponse

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
    { status: 401 }
  )
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const token = readAccessToken(request)
    if (!token) {
      return unauthorizedResponse()
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return unauthorizedResponse()
    }

    return handler(request, {
      walletAddress: payload.walletAddress,
      tokenJti: payload.jti,
    })
  }
}
