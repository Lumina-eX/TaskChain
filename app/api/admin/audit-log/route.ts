import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth/admin-middleware'
import { sql } from '@/lib/db'

const PAGE_SIZE = 50

const VALID_RESOURCE_TYPES = ['dispute', 'contract', 'user'] as const

export const GET = withAdmin(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const resourceType = params.get('resource_type')
  const adminWallet = params.get('admin_wallet')
  const offset = (page - 1) * PAGE_SIZE

  if (
    resourceType &&
    !VALID_RESOURCE_TYPES.includes(resourceType as (typeof VALID_RESOURCE_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: 'Invalid resource_type filter', code: 'INVALID_RESOURCE_TYPE' },
      { status: 400 }
    )
  }

  const rows = await sql`
    SELECT id, admin_wallet, action, resource_type, resource_id, details, created_at
    FROM admin_audit_log
    WHERE
      (${resourceType ?? null} IS NULL OR resource_type = ${resourceType ?? null})
      AND (${adminWallet ?? null} IS NULL OR admin_wallet = ${adminWallet ?? null})
    ORDER BY created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total
    FROM admin_audit_log
    WHERE
      (${resourceType ?? null} IS NULL OR resource_type = ${resourceType ?? null})
      AND (${adminWallet ?? null} IS NULL OR admin_wallet = ${adminWallet ?? null})
  `

  return NextResponse.json({
    entries: rows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: (countRow as { total: number }).total,
    },
  })
})
