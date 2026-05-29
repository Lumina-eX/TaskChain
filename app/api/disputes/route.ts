export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

export const POST = withAuth(async (request: NextRequest, auth) => {
  try {
    const body = await request.json()
    const { jobId, reason } = body
    if (!jobId || !reason) {
      return NextResponse.json({ error: 'Missing required fields: jobId, reason', code: 'MISSING_FIELDS' }, { status: 400 })
    }
    const [job] = await sql`SELECT id, client_id, freelancer_id FROM jobs WHERE id = ${jobId}`
    if (!job) return NextResponse.json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }, { status: 404 })
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress}`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    const [dispute] = await sql`INSERT INTO disputes (job_id, raised_by, reason) VALUES (${job.id}, ${user.id}, ${reason}) RETURNING *`
    await sql`UPDATE jobs SET status = 'disputed', updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`
    return NextResponse.json(dispute, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to raise dispute', code: 'DISPUTE_CREATION_FAILED' }, { status: 500 })
  }
})

export const GET = withAuth(async (_request: NextRequest, auth) => {
  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress}`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    const disputes = await sql`
      SELECT d.*, j.title as job_title, u.username as raised_by_username
      FROM disputes d JOIN jobs j ON d.job_id = j.id JOIN users u ON d.raised_by = u.id
      WHERE j.client_id = ${user.id} OR j.freelancer_id = ${user.id}
      ORDER BY d.created_at DESC
    `
    return NextResponse.json(disputes, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch disputes', code: 'DISPUTES_FETCH_FAILED' }, { status: 500 })
  }
})
