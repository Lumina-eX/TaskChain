export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  try {
    const { contractState } = await request.json()
    if (!contractState) return NextResponse.json({ error: 'Missing contractState', code: 'MISSING_FIELDS' }, { status: 400 })
    const [updated] = await sql`UPDATE disputes SET updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *`
    if (!updated) return NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 })
    return NextResponse.json(updated, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to update contract state', code: 'CONTRACT_UPDATE_FAILED' }, { status: 500 })
  }
})
