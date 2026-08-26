export const dynamic = 'force-dynamic'

import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'
import { activityService } from '@/lib/activity/service'
import { ALLOWED_DELIVERABLE_MIME_TYPES, MAX_DELIVERABLE_FILE_SIZE } from '@/lib/validations'
import { computeFileHash, removeEncryptedFile, storeEncryptedFile } from '@/lib/security/fileEncryption'

const MAX_DESCRIPTION_LENGTH = 2000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getRouteIds(request: NextRequest): { disputeId: string; evidenceId?: string } {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  const disputesIndex = segments.lastIndexOf('disputes')
  return {
    disputeId: segments[disputesIndex + 1] || '',
    evidenceId: segments[disputesIndex + 3],
  }
}

async function getAuthorizedUser(disputeId: string, walletAddress: string) {
  const [user] = (await sql`
    SELECT u.id, u.role, d.contract_id, c.client_id, c.freelancer_id
    FROM users u
    LEFT JOIN disputes d ON d.id = ${disputeId}::uuid
    LEFT JOIN contracts c ON c.id = d.contract_id
    WHERE u.wallet_address = ${walletAddress}
    LIMIT 1
  `) as Array<{ id: string; role: string; contract_id: string | null; client_id: string | null; freelancer_id: string | null }>
  if (!user) return { response: NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 }) }
  if (!user.contract_id) return { response: NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 }) }
  const isParticipant = user.id === user.client_id || user.id === user.freelancer_id
  if (!isParticipant && user.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 }) }
  }
  return { user }
}

export const POST = withAuth(async (request: NextRequest, auth) => {
  const { disputeId } = getRouteIds(request)
  if (!disputeId) return NextResponse.json({ error: 'Dispute ID is required', code: 'MISSING_DISPUTE_ID' }, { status: 400 })
  if (!UUID_PATTERN.test(disputeId)) return NextResponse.json({ error: 'Invalid dispute ID', code: 'INVALID_DISPUTE_ID' }, { status: 400 })

  let storedPath: string | undefined
  try {
    const authorization = await getAuthorizedUser(disputeId, auth.walletAddress)
    if (authorization.response) return authorization.response
    const user = authorization.user
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'A file is required', code: 'NO_FILE' }, { status: 400 })
    if (!file.size || file.size > MAX_DELIVERABLE_FILE_SIZE) {
      return NextResponse.json({ error: `File must be between 1 byte and ${MAX_DELIVERABLE_FILE_SIZE / (1024 * 1024)} MB`, code: 'INVALID_FILE_SIZE' }, { status: 422 })
    }
    if (!ALLOWED_DELIVERABLE_MIME_TYPES.includes(file.type as typeof ALLOWED_DELIVERABLE_MIME_TYPES[number])) {
      return NextResponse.json({ error: `File type "${file.type}" is not allowed`, code: 'INVALID_FILE_TYPE' }, { status: 422 })
    }
    const description = String(formData.get('description') || '').trim()
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: 'Description is too long', code: 'INVALID_DESCRIPTION' }, { status: 422 })
    }
    const rawMetadata = String(formData.get('metadata') || '{}')
    let metadata: Record<string, unknown>
    try {
      metadata = JSON.parse(rawMetadata)
      if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error('metadata must be an object')
    } catch {
      return NextResponse.json({ error: 'Metadata must be a JSON object', code: 'INVALID_METADATA' }, { status: 422 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileHash = computeFileHash(buffer)
    const claimedHash = String(formData.get('sha256') || '').toLowerCase()
    if (claimedHash && claimedHash !== fileHash) {
      return NextResponse.json({ error: 'File integrity check failed', code: 'INTEGRITY_CHECK_FAILED' }, { status: 422 })
    }
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const storedFilename = `${randomUUID()}.${extension}`
    const stored = await storeEncryptedFile(buffer, storedFilename)
    storedPath = stored.filePath
    const [evidence] = (await sql`
      INSERT INTO dispute_evidence
        (dispute_id, uploader_id, original_filename, stored_filename, mime_type,
         file_size, file_hash, encryption_iv, file_path, description, metadata)
      VALUES (${disputeId}::uuid, ${user.id}::uuid, ${file.name}, ${storedFilename},
        ${file.type}, ${file.size}, ${fileHash}, ${stored.iv}, ${stored.filePath},
        ${description || null}, ${JSON.stringify(metadata)}::jsonb)
      RETURNING id, dispute_id, uploader_id, original_filename, mime_type,
        file_size, file_hash, description, metadata, created_at
    `) as Array<Record<string, unknown>>
    await activityService.log({ actorId: user.id, contractId: user.contract_id ?? undefined, disputeId, actionType: 'dispute_evidence_uploaded', description: `Uploaded evidence ${evidence.id}`, metadata: { evidenceId: evidence.id, fileHash } })
    return NextResponse.json({ evidence }, { status: 201 })
  } catch {
    if (storedPath) await removeEncryptedFile(storedPath).catch(() => undefined)
    return NextResponse.json({ error: 'Failed to submit evidence', code: 'EVIDENCE_UPLOAD_FAILED' }, { status: 500 })
  }
})

