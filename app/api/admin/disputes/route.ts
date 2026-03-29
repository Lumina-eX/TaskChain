import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth/admin-middleware'
import { writeAuditLog } from '@/lib/admin/audit'
import { sql } from '@/lib/db'

const VALID_STATUSES = ['open', 'under_review', 'resolved'] as const
const PAGE_SIZE = 20

export const GET = withAdmin(async (request: NextRequest, admin) => {
  const params = request.nextUrl.searchParams
  const status = params.get('status')
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'Invalid status filter', code: 'INVALID_STATUS' },
      { status: 400 }
    )
  }

  const rows = status
    ? await sql`
        SELECT
          d.id, d.job_id, d.reason, d.status, d.resolution,
          d.resolved_at, d.created_at, d.updated_at,
          u.username AS raised_by_username,
          u.wallet_address AS raised_by_wallet,
          j.title AS job_title
        FROM disputes d
        JOIN users u ON u.id = d.raised_by
        JOIN jobs  j ON j.id = d.job_id
        WHERE d.status = ${status}
        ORDER BY d.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `
    : await sql`
        SELECT
          d.id, d.job_id, d.reason, d.status, d.resolution,
          d.resolved_at, d.created_at, d.updated_at,
          u.username AS raised_by_username,
          u.wallet_address AS raised_by_wallet,
          j.title AS job_title
        FROM disputes d
        JOIN users u ON u.id = d.raised_by
        JOIN jobs  j ON j.id = d.job_id
        ORDER BY d.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `

  const [countRow] = status
    ? await sql`SELECT COUNT(*)::int AS total FROM disputes WHERE status = ${status}`
    : await sql`SELECT COUNT(*)::int AS total FROM disputes`

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'dispute.view',
    resourceType: 'dispute',
    resourceId: 0,
    details: { filter: status ?? 'all', page },
  })

  return NextResponse.json({
    disputes: rows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: (countRow as { total: number }).total,
    },
  })
})
