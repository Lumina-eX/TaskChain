export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { CreateMilestoneSchema } from '@/lib/validations'
import { activityService } from '@/lib/activity'
import { contractAuditLogService } from '@/lib/audit-log'

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

  const parsed = CreateMilestoneSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'INVALID_REQUEST_BODY', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { project_id, title, description, amount, currency, due_date, sort_order, deliverables } = parsed.data

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    const [project] = await sql`SELECT id FROM projects WHERE id = ${project_id} AND client_id = ${user.id} LIMIT 1`
    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied', code: 'PROJECT_NOT_FOUND' }, { status: 404 })
    }

    const [milestone] = await sql`
      INSERT INTO milestones (project_id, title, description, amount, currency, due_date, sort_order, deliverables)
      VALUES (
        ${project_id},
        ${title},
        ${description ?? null},
        ${amount},
        ${currency},
        ${due_date ? due_date.toISOString() : null},
        ${sort_order},
        ${JSON.stringify(deliverables)}
      )
      RETURNING *
    `

    activityService.log({
      actorId: user.id,
      projectId: project_id,
      milestoneId: milestone.id,
      actionType: 'milestone_created',
      description: `Milestone "${title}" created with amount ${amount} ${currency}`,
      metadata: { amount, currency, sort_order },
    }).catch((err: unknown) => console.error('[activity] Failed to log milestone_created:', err))

    // Audit log: milestone_creation (only if milestone is linked to a contract)
    if (milestone.contract_id) {
      contractAuditLogService.createLog({
        contractId: milestone.contract_id,
        projectId: project_id,
        action: 'milestone_creation',
        actorUserId: user.id,
        actorWallet: auth.walletAddress,
        milestoneId: milestone.id,
        newState: 'pending',
        metadata: { title, amount, currency, sort_order },
      }, auth.walletAddress).catch((err: unknown) => console.error('[audit-log] Failed to log milestone_creation:', err))
    }

    return NextResponse.json({ milestone }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create milestone', code: 'MILESTONE_CREATE_FAILED' }, { status: 500 })
  }
})
