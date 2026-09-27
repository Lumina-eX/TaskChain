export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { txActionTypes, txRecoveryService, TxRecoveryError } from '@/lib/tx-recovery'

const schema = z.object({
  txHash: z.string().trim().regex(/^[0-9a-fA-F]{64}$/),
  network: z.enum(['stellar', 'soroban']).default('stellar'),
  actionType: z.enum(txActionTypes),
  contractId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  maxRetries: z.number().int().min(1).max(50).default(10),
})

export const POST = withAuth(async (request: NextRequest, auth) => {
  let input: z.infer<typeof schema>
  try {
    input = schema.parse(await request.json())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.issues : 'Request body must be valid JSON', code: 'INVALID_TRANSACTION' },
      { status: 422 }
    )
  }
  const users = await sql.query('SELECT id FROM users WHERE wallet_address=$1 LIMIT 1', [auth.walletAddress]) as Array<{ id: string }>
  if (!users.length) return NextResponse.json({ error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' }, { status: 401 })
  const userId = users[0].id
  if (input.contractId || input.milestoneId) {
    const allowed = await sql.query(
      `SELECT 1 FROM contracts c LEFT JOIN milestones m ON m.contract_id=c.id
        WHERE (c.id=$1::uuid OR m.id=$2::uuid) AND (c.client_id=$3::uuid OR c.freelancer_id=$3::uuid) LIMIT 1`,
      [input.contractId ?? null, input.milestoneId ?? null, userId]
    ) as Array<Record<string, unknown>>
    if (!allowed.length) return NextResponse.json({ error: 'Transaction context is not accessible', code: 'FORBIDDEN_CONTEXT' }, { status: 403 })
  }
  try {
    const result = await txRecoveryService.submitTransaction({ ...input, userId, txHash: input.txHash.toLowerCase() })
    const data = await txRecoveryService.getTransactionStatus(input.txHash)
    return NextResponse.json(
      { message: result.isDuplicate ? 'Transaction is already tracked.' : 'Transaction submitted for tracking.', isDuplicate: result.isDuplicate, data },
      { status: result.isDuplicate ? 409 : 201 }
    )
  } catch (error) {
    if (error instanceof TxRecoveryError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus })
    console.error('[api/tx-recovery/submit] Error:', error)
    return NextResponse.json({ error: 'Failed to submit transaction', code: 'TX_SUBMIT_FAILED' }, { status: 500 })
  }
})
