import { NextRequest, NextResponse } from "next/server";
import { withAuth, resolveUserIdByWallet } from "@/lib/auth/middleware";
import { getRecommendations } from "@/lib/db";

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, auth) => {
  const userId = await resolveUserIdByWallet(auth.walletAddress)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10))

  try {
    const result = await getRecommendations({
      userId,
      page,
      pageSize,
    })

    if (!result) {
      return NextResponse.json({ error: 'Freelancer profile not found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[recommendations]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
})
