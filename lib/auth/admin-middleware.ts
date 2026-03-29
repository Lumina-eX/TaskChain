import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { AuthContext, withAuth } from '@/lib/auth/middleware'

export interface AdminContext extends AuthContext {
  userId: number
}

type AdminHandler = (
  request: NextRequest,
  admin: AdminContext
) => Promise<NextResponse> | NextResponse

/** HOF for non-dynamic routes */
export function withAdmin(handler: AdminHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext) => {
    const adminOrError = await resolveAdmin(auth)
    if (adminOrError instanceof NextResponse) return adminOrError
    return handler(request, adminOrError)
  })
}

/**
 * Helper for dynamic routes that receive a route context as their second arg.
 * Returns AdminContext on success, or a NextResponse error to return immediately.
 *
 * Usage:
 *   const adminOrError = await checkAdmin(request)
 *   if (adminOrError instanceof NextResponse) return adminOrError
 */
export async function checkAdmin(
  request: NextRequest
): Promise<AdminContext | NextResponse> {
  const { readAccessToken, verifyAccessToken } = await import('@/lib/auth/session')
  const token = readAccessToken(request)
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }
  const payload = verifyAccessToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }
  return resolveAdmin({ walletAddress: payload.walletAddress, tokenJti: payload.jti })
}

async function resolveAdmin(auth: AuthContext): Promise<AdminContext | NextResponse> {
  const rows = await sql`
    SELECT id, user_type, is_banned
    FROM users
    WHERE wallet_address = ${auth.walletAddress}
    LIMIT 1
  `

  const user = rows[0] as
    | { id: number; user_type: string; is_banned: boolean }
    | undefined

  if (!user || user.user_type !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', code: 'ADMIN_REQUIRED' },
      { status: 403 }
    )
  }

  if (user.is_banned) {
    return NextResponse.json(
      { error: 'Account suspended', code: 'ACCOUNT_BANNED' },
      { status: 403 }
    )
  }

  return {
    walletAddress: auth.walletAddress,
    tokenJti: auth.tokenJti,
    userId: user.id,
  }
}
