export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'
import { getFreelancerReputation, userExists } from '@/lib/reputation'

type RouteContext = { params: Promise<{ userId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const limited = await enforceRateLimit(_request, {
    key: buildRateLimitKey(_request, 'freelancers:reputation'),
    limit: 120,
    windowMs: 60_000,
  })
  if (limited) return limited

  const { userId: rawId } = await context.params
  const id = Number.parseInt(rawId, 10)
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid user id', code: 'INVALID_USER_ID' }, { status: 400 })
  }

  const exists = await userExists(id)
  if (!exists) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

  try {
    const payload = await getFreelancerReputation(id)
    return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load reputation', code: 'REPUTATION_UNAVAILABLE' }, { status: 503 })
  }
}
