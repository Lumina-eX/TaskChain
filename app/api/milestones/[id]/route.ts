export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export const PATCH = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').pop()

  if (!id) {
    return NextResponse.json({ error: 'Milestone ID is required' }, { status: 400 })
  }

  // 1. Authenticate user wallet
  const userRows = await sql<{ id: string; role: string }[]>`
    SELECT id, role FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (!userRows.length) {
    return NextResponse.json({ error: 'Authenticated user not found in database' }, { status: 404 })
  }
  const userId = userRows[0].id

  // 2. Read state update request
  let body;
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const { status } = body
  const allowedStatuses = ['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'paid']
  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid milestone status. Must be one of: ${allowedStatuses.join(', ')}` }, { status: 400 })
  }

  // 3. Find milestone and join with projects & contracts to verify permissions
  const milestoneRows = await sql<{
    id: string
    project_id: string
    status: string
    client_id: string
    freelancer_id: string | null
  }[]>`
    SELECT 
      m.id, 
      m.project_id, 
      m.status, 
      p.client_id, 
      c.freelancer_id
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    LEFT JOIN contracts c ON c.project_id = p.id
    WHERE m.id = ${id} 
    LIMIT 1
  `

  if (!milestoneRows.length) {
    return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  }

  const milestone = milestoneRows[0]
  const isClient = milestone.client_id === userId
  const isFreelancer = milestone.freelancer_id === userId

  if (!isClient && !isFreelancer) {
    return NextResponse.json({ error: 'Unauthorized: You are not a party to this contract' }, { status: 403 })
  }

  // 4. State transition rules checking (for production safety, while keeping it flexible)
  // Freelancer can: start (pending -> in_progress) and submit (in_progress -> submitted)
  // Client can: approve (submitted -> approved), reject (submitted -> rejected), and pay (approved -> paid)
  if (isFreelancer && !isClient) {
    if (status !== 'in_progress' && status !== 'submitted') {
      return NextResponse.json({ error: `Forbidden: As a freelancer, you cannot set status to ${status}` }, { status: 403 })
    }
  }

  if (isClient && !isFreelancer) {
    if (status !== 'approved' && status !== 'rejected' && status !== 'paid') {
      return NextResponse.json({ error: `Forbidden: As a client, you cannot set status to ${status}` }, { status: 403 })
    }
  }

  // 5. Build dynamic query for updates, adding dates where applicable
  let updatedRows;
  
  if (status === 'submitted') {
    updatedRows = await sql<any[]>`
      UPDATE milestones 
      SET status = ${status}, submitted_at = NOW(), updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `
  } else if (status === 'approved') {
    updatedRows = await sql<any[]>`
      UPDATE milestones 
      SET status = ${status}, approved_at = NOW(), updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `
  } else if (status === 'paid') {
    updatedRows = await sql<any[]>`
      UPDATE milestones 
      SET status = ${status}, paid_at = NOW(), updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `
  } else {
    // pending, in_progress, rejected
    updatedRows = await sql<any[]>`
      UPDATE milestones 
      SET status = ${status}, updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `
  }

  if (!updatedRows.length) {
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    milestone: updatedRows[0] 
  })
})
