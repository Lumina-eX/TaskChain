export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { z } from 'zod'
import { verifyAccessToken } from '@/lib/auth/session'

const MOCK_WALLET = 'GMOCKUSER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'

const milestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  dueDate: z.string().datetime().optional(),
})

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  deadline: z.string().datetime(),
  totalAmount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().min(1),
  terms: z.string().optional(),
  milestones: z.array(milestoneSchema).min(1),
})

async function saveProject(walletAddress: string, body: z.infer<typeof bodySchema>) {
  let rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `
  if (!rows.length) {
    rows = await sql<{ id: string }[]>`
      INSERT INTO users (wallet_address, username, email, role)
      VALUES (
        ${walletAddress},
        ${'dev_' + walletAddress.slice(-8).toLowerCase()},
        ${'dev_' + walletAddress.slice(-8).toLowerCase() + '@mock.local'},
        'client'
      )
      ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
      RETURNING id
    `
  }

  const clientId = rows[0]?.id
  if (!clientId) throw new Error('Could not resolve user')

  const projectRows = await sql<{ id: string }[]>`
    INSERT INTO projects (
      client_id, title, description, category,
      budget_min, budget_max, currency, deadline, status
    ) VALUES (
      ${clientId}, ${body.title}, ${body.description},
      ${body.category ?? null}, ${body.totalAmount}, ${body.totalAmount},
      ${body.currency}, ${body.deadline}, 'draft'
    )
    RETURNING id
  `

  const projectId = projectRows[0]?.id
  if (!projectId) throw new Error('Failed to create project')

  for (const [i, m] of body.milestones.entries()) {
    await sql`
      INSERT INTO milestones (
        project_id, title, description, amount,
        currency, due_date, sort_order, status
      ) VALUES (
        ${projectId}, ${m.title}, ${m.description ?? null},
        ${m.amount}, ${body.currency}, ${m.dueDate ?? null}, ${i}, 'pending'
      )
    `
  }

  return { projectId, title: body.title, milestonesCreated: body.milestones.length }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let walletAddress: string | null = null

  const authHeader = request.headers.get('authorization')
  const cookieToken = request.cookies.get('tc_access_token')?.value
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken

  if (rawToken) {
    const payload = verifyAccessToken(rawToken)
    if (payload) walletAddress = payload.walletAddress
  }

  if (!walletAddress) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    walletAddress = MOCK_WALLET
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await saveProject(walletAddress, parsed.data)
    return NextResponse.json({ ...result, status: 'draft' }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Database error' }, { status: 500 })
  }
}
