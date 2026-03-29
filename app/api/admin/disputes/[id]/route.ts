import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth/admin-middleware'
import { writeAuditLog } from '@/lib/admin/audit'
import { sql } from '@/lib/db'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved']).optional(),
  resolution: z.string().min(1).max(2000).optional(),
})

export async function GET(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const disputeId = parseInt(id, 10)
  if (isNaN(disputeId)) {
    return NextResponse.json({ error: 'Invalid dispute ID', code: 'INVALID_ID' }, { status: 400 })
  }

  const rows = await sql`
    SELECT
      d.id, d.job_id, d.reason, d.status, d.resolution,
      d.resolved_at, d.created_at, d.updated_at,
      u.id             AS raised_by_id,
      u.username       AS raised_by_username,
      u.wallet_address AS raised_by_wallet,
      j.title          AS job_title,
      j.status         AS job_status,
      j.budget, j.currency,
      j.is_frozen,
      c.username       AS client_username,
      f.username       AS freelancer_username
    FROM disputes d
    JOIN users u  ON u.id = d.raised_by
    JOIN jobs  j  ON j.id = d.job_id
    JOIN users c  ON c.id = j.client_id
    LEFT JOIN users f ON f.id = j.freelancer_id
    WHERE d.id = ${disputeId}
  `

  if (!rows[0]) {
    return NextResponse.json({ error: 'Dispute not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'dispute.view',
    resourceType: 'dispute',
    resourceId: disputeId,
  })

  return NextResponse.json({ dispute: rows[0] })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const disputeId = parseInt(id, 10)
  if (isNaN(disputeId)) {
    return NextResponse.json({ error: 'Invalid dispute ID', code: 'INVALID_ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const { status, resolution } = parsed.data
  if (!status && !resolution) {
    return NextResponse.json(
      { error: 'Provide at least one field to update', code: 'EMPTY_UPDATE' },
      { status: 400 }
    )
  }

  const existing = await sql`SELECT id FROM disputes WHERE id = ${disputeId}`
  if (!existing[0]) {
    return NextResponse.json({ error: 'Dispute not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const updated = await sql`
    UPDATE disputes
    SET
      status      = COALESCE(${status ?? null}, status),
      resolution  = COALESCE(${resolution ?? null}, resolution),
      resolved_at = CASE
                      WHEN ${status ?? null} = 'resolved' AND resolved_at IS NULL
                        THEN NOW()
                      ELSE resolved_at
                    END,
      updated_at  = NOW()
    WHERE id = ${disputeId}
    RETURNING id, status, resolution, resolved_at, updated_at
  `

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'dispute.update',
    resourceType: 'dispute',
    resourceId: disputeId,
    details: { status, resolution },
  })

  return NextResponse.json({ dispute: updated[0] })
}
