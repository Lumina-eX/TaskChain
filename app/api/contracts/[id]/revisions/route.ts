export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { listContractRevisions } from '@/lib/contracts/revisions'

// GET /api/contracts/:id/revisions - Read-only contract change history
export const GET = withAuth(async (request: NextRequest, auth) => {
  const contractId = request.nextUrl.pathname.split('/').at(-2)

  try {
    const [user] = (await sql`
      SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `) as Array<{ id: string }>
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const [contract] = (await sql`
      SELECT id, client_id, freelancer_id FROM contracts WHERE id = ${contractId} LIMIT 1
    `) as Array<{ id: string; client_id: string; freelancer_id: string }>
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, { status: 404 })
    }

    if (user.id !== contract.client_id && user.id !== contract.freelancer_id) {
      return NextResponse.json({ error: 'Access denied', code: 'ACCESS_DENIED' }, { status: 403 })
    }

    const revisions = await listContractRevisions(String(contract.id))
    return NextResponse.json({ contractId: String(contract.id), revisions })
  } catch (error) {
    console.error('[GET /api/contracts/[id]/revisions]', error)
    return NextResponse.json(
      { error: 'Failed to load contract revisions', code: 'REVISIONS_FETCH_FAILED' },
      { status: 500 },
    )
  }
})
