import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from './middleware'
import { sql } from '@/lib/db'

export interface AdminContext extends AuthContext {
  userId: string
  role: 'admin'
}

type AdminHandler = (
  request: NextRequest,
  auth: AdminContext
) => Promise<NextResponse> | NextResponse

export function withAdmin(handler: AdminHandler) {
  return withAuth(async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    // Fetch user from database by walletAddress to get role and id
    const result = await sql`
      SELECT id, role
      FROM users
      WHERE wallet_address = ${auth.walletAddress}
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    const { id, role } = result[0]

    // Check if the user has admin role
    if (role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'INSUFFICIENT_PERMISSIONS' },
        { status: 403 }
      )
    }

    // Extend auth context with userId and role
    const adminAuth: AdminContext = {
      ...auth,
      userId: id,
      role: 'admin'
    }

    return handler(request, adminAuth)
  })
}