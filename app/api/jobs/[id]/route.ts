export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { JobQueueError, jobQueueService } from '@/lib/jobs'

export const GET = withAuthCtx(async (
  _request: NextRequest,
  _auth,
  context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Job id must be a UUID.', code: 'INVALID_JOB_ID' }, { status: 422 })
  }

  try {
    return NextResponse.json({ data: await jobQueueService.getJob(id) })
  } catch (error) {
    if (error instanceof JobQueueError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus })
    }
    console.error('[api/jobs/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to load job', code: 'JOB_QUERY_FAILED' }, { status: 500 })
  }
})
