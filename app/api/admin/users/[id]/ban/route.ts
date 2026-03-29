import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth/admin-middleware'
import { writeAuditLog } from '@/lib/admin/audit'
import { sql } from '@/lib/db'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const banSchema = z.object({
  reason: z.string().min(1).max(500),
})

export async function POST(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const userId = parseInt(id, 10)
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID', code: 'INVALID_ID' }, { status: 400 })
  }

  if (userId === admin.userId) {
    return NextResponse.json(
      { error: 'Admins cannot ban themselves', code: 'SELF_BAN' },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 })
  }

  const parsed = banSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const existing = await sql`
    SELECT id, is_banned, username FROM users WHERE id = ${userId}
  `
  if (!existing[0]) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const user = existing[0] as { id: number; is_banned: boolean; username: string }
  if (user.is_banned) {
    return NextResponse.json(
      { error: 'User is already banned', code: 'ALREADY_BANNED' },
      { status: 409 }
    )
  }

  const updated = await sql`
    UPDATE users
    SET
      is_banned  = TRUE,
      banned_at  = NOW(),
      ban_reason = ${parsed.data.reason},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, username, is_banned, banned_at, ban_reason
  `

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'user.ban',
    resourceType: 'user',
    resourceId: userId,
    details: { reason: parsed.data.reason },
  })

  return NextResponse.json({ user: updated[0] }, { status: 200 })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const adminOrError = await checkAdmin(request)
  if (adminOrError instanceof NextResponse) return adminOrError
  const admin = adminOrError

  const { id } = await context.params
  const userId = parseInt(id, 10)
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID', code: 'INVALID_ID' }, { status: 400 })
  }

  const existing = await sql`
    SELECT id, is_banned FROM users WHERE id = ${userId}
  `
  if (!existing[0]) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const user = existing[0] as { id: number; is_banned: boolean }
  if (!user.is_banned) {
    return NextResponse.json(
      { error: 'User is not banned', code: 'NOT_BANNED' },
      { status: 409 }
    )
  }

  const updated = await sql`
    UPDATE users
    SET
      is_banned  = FALSE,
      banned_at  = NULL,
      ban_reason = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, username, is_banned, updated_at
  `

  await writeAuditLog({
    adminWallet: admin.walletAddress,
    action: 'user.unban',
    resourceType: 'user',
    resourceId: userId,
  })

  return NextResponse.json({ user: updated[0] }, { status: 200 })
}