export const GET = withAuth(async (request: NextRequest, auth) => {
  const { disputeId } = getRouteIds(request)
  if (!disputeId) return NextResponse.json({ error: 'Dispute ID is required', code: 'MISSING_DISPUTE_ID' }, { status: 400 })
  if (!UUID_PATTERN.test(disputeId)) return NextResponse.json({ error: 'Invalid dispute ID', code: 'INVALID_DISPUTE_ID' }, { status: 400 })
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 50)
  const requestedOffset = Number(request.nextUrl.searchParams.get('offset') || 0)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100 || !Number.isInteger(requestedOffset) || requestedOffset < 0) {
    return NextResponse.json({ error: 'Invalid pagination parameters', code: 'INVALID_PAGINATION' }, { status: 400 })
  }
  const limit = requestedLimit
  const offset = requestedOffset
  try {
    const authorization = await getAuthorizedUser(disputeId, auth.walletAddress)
    if (authorization.response) return authorization.response
    const user = authorization.user
    const [count] = (await sql`SELECT COUNT(*)::int AS total FROM dispute_evidence WHERE dispute_id = ${disputeId}::uuid AND is_removed = FALSE`) as Array<{ total: number }>
    const evidence = (await sql`
      SELECT id, dispute_id, uploader_id, original_filename, mime_type, file_size,
        file_hash, description, metadata, created_at
      FROM dispute_evidence
      WHERE dispute_id = ${disputeId}::uuid AND is_removed = FALSE
      ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}
    `) as Array<Record<string, unknown>>
    await activityService.log({ actorId: user.id, contractId: user.contract_id ?? undefined, disputeId, actionType: 'dispute_evidence_viewed', description: `Viewed dispute evidence`, metadata: { limit, offset, count: evidence.length } })
    const total = Number(count?.total || 0)
    return NextResponse.json({ evidence, pagination: { limit, offset, total, hasMore: offset + evidence.length < total, nextOffset: offset + evidence.length < total ? offset + evidence.length : null } })
  } catch {
    return NextResponse.json({ error: 'Failed to load evidence', code: 'LIST_FAILED' }, { status: 500 })
  }
})

export const DELETE = withAuth(async (request: NextRequest, auth) => {
  const { disputeId, evidenceId } = getRouteIds(request)
  if (!disputeId || !evidenceId) return NextResponse.json({ error: 'Dispute ID and evidence ID are required', code: 'MISSING_PARAMS' }, { status: 400 })
  if (!UUID_PATTERN.test(disputeId) || !UUID_PATTERN.test(evidenceId)) return NextResponse.json({ error: 'Invalid dispute or evidence ID', code: 'INVALID_ID' }, { status: 400 })
  try {
    const authorization = await getAuthorizedUser(disputeId, auth.walletAddress)
    if (authorization.response) return authorization.response
    const user = authorization.user
    const [evidence] = (await sql`SELECT * FROM dispute_evidence WHERE id = ${evidenceId}::uuid AND dispute_id = ${disputeId}::uuid AND is_removed = FALSE LIMIT 1`) as Array<Record<string, any>>
    if (!evidence) return NextResponse.json({ error: 'Evidence not found', code: 'EVIDENCE_NOT_FOUND' }, { status: 404 })
    await sql`UPDATE dispute_evidence SET is_removed = TRUE WHERE id = ${evidenceId}::uuid`
    await removeEncryptedFile(evidence.file_path)
    await activityService.log({ actorId: user.id, contractId: user.contract_id ?? undefined, disputeId, actionType: 'dispute_evidence_deleted', description: `Deleted dispute evidence ${evidenceId}`, metadata: { evidenceId, fileHash: evidence.file_hash } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete evidence', code: 'DELETE_FAILED' }, { status: 500 })
  }
})
