export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createJobHandlers, jobQueueService } from '@/lib/jobs'

function authorized(request: NextRequest): boolean {
  const expected = process.env.JOB_WORKER_SECRET
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !provided) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Number.isInteger(body.batchSize) ? body.batchSize : 10
    const data = await jobQueueService.processBatch({
      workerId: typeof body.workerId === 'string' && body.workerId.trim() ? body.workerId.trim() : 'api-worker',
      batchSize,
      handlers: createJobHandlers(),
    })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[api/jobs/process] Error:', error)
    return NextResponse.json({ error: 'Job processing failed', code: 'JOB_PROCESS_FAILED' }, { status: 500 })
  }
}
