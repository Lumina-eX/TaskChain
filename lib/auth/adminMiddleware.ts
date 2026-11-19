import { NextRequest, NextResponse } from 'next/server'
import { withRole, RbacContext } from './rbacMiddleware'

export interface AdminContext extends RbacContext {
  role: 'admin'
}

type AdminHandler = (
  request: NextRequest,
  auth: AdminContext
) => Promise<NextResponse> | NextResponse

/**
 * Middleware that restricts access to admin users only.
 * This is a convenience wrapper around withRole(['admin']).
 *
 * Admin-only operations such as token allowlist management (escrow asset
 * validation) must be routed through this middleware or withRole(['admin'])
 * so that unauthorized callers are rejected before reaching the handler.
 *
 * @deprecated Use withRole(['admin']) or withRbac with specific admin permissions instead.
 * This is maintained for backward compatibility.
 */
export function withAdmin(handler: AdminHandler) {
  return withRole(['admin'], async (request: NextRequest, auth: RbacContext): Promise<NextResponse> => {
    // Extend auth context with admin-specific type
    const adminAuth: AdminContext = {
      ...auth,
      role: 'admin' as const
    }

    return handler(request, adminAuth)
  })
}
