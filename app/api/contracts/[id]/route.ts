export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '-/lib/auth/middleware'
import { sql } from '-/lib/db'
import { getUserById } from '-/lib/contracts/store'

export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'Invalid contract ID', code: 'INVALID_CONTRACT_ID' }, { status: 400 })
    }

    const contractId = Number(id)
    const walletAddress = auth.walletAddress

    // Fetch contract
    const contractRows = await sql`
      SELECT c.*, j.title as job_title
      FROM contracts c
      JOIN jobs j ON j.id = c.job_id
      WHERE c.id = ${contractId}
      LIMIT 1
    `

    if (contractRows.length === 0) {
      return NextResponse.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, { status: 404 })
    }

    const contract = contractRows[0]

    // Verify access: client or freelancer
    const clientRows = await sql`
      SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
    `
    const clientRow = clientRows[0]

    if (!clientRow || (clientRow.id !== contract.client_id && clientRow.id !== contract.freelancer_id)) {
      return NextResponse.json({ error: 'Access denied', code: 'ACCESS_DENIED' }, { status: 403 })
    }

    // Fetch client
    const client = await getUserById(contract.client_id)

    // Fetch freelancer
    const freelancer = await getUserById(contract.freelancer_id)

    // Fetch milestones linked to this contract
    const milestoneRows = await sql`
      SELECT id, title, description, amount, currency, due_date, status, sort_order
      FROM milestones
      WHERE contract_id = ${contractId}
      ORDER BY sort_order ASC, due_date ASC
    `
    const contractMilestones = milestoneRows.map((m: {
      id: number
      title: string
      description: string | null
      amount: string
      currency: string
      due_date: string | null
      status: string
      sort_order: number
    }) => ({
      id: String(m.id),
      title: m.title,
      description: m.description,
      amount: m.amount,
      currency: m.currency,
      due_date: m.due_date,
      status: m.status,
      sort_order: m.sort_order,
    }))

    // Fetch escrow info if available
    const escrowRows = await sql`
      SELECT escrow_address, escrow_status, funded_at, funding_tx_hash, total_amount as escrow_total_amount,
             funded_amount, released_amount, progress_percent, network_passphrase
      FROM jobs
      WHERE id = ${contract.job_id}
      LIMIT 1
    `
    const escrowRaw = escrowRows[0] as {
      escrow_address: string | null
      escrow_status: string | null
      funded_at: string | null
      funding_tx_hash: string | null
      escrow_total_amount: string
      funded_amount: number
      released_amount: number
      progress_percent: number
      network_passphrase: string | null
    } | undefined

    const escrow = escrowRaw ? {
      escrow_address: escrowRaw.escrow_address,
      escrow_status: escrowRaw.escrow_status ?? 'draft',
      total_amount: escrowRaw.escrow_total_amount,
      funded_amount: escrowRaw.funded_amount,
      released_amount: escrowRaw.released_amount,
      progress_percent: escrowRaw.progress_percent,
      network_passphrase: escrowRaw.network_passphrase,
      funded_at: escrowRaw.funded_at,
      funding_tx_hash: escrowRaw.funding_tx_hash,
    } : null

    // Fetch file metadata associated with this contract (latest version per file)
    let fileRows: unknown[] = []
    try {
      fileRows = await sql`
        SELECT fb.id, fb.contract_id, fb.milestone_id, fb.uploader_id, fb.file_name, fb.file_type,
               fb.file_size, fb.storage_key, fb.version, fb.created_at, fb.updated_at,
               fb.is_deleted, fb.deleted_at
        FROM files fb
        WHERE fb.contract_id = ${contractId}
          AND fb.is_deleted = false
        ORDER BY fb.created_at DESC
      `
    } catch (fileError) {
      console.error('[contracts/id] files query failed:', fileError)
      fileRows = []
    }

    return NextResponse.json({
      contract: {
        ...contract,
        client,
        freelancer,
        milestones: contractMilestones,
        escrow,
        files: fileRows,
      },
    })
  } catch (error) {
    console.error('[contracts/id] GET failed:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
