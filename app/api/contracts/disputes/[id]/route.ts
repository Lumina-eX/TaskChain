import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'            // REPLACE
import { sql } from '@/lib/db'
import { isUuid, isParticipant, isArbitrator, reconcileDispute, err } from '@/lib/disputes'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return err(400, 'invalid_dispute_id')
  const user = await getCurrentUser(req)
  if (!user) return err(401, 'unauthorized')

  const [access] = await sql`
    SELECT c.client_id, c.freelancer_id
    FROM disputes d JOIN contracts c ON c.id = d.contract_id WHERE d.id = ${id}`      // REPLACE columns
  if (!access) return err(404, 'dispute_not_found')
  const arbitrator = isArbitrator(user.id)
  if (!isParticipant(access, user.id) && !arbitrator) return err(403, 'forbidden')

  const dispute = await reconcileDispute(id)       // keeps app state in sync with the chain
  const evidence = await sql`SELECT * FROM dispute_evidence WHERE dispute_id = ${id} ORDER BY created_at`
  const events = await sql`SELECT * FROM dispute_events WHERE dispute_id = ${id} ORDER BY created_at`

  const { chain_last_error, ...safe } = dispute
  return NextResponse.json({
    dispute: arbitrator ? dispute : safe,
    evidence,
    events,
  })
}