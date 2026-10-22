import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'                       // REPLACE if db.ts exports differently
import { escrowChain } from '@/lib/escrow-chain'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID.test(v)   // REPLACE if contract ids are not uuid

export const err = (status: number, error: string, message?: string) =>
  NextResponse.json(message ? { error, message } : { error }, { status })

// REPLACE with the statuses that mean "funded / in progress"
export const ELIGIBLE_CONTRACT_STATUSES = ['active', 'funded', 'in_progress']

export const createDisputeSchema = z.object({ reason: z.string().trim().min(10).max(5000) })

export const evidenceSchema = z
  .object({
    kind: z.enum(['url', 'ipfs']),
    uri: z.string().trim().max(2048),
    description: z.string().trim().max(1000).optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  })
  .refine(
    (v) => (v.kind === 'url' ? /^https:\/\/\S+$/i.test(v.uri) : /^ipfs:\/\/[A-Za-z0-9]+\S*$/.test(v.uri)),
    { message: 'uri does not match kind (https:// for url, ipfs:// for ipfs)' },
  )

export const resolveSchema = z
  .object({
    outcome: z.enum(['release_to_freelancer', 'refund_to_client', 'split']),
    reason: z.string().trim().min(10).max(5000),
    split_bps: z.number().int().min(1).max(9999).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => (v.outcome === 'split') === (v.split_bps !== undefined), {
    message: 'split_bps is required for split outcomes and not allowed otherwise',
  })

export function isArbitrator(userId: string) {
  return (process.env.DISPUTE_ARBITRATOR_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean).includes(userId)
}

// REPLACE column names to match the contracts table
export function isParticipant(c: { client_id: string; freelancer_id: string }, userId: string) {
  return c.client_id === userId || c.freelancer_id === userId
}

/** Syncs an in-flight resolution with the chain. Safe to call repeatedly. */
export async function reconcileDispute(id: string) {
  const [d] = await sql`SELECT * FROM disputes WHERE id = ${id}`
  if (!d || d.status !== 'resolution_pending' || !d.resolution_tx_hash) return d

  let txStatus: 'pending' | 'confirmed' | 'failed'
  try {
    txStatus = await escrowChain.getTxStatus(d.resolution_tx_hash)
  } catch {
    return d // chain unreachable: stay pending, try again later
  }

  if (txStatus === 'confirmed') {
    const rows = await sql`
      WITH upd AS (
        UPDATE disputes SET status = 'resolved', resolution_confirmed_at = now(), updated_at = now()
        WHERE id = ${id} AND status = 'resolution_pending' RETURNING *
      ), ev AS (
        INSERT INTO dispute_events (dispute_id, actor_id, event_type, tx_hash)
        SELECT id, NULL, 'resolution_confirmed', resolution_tx_hash FROM upd
      )
      SELECT * FROM upd`
    if (rows.length) return rows[0]
    return (await sql`SELECT * FROM disputes WHERE id = ${id}`)[0]
  }

  if (txStatus === 'failed') {
    const rows = await sql`
      WITH upd AS (
        UPDATE disputes SET status = 'resolution_failed', chain_last_error = 'transaction failed on-chain', updated_at = now()
        WHERE id = ${id} AND status = 'resolution_pending' RETURNING *
      ), ev AS (
        INSERT INTO dispute_events (dispute_id, actor_id, event_type, tx_hash)
        SELECT id, NULL, 'resolution_failed', ${d.resolution_tx_hash} FROM upd
      )
      SELECT * FROM upd`
    if (rows.length) return rows[0]
    return (await sql`SELECT * FROM disputes WHERE id = ${id}`)[0]
  }

  return d
}