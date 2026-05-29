export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth(async (request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  try {
    const { fileUrl, fileName, fileType, description } = await request.json()
    if (!fileUrl || !fileName) return NextResponse.json({ error: 'Missing required fields', code: 'MISSING_FIELDS' }, { status: 400 })
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress}`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    const [evidence] = await sql`
      INSERT INTO dispute_evidence (dispute_id, file_url, file_name, file_type, uploaded_by, description)
      VALUES (${id}, ${fileUrl}, ${fileName}, ${fileType || 'other'}, ${user.id}, ${description || null})
      RETURNING *
    `
    return NextResponse.json(evidence, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to submit evidence', code: 'EVIDENCE_UPLOAD_FAILED' }, { status: 500 })
  }
})
