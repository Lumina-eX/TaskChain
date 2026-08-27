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
import { withAuthCtx } from '@/lib/auth/middleware'
import {
  ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES,
  MAX_DISPUTE_EVIDENCE_FILE_SIZE,
  MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH,
} from '@/lib/validations'
import {
  computeFileHash,
  readEncryptedFile,
  storeEncryptedFile,
} from '@/lib/security/fileEncryption'

type RouteContext = { params: Promise<{ id: string }> }
type AuthLike = { walletAddress: string }
type UserRow = { id: string | number; role: string }
type DisputeAccessRow = { id: string | number; client_id: string | number; freelancer_id: string | number | null }
type EvidenceRow = {
  id: string | number
  file_url: string
  file_name: string
  file_type?: string | null
  mime_type?: string | null
  encryption_iv?: string | null
  file_path?: string | null
}
type DisputeAccess = {
  user: UserRow
  dispute: DisputeAccessRow
}

async function getDisputeAccess(disputeId: string, walletAddress: string): Promise<DisputeAccess | NextResponse> {
  const users = (await sql`
    SELECT id, role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `) as UserRow[]
  const user = users[0]
  if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

  const disputes = (await sql`
    SELECT d.id, j.client_id, j.freelancer_id
    FROM disputes d
    JOIN jobs j ON d.job_id = j.id
    WHERE d.id = ${disputeId}
    LIMIT 1
  `) as DisputeAccessRow[]
  const dispute = disputes[0]
  if (!dispute) return NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 })

  const userId = String(user.id)
  const isParticipant = String(dispute.client_id) === userId || String(dispute.freelancer_id) === userId
  if (user.role !== 'admin' && !isParticipant) {
    return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
  }

  return { user, dispute }
}

function isAccessResponse(value: DisputeAccess | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}

function validateEvidenceFiles(files: File[]) {
  const errors: { filename: string; reason: string }[] = []

  for (const file of files) {
    if (!file.size || file.size <= 0) {
      errors.push({ filename: file.name, reason: 'File is empty' })
      continue
    }
    if (file.size > MAX_DISPUTE_EVIDENCE_FILE_SIZE) {
      errors.push({
        filename: file.name,
        reason: `File exceeds ${MAX_DISPUTE_EVIDENCE_FILE_SIZE / (1024 * 1024)} MB limit`,
      })
      continue
    }
    if (!ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES.includes(file.type as typeof ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES[number])) {
      errors.push({ filename: file.name, reason: `File type "${file.type || 'unknown'}" is not allowed` })
    }
  }

  return errors
}

export const GET = withAuthCtx(async (_request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  try {
    const access = await getDisputeAccess(id, auth.walletAddress)
    if (isAccessResponse(access)) return access

    const evidence = await sql`
      SELECT de.id, de.dispute_id, de.file_url, de.file_name, de.file_type,
             de.uploaded_by, de.description, de.created_at,
             de.mime_type, de.file_size, de.file_hash, u.username as uploaded_by_username
      FROM dispute_evidence de
      JOIN users u ON u.id = de.uploaded_by
      WHERE de.dispute_id = ${id} AND COALESCE(de.is_removed, FALSE) = FALSE
      ORDER BY de.created_at ASC
    `

    return NextResponse.json({ evidence }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to load evidence', code: 'EVIDENCE_LIST_FAILED' }, { status: 500 })
  }
})

export const POST = withAuthCtx(async (request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be multipart/form-data', code: 'INVALID_FORM_DATA' },
      { status: 400 },
    )
  }

  const files = Array.from(formData.entries())
    .filter((entry): entry is [string, File] => entry[1] instanceof File)
    .map(([, file]) => file)

  const description = String(formData.get('description') ?? '').trim()

  if (files.length === 0 && description.length === 0) {
    return NextResponse.json(
      { error: 'Attach at least one evidence file or add a description', code: 'NO_EVIDENCE' },
      { status: 400 },
    )
  }

  if (files.length > MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH) {
    return NextResponse.json(
      {
        error: `Cannot upload more than ${MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH} files at once`,
        code: 'TOO_MANY_FILES',
      },
      { status: 422 },
    )
  }

  const validationErrors = validateEvidenceFiles(files)
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: 'Some files failed validation', code: 'VALIDATION_ERRORS', details: validationErrors },
      { status: 422 },
    )
  }

  try {
    const access = await getDisputeAccess(id, auth.walletAddress)
    if (isAccessResponse(access)) return access

    const inserted = []

    if (files.length === 0) {
      const rows = (await sql`
        INSERT INTO dispute_evidence (dispute_id, file_url, file_name, file_type, uploaded_by, description)
        VALUES (${id}, ${'note-only'}, ${'Evidence note'}, ${'note'}, ${access.user.id}, ${description})
        RETURNING id, dispute_id, file_url, file_name, file_type, uploaded_by, description,
                  created_at, mime_type, file_size, file_hash
      `) as EvidenceRow[]
      const evidence = rows[0]
      inserted.push(evidence)
    }

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileHash = computeFileHash(buffer)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const storedFilename = `${randomUUID()}.${ext}`
      const { iv, filePath } = await storeEncryptedFile(buffer, storedFilename)

      const rows = (await sql`
        INSERT INTO dispute_evidence
          (dispute_id, file_url, file_name, file_type, uploaded_by, description,
           stored_filename, mime_type, file_size, file_hash, encryption_iv, file_path)
        VALUES
          (${id}, ${`dispute-evidence://${storedFilename}`}, ${file.name}, ${file.type || 'application/octet-stream'},
           ${access.user.id}, ${description || null}, ${storedFilename}, ${file.type || 'application/octet-stream'},
           ${file.size}, ${fileHash}, ${iv}, ${filePath})
        RETURNING id, dispute_id, file_url, file_name, file_type, uploaded_by, description,
                  created_at, mime_type, file_size, file_hash
      `) as EvidenceRow[]
      const evidence = rows[0]
      inserted.push(evidence)
    }

    await sql`UPDATE disputes SET status = 'under_review', updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND status = 'open'`

    return NextResponse.json({ evidence: inserted }, { status: 201 })
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
export async function downloadEvidence(request: NextRequest, auth: AuthLike, disputeId: string, evidenceId: string) {
  try {
    const access = await getDisputeAccess(disputeId, auth.walletAddress)
    if (isAccessResponse(access)) return access

    const rows = (await sql`
      SELECT id, file_url, file_name, file_type, mime_type, encryption_iv, file_path
      FROM dispute_evidence
      WHERE id = ${evidenceId} AND dispute_id = ${disputeId} AND COALESCE(is_removed, FALSE) = FALSE
      LIMIT 1
    `) as EvidenceRow[]
    const evidence = rows[0]
    if (!evidence) return NextResponse.json({ error: 'Evidence not found', code: 'EVIDENCE_NOT_FOUND' }, { status: 404 })

    if (!evidence.file_path || !evidence.encryption_iv) {
      return NextResponse.redirect(new URL(evidence.file_url, request.url))
    }

    const plaintext = await readEncryptedFile(evidence.file_path, evidence.encryption_iv)

    const preview = request.nextUrl.searchParams.get('preview') === '1'
    const disposition = preview ? 'inline' : 'attachment'

    return new NextResponse(new Uint8Array(plaintext), {
      status: 200,
      headers: {
        'Content-Type': evidence.mime_type || evidence.file_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${evidence.file_name}"`,
        'Content-Length': String(plaintext.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to download evidence', code: 'EVIDENCE_DOWNLOAD_FAILED' }, { status: 500 })
  }
}
