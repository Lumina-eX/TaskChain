import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'            // REPLACE
import { sql } from '@/lib/db'
import { createDisputeSchema, isUuid, isParticipant, err, ELIGIBLE_CONTRACT_STATUSES } from '@/lib/disputes'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return err(400, 'invalid_contract_id')
  const user = await getCurrentUser(req)
  if (!user) return err(401, 'unauthorized')

  const parsed = createDisputeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return err(400, 'validation_error', parsed.error.issues[0]?.message)

  const [contract] = await sql`SELECT id, client_id, freelancer_id, status FROM contracts WHERE id = ${id}`  // REPLACE columns
  if (!contract) return err(404, 'contract_not_found')
  if (!isParticipant(contract, user.id)) return err(403, 'forbidden')
  if (!ELIGIBLE_CONTRACT_STATUSES.includes(contract.status)) return err(409, 'contract_not_eligible')

  const rows = await sql`
    WITH ins AS (
      INSERT INTO disputes (contract_id, opened_by, reason)
      VALUES (${id}, ${user.id}, ${parsed.data.reason})
      ON CONFLICT (contract_id) WHERE status <> 'resolved' DO NOTHING
      RETURNING *
    ), ev AS (
      INSERT INTO dispute_events (dispute_id, actor_id, event_type)
      SELECT id, ${user.id}, 'created' FROM ins
    )
    SELECT * FROM ins`
  if (!rows.length) return err(409, 'dispute_already_open')
  return NextResponse.json({ dispute: rows[0] }, { status: 201 })
}