export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { readEncryptedFile } from '@/lib/security/fileEncryption'

interface RouteContext {
  params: Promise<{ id: string; fileId: string }>
}

type Row = Record<string, unknown>

/**
 * GET /api/contracts/:id/workspace/files/:fileId
 *
 * Streams the decrypted file to the authenticated user. Supply ?preview=1
 * for an inline Content-Disposition (in-browser preview).
 */
export const GET = withAuthCtx<RouteContext>(async (request: NextRequest, auth, context) => {
  const { id: contractId, fileId } = await context.params
  const preview = request.nextUrl.searchParams.get('preview') === '1'

  try {
    // Resolve requesting user
    const userRows = (await sql`
      SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
    `) as unknown as Row[]
    const user = userRows[0]
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    // Fetch the deliverable and verify it belongs to this contract
    const deliverableRows = (await sql`
      SELECT
        md.id,
        md.original_filename,
        md.mime_type,
        md.file_size,
        md.file_path,
        md.encryption_iv,
        md.encryption_key_id,
        c.client_id,
        c.freelancer_id
      FROM milestone_deliverables md
      JOIN milestones m   ON m.id  = md.milestone_id
      JOIN contracts  c   ON c.id  = m.contract_id
      WHERE md.id         = ${fileId}
        AND c.id          = ${contractId}
        AND md.is_removed = FALSE
      LIMIT 1
    `) as unknown as Row[]
    const deliverable = deliverableRows[0]

    if (!deliverable) {
      return NextResponse.json(
        { error: 'File not found', code: 'FILE_NOT_FOUND' },
        { status: 404 },
      )
    }

    if (deliverable.client_id !== user.id && deliverable.freelancer_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const plaintext = await readEncryptedFile(
      deliverable.file_path as string,
      deliverable.encryption_iv as string,
      (deliverable.encryption_key_id as string | undefined) ?? 'primary',
    )

    const disposition = preview
      ? `inline; filename="${deliverable.original_filename}"`
      : `attachment; filename="${deliverable.original_filename}"`

    return new NextResponse(new Uint8Array(plaintext), {
      status: 200,
      headers: {
        'Content-Type': deliverable.mime_type as string,
        'Content-Disposition': disposition,
        'Content-Length': String(plaintext.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[workspace-file] Error serving file:', err)
    return NextResponse.json(
      { error: 'Failed to retrieve file', code: 'FILE_DOWNLOAD_FAILED' },
      { status: 500 },
    )
  }
})
