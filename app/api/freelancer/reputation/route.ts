import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import {
  getFreelancerReputation,
  getUserIdByWallet,
} from '@/lib/reputation'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const userId = await getUserIdByWallet(auth.walletAddress)
  if (userId === null) {
    return NextResponse.json(
      { error: 'Platform user not found for this wallet', code: 'USER_NOT_FOUND' },
      { status: 404 }
    )
  }

  const forceRefresh =
    request.nextUrl.searchParams.get('refresh') === '1' ||
    request.nextUrl.searchParams.get('refresh') === 'true'

  try {
    const payload = await getFreelancerReputation(userId, { forceRefresh })
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load reputation', code: 'REPUTATION_UNAVAILABLE' },
      { status: 503 }
    )
  }
})
