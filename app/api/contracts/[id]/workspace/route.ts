export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

type Row = Record<string, unknown>

/**
 * GET /api/contracts/:id/workspace
 *
 * Returns all milestones for the contract, each with their deliverable files
 * and submission history entries. Access is restricted to the contract's
 * client and freelancer.
 */
export const GET = withAuthCtx<RouteContext>(async (request: NextRequest, auth, context) => {
  const { id: contractId } = await context.params

  try {
    // Resolve requesting user
    const userRows = (await sql`
      SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `) as unknown as Row[]
    const user = userRows[0]
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    // Fetch the contract and verify access
    const contractRows = (await sql`
      SELECT
        c.id,
        c.status,
        c.client_id,
        c.freelancer_id,
        c.total_amount,
        c.currency,
        p.title   AS project_title,
        client_u.display_name  AS client_name,
        client_u.username      AS client_username,
        free_u.display_name    AS freelancer_name,
        free_u.username        AS freelancer_username
      FROM contracts c
      JOIN projects p        ON p.id = c.project_id
      JOIN users client_u    ON client_u.id = c.client_id
      LEFT JOIN users free_u ON free_u.id = c.freelancer_id
      WHERE c.id = ${contractId}
      LIMIT 1
    `) as unknown as Row[]
    const contract = contractRows[0]

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' },
        { status: 404 },
      )
    }

    if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    // Fetch milestones for this contract
    const milestones = (await sql`
      SELECT
        id,
        title,
        description,
        status,
        sort_order,
        due_date,
        amount,
        currency,
        submitted_at,
        approved_at
      FROM milestones
      WHERE contract_id = ${contractId}
      ORDER BY sort_order ASC, created_at ASC
    `) as unknown as Row[]

    if (milestones.length === 0) {
      return NextResponse.json({
        contract: {
          id: contract.id,
          status: contract.status,
          project_title: contract.project_title,
          total_amount: contract.total_amount,
          currency: contract.currency,
          client: { name: contract.client_name, username: contract.client_username },
          freelancer: { name: contract.freelancer_name, username: contract.freelancer_username },
        },
        milestones: [],
        total_files: 0,
      })
    }

    const milestoneIds = milestones.map((m) => m.id as string)

    // Fetch all (non-removed) deliverables across those milestones in one query
    const deliverables = (await sql`
      SELECT
        md.id,
        md.milestone_id,
        md.original_filename,
        md.mime_type,
        md.file_size,
        md.created_at,
        md.uploader_id,
        u.display_name AS uploader_display_name,
        u.username     AS uploader_username
      FROM milestone_deliverables md
      JOIN users u ON u.id = md.uploader_id
      WHERE md.milestone_id = ANY(${milestoneIds}::uuid[])
        AND md.is_removed = FALSE
      ORDER BY md.milestone_id, md.created_at ASC
    `) as unknown as Row[]

    // Group deliverables by milestone
    const deliverablesByMilestone: Record<string, Row[]> = {}
    for (const d of deliverables) {
      const mid = d.milestone_id as string
      if (!deliverablesByMilestone[mid]) deliverablesByMilestone[mid] = []
      deliverablesByMilestone[mid].push(d)
    }

    // Fetch submission history for version tracking
    const historyRows = (await sql`
      SELECT
        h.id,
        h.milestone_id,
        h.submission_type,
        h.deliverable_notes,
        h.deliverable_links,
        h.feedback,
        h.revision_notes,
        h.created_at,
        submitter.display_name AS submitter_name,
        submitter.username     AS submitter_username
      FROM milestone_submission_history h
      LEFT JOIN users submitter ON submitter.id = h.submitted_by
      WHERE h.milestone_id = ANY(${milestoneIds}::uuid[])
      ORDER BY h.milestone_id, h.created_at DESC
    `) as unknown as Row[]

    // Group history by milestone
    const historyByMilestone: Record<string, Row[]> = {}
    for (const h of historyRows) {
      const mid = h.milestone_id as string
      if (!historyByMilestone[mid]) historyByMilestone[mid] = []
      historyByMilestone[mid].push(h)
    }

    // Assemble response
    const result = milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      sort_order: m.sort_order,
      due_date: m.due_date,
      amount: m.amount,
      currency: m.currency,
      submitted_at: m.submitted_at,
      approved_at: m.approved_at,
      files: (deliverablesByMilestone[m.id as string] ?? []).map((d) => ({
        id: d.id,
        original_filename: d.original_filename,
        mime_type: d.mime_type,
        file_size: d.file_size,
        created_at: d.created_at,
        uploader: {
          id: d.uploader_id,
          display_name: d.uploader_display_name,
          username: d.uploader_username,
        },
      })),
      submission_history: (historyByMilestone[m.id as string] ?? []).map((h) => ({
        id: h.id,
        submission_type: h.submission_type,
        deliverable_notes: h.deliverable_notes,
        deliverable_links: h.deliverable_links,
        feedback: h.feedback,
        revision_notes: h.revision_notes,
        created_at: h.created_at,
        submitter: {
          display_name: h.submitter_name,
          username: h.submitter_username,
        },
      })),
    }))

    return NextResponse.json({
      contract: {
        id: contract.id,
        status: contract.status,
        project_title: contract.project_title,
        total_amount: contract.total_amount,
        currency: contract.currency,
        client: { name: contract.client_name, username: contract.client_username },
        freelancer: { name: contract.freelancer_name, username: contract.freelancer_username },
      },
      milestones: result,
      total_files: deliverables.length,
    })
  } catch (err) {
    console.error('[workspace] Error fetching workspace data:', err)
    return NextResponse.json(
      { error: 'Failed to load workspace', code: 'WORKSPACE_FETCH_FAILED' },
      { status: 500 },
    )
  }
})
