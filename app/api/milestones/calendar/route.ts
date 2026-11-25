export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'

export interface CalendarMilestone {
  id: string
  title: string
  description: string | null
  amount: string
  currency: string
  due_date: string
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'paid'
  contract_id: string | null
  contract_title: string | null
  project_id: string | null
  sort_order: number
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const url = new URL(request.url)
    const contractId = url.searchParams.get('contract_id')
    const status = url.searchParams.get('status')
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')

    // Resolve user id
    const userRows = await sql`
      SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `
    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }
    const userId = userRows[0].id

    // Build dynamic query — fetch milestones for contracts where the user is client or freelancer.
    // We always filter to milestones that have a due_date so they can be placed on the calendar.
    const rows = await sql`
      SELECT
        m.id,
        m.title,
        m.description,
        m.amount,
        m.currency,
        m.due_date,
        m.status,
        m.contract_id,
        m.project_id,
        m.sort_order,
        j.title AS contract_title
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      LEFT JOIN jobs j ON j.id = c.job_id
      WHERE m.due_date IS NOT NULL
        AND (
          c.client_id = ${userId}
          OR c.freelancer_id = ${userId}
          OR (
            m.contract_id IS NULL
            AND m.project_id IN (
              SELECT id FROM projects WHERE client_id = ${userId}
            )
          )
        )
        AND (${contractId}::text IS NULL OR m.contract_id = ${contractId}::integer)
        AND (${status}::text IS NULL OR m.status = ${status}::text)
        AND (${startDate}::date IS NULL OR m.due_date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR m.due_date <= ${endDate}::date)
      ORDER BY m.due_date ASC, m.sort_order ASC
    `

    const milestones: CalendarMilestone[] = rows.map((row: {
      id: number | string
      title: string
      description: string | null
      amount: string
      currency: string
      due_date: string
      status: string
      contract_id: number | string | null
      contract_title: string | null
      project_id: number | string | null
      sort_order: number
    }) => ({
      id: String(row.id),
      title: row.title,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      due_date: new Date(row.due_date).toISOString(),
      status: row.status as CalendarMilestone['status'],
      contract_id: row.contract_id != null ? String(row.contract_id) : null,
      contract_title: row.contract_title,
      project_id: row.project_id != null ? String(row.project_id) : null,
      sort_order: row.sort_order,
    }))

    // Also return a list of unique contracts for the filter dropdown
    const contractsForFilter = Array.from(
      new Map(
        milestones
          .filter((m) => m.contract_id !== null)
          .map((m) => [m.contract_id, { id: m.contract_id!, title: m.contract_title ?? `Contract #${m.contract_id}` }])
      ).values()
    )

    return NextResponse.json({ milestones, contracts: contractsForFilter })
  } catch (err) {
    console.error('[GET /api/milestones/calendar]', err)
    return NextResponse.json(
      { error: 'Failed to fetch calendar milestones', code: 'CALENDAR_FETCH_FAILED' },
      { status: 500 }
    )
  }
})
