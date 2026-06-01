export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').pop()

  const userRows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const projectRows = await sql<any[]>`
    SELECT 
      p.id,
      p.client_id,
      p.title,
      p.description,
      p.status,
      p.budget_max,
      p.currency,
      p.deadline,
      p.created_at,
      c.id AS contract_id,
      c.total_amount AS contract_total_amount,
      c.escrow_address AS contract_escrow_address,
      c.escrow_status AS contract_escrow_status,
      c.status AS contract_status,
      c.funded_at AS contract_funded_at,
      c.funding_tx_hash AS contract_funding_tx_hash,
      -- client info
      u_client.display_name AS client_display_name,
      u_client.username AS client_username,
      u_client.avatar_url AS client_avatar_url,
      u_client.wallet_address AS client_wallet_address,
      -- freelancer info
      u_freelancer.display_name AS freelancer_display_name,
      u_freelancer.username AS freelancer_username,
      u_freelancer.avatar_url AS freelancer_avatar_url,
      u_freelancer.wallet_address AS freelancer_wallet_address,
      u_freelancer.avg_rating AS freelancer_avg_rating,
      u_freelancer.total_reviews AS freelancer_total_reviews
    FROM projects p
    LEFT JOIN contracts c ON c.project_id = p.id
    LEFT JOIN users u_client ON p.client_id = u_client.id
    LEFT JOIN users u_freelancer ON c.freelancer_id = u_freelancer.id
    WHERE p.id = ${id} AND (p.client_id = ${userRows[0].id} OR c.freelancer_id = ${userRows[0].id})
    LIMIT 1
  `
  if (!projectRows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const milestones = await sql<{
    id: string; title: string; description: string | null; amount: string
    currency: string; due_date: string | null; status: string; sort_order: number
  }[]>`
    SELECT id, title, description, amount, currency, due_date, status, sort_order
    FROM milestones WHERE project_id = ${id} ORDER BY sort_order ASC, created_at ASC
  `

  const project = projectRows[0]
  const hasEscrow = !!project.contract_id
  const escrowStatus = project.contract_escrow_status
  const escrowTotal = project.contract_total_amount ? parseFloat(project.contract_total_amount) : 0

  let escrowFundedAmount = 0
  if (escrowStatus === 'funded' || escrowStatus === 'partially_released' || escrowStatus === 'fully_released') {
    escrowFundedAmount = escrowTotal
  }

  const escrowReleasedAmount = milestones
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + parseFloat(m.amount), 0)

  const responseProject = {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    budget_max: project.budget_max,
    currency: project.currency,
    deadline: project.deadline,
    created_at: project.created_at,
    client: {
      display_name: project.client_display_name,
      username: project.client_username,
      avatar_url: project.client_avatar_url,
      wallet_address: project.client_wallet_address
    },
    freelancer: project.freelancer_wallet_address ? {
      display_name: project.freelancer_display_name,
      username: project.freelancer_username,
      avatar_url: project.freelancer_avatar_url,
      wallet_address: project.freelancer_wallet_address,
      avg_rating: project.freelancer_avg_rating ? parseFloat(project.freelancer_avg_rating) : 0,
      total_reviews: project.freelancer_total_reviews ? parseInt(project.freelancer_total_reviews) : 0
    } : null,
    escrow: hasEscrow ? {
      escrow_address: project.contract_escrow_address,
      escrow_status: project.contract_escrow_status,
      funded_at: project.contract_funded_at,
      funding_tx_hash: project.contract_funding_tx_hash,
      total_amount: project.contract_total_amount,
      funded_amount: escrowFundedAmount,
      released_amount: escrowReleasedAmount,
      progress_percent: escrowFundedAmount > 0 ? Math.round((escrowReleasedAmount / escrowFundedAmount) * 100) : 0
    } : null
  }

  return NextResponse.json({ project: responseProject, milestones })
})
