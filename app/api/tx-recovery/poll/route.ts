export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { txRecoveryService } from '@/lib/tx-recovery'

function authorized(request: NextRequest): boolean {
  const expected = process.env.TX_RECOVERY_WORKER_SECRET
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !provided) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Number.isInteger(body.batchSize) ? body.batchSize : 50
    return NextResponse.json({ data: await txRecoveryService.pollPendingQueue(batchSize) })
  } catch (error) {
    console.error('[api/tx-recovery/poll] Error:', error)
    return NextResponse.json({ error: 'Polling cycle failed', code: 'TX_POLL_FAILED' }, { status: 500 })
  }
}
