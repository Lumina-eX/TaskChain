export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'

export const GET = withAuth(async (_request, auth) => {
  const limited = await enforceRateLimit(_request, {
    key: buildRateLimitKey(_request, 'auth:me', auth.walletAddress),
    limit: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  let role: string | null = null
  try {
    const rows = (await sql`
      SELECT role FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `) as { role: string }[]
    role = rows[0]?.role ?? null
  } catch {
    role = null
  }

  return NextResponse.json(
    { walletAddress: auth.walletAddress, authenticated: true, role },
    { status: 200 }
  )
})
