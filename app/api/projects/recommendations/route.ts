// app/api/projects/recommendations/route.ts
//
// GET /api/projects/recommendations
//
// Returns personalised project recommendations for the authenticated
// freelancer.  The endpoint requires a valid JWT (withAuth middleware).
//
// Query parameters:
//   page   1-based page number (default 1)
//   limit  Items per page 1..50 (default 10)
//
// Response shape:
//   {
//     recommendations: RecommendationProject[],
//     totalCount: number,
//     hasMore: boolean,
//     fallbackUsed: boolean,
//     pagination: { page, pageSize, totalItems, hasMore }
//   }
//
// The algorithm combines weighted scores for skill match, budget fit,
// category affinity, and recency.  When insufficient matching data
// exists, the response falls back to recent/trending open projects.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { resolveUserIdByWallet } from '@/lib/auth/middleware'
import {
  getRecommendations,
  parseRecommendationParams,
  RecommendationError,
} from '@/lib/projectRecommendations'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: NextRequest, auth) => {
  try {
    // Resolve the integer user.id from the wallet address in the JWT.
    const userId = await resolveUserIdByWallet(auth.walletAddress)

    if (userId === null) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    const params = parseRecommendationParams(req.nextUrl.searchParams, userId)
    const result = await getRecommendations(params)

    return NextResponse.json(
      {
        recommendations: result.recommendations,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        fallbackUsed: result.fallbackUsed,
        pagination: {
          page: params.page,
          pageSize: result.recommendations.length,
          totalItems: result.totalCount,
          hasMore: result.hasMore,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (error) {
    if (error instanceof RecommendationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      )
    }

    console.error('[GET /api/projects/recommendations]', error)
    return NextResponse.json(
      { error: 'Failed to generate recommendations', code: 'RECOMMENDATION_FAILED' },
      { status: 500 },
    )
  }
})
