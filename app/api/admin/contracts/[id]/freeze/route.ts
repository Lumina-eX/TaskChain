import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth/admin-middleware'
import { writeAuditLog } from '@/lib/admin/audit'
import { sql } from '@/lib/db'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const freezeSchema = z.object({
  reason: z.string().min(1).max(500),
})

export async function POST(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const contractId = parseInt(id, 10)
  if (isNaN(contractId)) {
    return NextResponse.json({ error: 'Invalid contract ID', code: 'INVALID_ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 })
  }

  const parsed = freezeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const existing = await sql`
    SELECT id, is_frozen, status FROM jobs WHERE id = ${contractId}
  `
  if (!existing[0]) {
    return NextResponse.json({ error: 'Contract not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const job = existing[0] as { id: number; is_frozen: boolean; status: string }
  if (job.is_frozen) {
    return NextResponse.json(
      { error: 'Contract is already frozen', code: 'ALREADY_FROZEN' },
      { status: 409 }
    )
  }

  const updated = await sql`
    UPDATE jobs
    SET
      is_frozen     = TRUE,
      frozen_at     = NOW(),
      freeze_reason = ${parsed.data.reason},
      updated_at    = NOW()
    WHERE id = ${contractId}
    RETURNING id, status, is_frozen, frozen_at, freeze_reason
  `

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'contract.freeze',
    resourceType: 'contract',
    resourceId: contractId,
    details: { reason: parsed.data.reason },
  })

  return NextResponse.json({ contract: updated[0] }, { status: 200 })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const contractId = parseInt(id, 10)
  if (isNaN(contractId)) {
    return NextResponse.json({ error: 'Invalid contract ID', code: 'INVALID_ID' }, { status: 400 })
  }

  const existing = await sql`
    SELECT id, is_frozen FROM jobs WHERE id = ${contractId}
  `
  if (!existing[0]) {
    return NextResponse.json({ error: 'Contract not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const job = existing[0] as { id: number; is_frozen: boolean }
  if (!job.is_frozen) {
    return NextResponse.json(
      { error: 'Contract is not frozen', code: 'NOT_FROZEN' },
      { status: 409 }
    )
  }

  const updated = await sql`
    UPDATE jobs
    SET
      is_frozen     = FALSE,
      frozen_at     = NULL,
      freeze_reason = NULL,
      updated_at    = NOW()
    WHERE id = ${contractId}
    RETURNING id, status, is_frozen, updated_at
  `

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'contract.unfreeze',
    resourceType: 'contract',
    resourceId: contractId,
  })

  return NextResponse.json({ contract: updated[0] }, { status: 200 })
}
