import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'            // REPLACE
import { sql } from '@/lib/db'
import { evidenceSchema, isUuid, isParticipant, err } from '@/lib/disputes'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return err(400, 'invalid_dispute_id')
  const user = await getCurrentUser(req)
  if (!user) return err(401, 'unauthorized')

  const parsed = evidenceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return err(400, 'validation_error', parsed.error.issues[0]?.message)

  const [d] = await sql`
    SELECT d.id, d.status, c.client_id, c.freelancer_id
    FROM disputes d JOIN contracts c ON c.id = d.contract_id WHERE d.id = ${id}`      // REPLACE columns
  if (!d) return err(404, 'dispute_not_found')
  if (!isParticipant(d, user.id)) return err(403, 'forbidden')
  if (d.status !== 'open') return err(409, 'dispute_not_open')

  const { kind, uri, description, sha256 } = parsed.data
  const rows = await sql`
    WITH ins AS (
      INSERT INTO dispute_evidence (dispute_id, submitted_by, kind, uri, description, sha256)
      VALUES (${id}, ${user.id}, ${kind}, ${uri}, ${description ?? null}, ${sha256 ?? null})
      ON CONFLICT (dispute_id, uri) DO NOTHING RETURNING *
    ), ev AS (
      INSERT INTO dispute_events (dispute_id, actor_id, event_type, payload)
      SELECT dispute_id, ${user.id}, 'evidence_added', jsonb_build_object('evidence_id', id, 'kind', kind) FROM ins
    )
    SELECT * FROM ins`
  if (rows.length) return NextResponse.json({ evidence: rows[0] }, { status: 201 })

  // Duplicate submission: return the existing record, create nothing new
  const [existing] = await sql`SELECT * FROM dispute_evidence WHERE dispute_id = ${id} AND uri = ${uri}`
  return NextResponse.json({ evidence: existing, duplicate: true }, { status: 200 })
}