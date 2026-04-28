export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, AdminContext } from '@/lib/auth/adminMiddleware'
import { sql } from '@/lib/db'

export async function GET(request: NextRequest) {
  return withAdmin(async (req, auth: AdminContext) => {
    try {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get('status')
      const raisedBy = searchParams.get('raisedBy')
      const page = parseInt(searchParams.get('page') || '1')
      const pageSize = parseInt(searchParams.get('limit') || '10')
      const offset = (page - 1) * pageSize

      const disputes = await sql`
        SELECT d.id, d.contract_id, d.milestone_id, d.raised_by, d.raised_by_user_id,
          u_raiser.wallet_address AS raised_by_wallet, u_raiser.username AS raised_by_username,
          d.reason, d.desired_outcome, d.evidence, d.status, d.resolver_id,
          d.resolution_notes, d.resolved_at, d.response_deadline, d.created_at, d.updated_at
        FROM disputes d
        JOIN users u_raiser ON d.raised_by_user_id = u_raiser.id
        LEFT JOIN users u_resolver ON d.resolver_id = u_resolver.id
        JOIN contracts c ON d.contract_id = c.id
        LEFT JOIN milestones m ON d.milestone_id = m.id
        WHERE (${status}::text IS NULL OR d.status = ${status})
          AND (${raisedBy}::text IS NULL OR d.raised_by::text = ${raisedBy})
        ORDER BY d.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*)::int AS total FROM disputes d
        WHERE (${status}::text IS NULL OR d.status = ${status})
          AND (${raisedBy}::text IS NULL OR d.raised_by::text = ${raisedBy})
      `

      await sql`
        INSERT INTO admin_audit_logs (admin_user_id, action, details, ip_address, user_agent)
        VALUES (
          ${auth.userId}, 'VIEW_DISPUTES',
          ${JSON.stringify({ filters: { status, raisedBy, page, limit: pageSize }, resultsReturned: disputes.length })},
          ${req.headers.get('x-forwarded-for') || 'unknown'},
          ${req.headers.get('user-agent') || ''}
        )
      `

      return NextResponse.json({
        disputes,
        pagination: { total: countResult[0]?.total ?? 0, page, limit: pageSize, totalPages: Math.ceil((countResult[0]?.total ?? 0) / pageSize) }
      })
    } catch (error) {
      console.error('Error fetching disputes:', error)
      return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
    }
  })(request)
}
