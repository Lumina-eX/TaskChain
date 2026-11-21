export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { contractFileService } from '@/lib/contract-files'
import { activityService } from '@/lib/activity'

type RouteContext = { params: Promise<{ fileId: string }> }

// GET /api/files/:fileId/download - Download a file
export const GET = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    try {
      const params = await context.params
      const fileId = Number(params.fileId)

      if (!fileId || isNaN(fileId)) {
        return NextResponse.json(
          { error: 'Invalid file ID', code: 'INVALID_FILE_ID' },
          { status: 400 }
        )
      }

      // Get file metadata first
      const fileMetadata = await contractFileService.getFileById(fileId)

      if (!fileMetadata) {
        return NextResponse.json(
          { error: 'File not found', code: 'FILE_NOT_FOUND' },
          { status: 404 }
        )
      }

      if (fileMetadata.is_deleted) {
        return NextResponse.json(
          { error: 'File has been deleted', code: 'FILE_DELETED' },
          { status: 410 }
        )
      }

      // Check if user has access to the contract
      const access = await contractFileService.checkContractAccess(
        fileMetadata.contract_id,
        auth.walletAddress
      )

      if (!access.hasAccess) {
        return NextResponse.json(
          { error: 'Access denied', code: 'ACCESS_DENIED' },
          { status: 403 }
        )
      }

      // Get file content
      const fileDownload = await contractFileService.getFileForDownload(fileId)

      if (!fileDownload) {
        return NextResponse.json(
          { error: 'Failed to retrieve file', code: 'RETRIEVAL_FAILED' },
          { status: 500 }
        )
      }

      // Log download (best effort)
      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null
      const userAgent = request.headers.get('user-agent') || null

      contractFileService
        .logDownload(fileId, access.userId, ipAddress, userAgent)
        .catch((err: unknown) =>
          console.error('[download] Failed to log download:', err)
        )

      // Log activity (best effort)
      activityService
        .log({
          actorId: access.userId,
          contractId: fileMetadata.contract_id,
          milestoneId: fileMetadata.milestone_id,
          actionType: 'file_downloaded',
          description: `File "${fileMetadata.original_filename}" downloaded`,
          metadata: {
            file_id: fileId,
            filename: fileMetadata.original_filename,
            file_size: fileMetadata.file_size,
          },
        })
        .catch((err: unknown) =>
          console.error('[activity] Failed to log file_downloaded:', err)
        )

      // Return file with proper headers
      const headers = new Headers()
      headers.set('Content-Type', fileDownload.mime_type)
      headers.set('Content-Length', String(fileDownload.file_size))
      headers.set(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileDownload.filename)}"`
      )
      headers.set('Cache-Control', 'private, max-age=3600') // Cache for 1 hour
      headers.set('X-Content-Type-Options', 'nosniff')

      return new NextResponse(fileDownload.buffer, {
        status: 200,
        headers,
      })
    } catch (error) {
      console.error('[GET /api/files/:fileId/download]', error)

      // Check if it's an integrity error
      if (
        error instanceof Error &&
        error.message.includes('integrity check failed')
      ) {
        return NextResponse.json(
          {
            error: 'File integrity verification failed',
            code: 'INTEGRITY_ERROR',
          },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          error: 'Failed to download file',
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)
