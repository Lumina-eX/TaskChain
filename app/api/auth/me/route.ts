export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'

export const GET = withAuth(async (_request, auth) => {
  const limited = await enforceRateLimit(_request, {
    key: buildRateLimitKey(_request, 'auth:me', auth.walletAddress),
    limit: 60,
    windowMs: 60_000,
  })
  if (limited) return limited

  return NextResponse.json({ walletAddress: auth.walletAddress, authenticated: true }, { status: 200 })
})
