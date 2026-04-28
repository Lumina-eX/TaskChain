export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, AdminContext } from '@/lib/auth/adminMiddleware'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(async (req, auth: AdminContext) => {
    try {
      const { id } = await params
      const { reason } = await request.json()
      if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required', code: 'VALIDATION_ERROR' }, { status: 400 })

      const contracts = await sql`
        SELECT c.id, c.status, c.project_id, p.title AS project_title,
          u_client.username AS client_username, u_freelancer.username AS freelancer_username
        FROM contracts c
        JOIN projects p ON c.project_id = p.id
        JOIN users u_client ON c.client_id = u_client.id
        JOIN users u_freelancer ON c.freelancer_id = u_freelancer.id
        WHERE c.id = ${id}
      `
      if (!contracts.length) return NextResponse.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, { status: 404 })

      const contract = contracts[0]
      if (contract.status === 'cancelled') return NextResponse.json({ error: 'Contract is already cancelled', code: 'INVALID_STATE' }, { status: 400 })
      if (contract.status === 'paused') return NextResponse.json({ error: 'Contract is already frozen', code: 'ALREADY_FROZEN' }, { status: 400 })

      const updated = await sql`UPDATE contracts SET status = 'paused', updated_at = NOW() WHERE id = ${id} RETURNING id, status, updated_at`
      await sql`UPDATE projects SET status = 'in_progress' WHERE id = ${contract.project_id} AND status = 'open'`
      await sql`UPDATE milestones SET status = 'pending' WHERE contract_id = ${id} AND status = 'in_progress'`
      await sql`
        INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details, ip_address, user_agent)
        VALUES (${auth.userId}, 'FREEZE_CONTRACT', 'contract', ${id},
          ${JSON.stringify({ reason, previousStatus: contract.status })},
          ${req.headers.get('x-forwarded-for') || 'unknown'}, ${req.headers.get('user-agent') || ''})
      `
      return NextResponse.json({ success: true, contract: updated[0], reason }, { status: 200 })
    } catch (err) {
      console.error('Error freezing contract:', err)
      return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
    }
  })(request)
}
