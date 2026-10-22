import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'            // REPLACE
import { sql } from '@/lib/db'
import { escrowChain } from '@/lib/escrow-chain'
import { resolveSchema, isUuid, isParticipant, isArbitrator, reconcileDispute, err } from '@/lib/disputes'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return err(400, 'invalid_dispute_id')
  const user = await getCurrentUser(req)
  if (!user) return err(401, 'unauthorized')

  const parsed = resolveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return err(400, 'validation_error', parsed.error.issues[0]?.message)
  const { outcome, reason, split_bps, metadata } = parsed.data

  const [d] = await sql`
    SELECT d.id, d.status, c.client_id, c.freelancer_id, c.escrow_contract_id
    FROM disputes d JOIN contracts c ON c.id = d.contract_id WHERE d.id = ${id}`      // REPLACE columns
  if (!d) return err(404, 'dispute_not_found')
  if (!isArbitrator(user.id)) return err(403, 'forbidden')
  if (isParticipant(d, user.id)) return err(403, 'conflict_of_interest')

  const meta = JSON.stringify({ ...(metadata ?? {}), ...(split_bps ? { split_bps } : {}) })

  // Atomic claim: only one caller can move the dispute into resolution_pending.
  // A failed attempt, or a pending one that never submitted (crash) for 5+ minutes, can be retried
  // with the same outcome only.
  const claimed = await sql`
    WITH claimed AS (
      UPDATE disputes SET
        status = 'resolution_pending', resolution_outcome = ${outcome}, resolution_reason = ${reason},
        resolution_metadata = ${meta}::jsonb, resolved_by = ${user.id},
        chain_attempts = chain_attempts + 1, updated_at = now()
      WHERE id = ${id}
        AND (resolution_outcome IS NULL OR resolution_outcome = ${outcome})
        AND (
          status IN ('open', 'resolution_failed')
          OR (status = 'resolution_pending' AND resolution_tx_hash IS NULL AND updated_at < now() - interval '5 minutes')
        )
      RETURNING *
    ), ev AS (
      INSERT INTO dispute_events (dispute_id, actor_id, event_type, payload)
      SELECT id, ${user.id}, 'resolution_started',
             jsonb_build_object('outcome', ${outcome}, 'attempt', chain_attempts) FROM claimed
    )
    SELECT * FROM claimed`

  if (!claimed.length) {
    const current = await reconcileDispute(id)
    if (current.status === 'resolved') return err(409, 'already_resolved')
    if (current.status === 'resolution_pending') {
      return NextResponse.json({ dispute: current, status: 'pending_confirmation' }, { status: 202 })
    }
    return err(409, 'resolution_conflict', 'A different decision is already in progress for this dispute')
  }

  try {
    const { txHash } = await escrowChain.submitResolution({
      escrowContractId: d.escrow_contract_id,
      disputeId: id,
      outcome,
      splitBps: split_bps,
    })
    await sql`
      WITH upd AS (
        UPDATE disputes SET resolution_tx_hash = ${txHash}, resolution_submitted_at = now(), updated_at = now()
        WHERE id = ${id} AND status = 'resolution_pending' RETURNING id
      )
      INSERT INTO dispute_events (dispute_id, actor_id, event_type, tx_hash)
      SELECT id, ${user.id}, 'resolution_submitted', ${txHash} FROM upd`
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : 'unknown_error'
    await sql`
      WITH upd AS (
        UPDATE disputes SET status = 'resolution_failed', chain_last_error = ${message}, updated_at = now()
        WHERE id = ${id} AND status = 'resolution_pending' RETURNING id
      )
      INSERT INTO dispute_events (dispute_id, actor_id, event_type, payload)
      SELECT id, ${user.id}, 'resolution_failed', jsonb_build_object('error', ${message}) FROM upd`
    return err(502, 'chain_submission_failed', 'The resolution can be retried')
  }

  const dispute = await reconcileDispute(id)
  if (dispute.status === 'resolved') return NextResponse.json({ dispute }, { status: 200 })
  return NextResponse.json({ dispute, status: 'pending_confirmation' }, { status: 202 })
}