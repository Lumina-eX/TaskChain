/**
 * GET /api/freelancer/earnings
 *
 * Freelancer earnings & payment analytics for the authenticated wallet.
 * Query params:
 *   preset   — 7d | 30d | ytd | all | custom (default 30d)
 *   from/to  — ISO dates when preset=custom
 *   page     — pagination (default 1)
 *   pageSize — default 10, max 50
 *
 * Only the authenticated freelancer's own contracts/transactions are returned.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import {
  getFreelancerEarningsAnalytics,
  type DateRangePreset,
} from '@/lib/freelancer-earnings'

const PRESETS: DateRangePreset[] = ['7d', '30d', 'ytd', 'all', 'custom']

function parsePreset(raw: string | null): DateRangePreset {
  if (raw && PRESETS.includes(raw as DateRangePreset)) {
    return raw as DateRangePreset
  }
  return '30d'
}

async function resolveFreelancerId(walletAddress: string): Promise<string | null> {
  const rows = (await sql`
    SELECT id FROM users
    WHERE wallet_address = ${walletAddress}
    LIMIT 1
  `) as unknown as { id: string }[]
  return rows[0]?.id ?? null
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const freelancerId = await resolveFreelancerId(auth.walletAddress)
    if (!freelancerId) {
      return NextResponse.json(
        {
          error: 'Authenticated wallet has no platform account',
          code: 'USER_NOT_FOUND',
        },
        { status: 404 },
      )
    }

    const { searchParams } = new URL(request.url)
    const preset = parsePreset(searchParams.get('preset'))
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10),
    )

    const analytics = await getFreelancerEarningsAnalytics({
      freelancerId,
      preset,
      from,
      to,
      page,
      pageSize,
      allowDemoFallback: true,
    })

    return NextResponse.json(
      {
        data: analytics,
        meta: {
          walletAddress: auth.walletAddress,
          generatedAt: analytics.generatedAt,
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, max-age=60' },
      },
    )
  } catch (err) {
    console.error('[GET /api/freelancer/earnings]', err)
    return NextResponse.json(
      {
        error: 'Failed to fetch freelancer earnings analytics',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    )
  }
})
