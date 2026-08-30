export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { downloadEvidence } from '../route'

type RouteContext = { params: Promise<{ id: string; evidenceId: string }> }

export const GET = withAuthCtx(async (request: NextRequest, auth, context: RouteContext) => {
  const { id, evidenceId } = await context.params
  return downloadEvidence(request, auth, id, evidenceId)
})
