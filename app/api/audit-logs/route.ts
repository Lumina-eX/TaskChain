/**
 * POST /api/audit-logs      — create an immutable audit log entry
 * GET  /api/audit-logs      — list audit logs with pagination & filtering
 *
 * Access: authenticated wallet. Results scoped to caller's contracts.
 * Immutability: append-only at both DB and app layer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { contractAuditLogService, AuditValidationError, AuditForbiddenError } from '@/lib/audit-log'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (request: NextRequest, auth) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  try {
    const log = await contractAuditLogService.createLog(body, auth.walletAddress)
    return NextResponse.json({ log }, { status: 201 })
  } catch (err) {
    if (err instanceof AuditValidationError) {
      return NextResponse.json(
        { error: err.message, code: 'VALIDATION_ERROR' },
        { status: 422 }
      )
    }
    if (err instanceof AuditForbiddenError) {
      return NextResponse.json(
        { error: err.message, code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    console.error('[audit-logs POST]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})

export const GET = withAuth(async (request: NextRequest, _auth) => {
  const { searchParams } = request.nextUrl

  const query: Record<string, string | undefined> = {}
  for (const key of ['limit', 'offset', 'contractId', 'projectId', 'action', 'actorUserId', 'fromDate', 'toDate']) {
    const val = searchParams.get(key)
    if (val !== null) query[key] = val
  }

  try {
    const page = await contractAuditLogService.listLogs(query, request)
    return NextResponse.json(page, { status: 200 })
  } catch (err) {
    if (err instanceof AuditValidationError) {
      return NextResponse.json(
        { error: err.message, code: 'VALIDATION_ERROR' },
        { status: 422 }
      )
    }
    if (err instanceof AuditForbiddenError) {
      return NextResponse.json(
        { error: err.message, code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    console.error('[audit-logs GET]', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
