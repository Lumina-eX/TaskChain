// app/api/projects/discover/route.ts
//
// GET /api/projects/discover — public project discovery endpoint.
//
// Supported query parameters:
//   q / query        free-text search over title & description
//   status           repeatable / comma-separated project status(es)
//   skills           repeatable / comma-separated required skill(s)
//   minBudget        inclusive lower budget bound
//   maxBudget        inclusive upper budget bound
//   sort             created_at | budget | deadline   (default created_at)
//   order            asc | desc                        (default desc)
//   page             1-based page number               (default 1)
//   limit            items per page, max 50            (default 9)

import { NextRequest, NextResponse } from 'next/server'
import {
  buildListResponse,
  parseDiscoveryParams,
  ProjectDiscoveryError,
} from '@/lib/projectDiscovery'

export async function GET(req: NextRequest) {
  try {
    const params = parseDiscoveryParams(req.nextUrl.searchParams)
    const payload = await buildListResponse(params)
    return NextResponse.json(payload)
  } catch (err) {
    if (err instanceof ProjectDiscoveryError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      )
    }
    console.error('[GET /api/projects/discover]', err)
    return NextResponse.json(
      { error: 'Unable to load projects', code: 'PROJECT_LIST_FAILED' },
      { status: 503 },
    )
  }
}
