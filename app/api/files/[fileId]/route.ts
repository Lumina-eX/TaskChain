export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { contractFileService } from '@/lib/contract-files'
import { activityService } from '@/lib/activity'
import { contractAuditLogService } from '@/lib/audit-log'

type RouteContext = { params: Promise<{ fileId: string }> }

// DELETE /api/files/:fileId - Delete a file (soft delete)
export const DELETE = withAuthCtx(
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

      // Get file metadata
      const fileMetadata = await contractFileService.getFileById(fileId)

      if (!fileMetadata) {
        return NextResponse.json(
          { error: 'File not found', code: 'FILE_NOT_FOUND' },
          { status: 404 }
        )
      }

      if (fileMetadata.is_deleted) {
        return NextResponse.json(
          { error: 'File already deleted', code: 'ALREADY_DELETED' },
          { status: 400 }
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

      // Check if user is authorized to delete
      // Only the uploader, contract participants, or admins can delete
      const isUploader = access.userId === fileMetadata.uploaded_by
      const isAdmin = access.userRole === 'admin'

      if (!isUploader && !isAdmin && !access.isParticipant) {
        return NextResponse.json(
          {
            error: 'Only the uploader or contract participants can delete files',
            code: 'INSUFFICIENT_PERMISSIONS',
          },
          { status: 403 }
        )
      }

      // Soft delete the file
      await contractFileService.deleteFile({
        fileId,
        deletedBy: access.userId,
        deletedByWallet: auth.walletAddress,
      })

      // Log activity (best effort)
      activityService
        .log({
          actorId: access.userId,
          contractId: fileMetadata.contract_id,
          milestoneId: fileMetadata.milestone_id,
          actionType: 'file_deleted',
          description: `File "${fileMetadata.original_filename}" deleted`,
          metadata: {
            file_id: fileId,
            filename: fileMetadata.original_filename,
            file_size: fileMetadata.file_size,
          },
        })
        .catch((err: unknown) =>
          console.error('[activity] Failed to log file_deleted:', err)
        )

      // Audit log (best effort)
      contractAuditLogService
        .createLog(
          {
            contractId: fileMetadata.contract_id,
            projectId: 0, // Will be fetched from contract
            action: 'contract_creation', // Using existing action type
            actorUserId: access.userId,
            actorWallet: auth.walletAddress,
            metadata: {
              action: 'file_delete',
              file_id: fileId,
              filename: fileMetadata.original_filename,
            },
          },
          auth.walletAddress
        )
        .catch((err: unknown) =>
          console.error('[audit] Failed to log file deletion:', err)
        )

      return NextResponse.json(
        {
          success: true,
          message: 'File deleted successfully',
          file_id: fileId,
        },
        { status: 200 }
      )
    } catch (error) {
      console.error('[DELETE /api/files/:fileId]', error)
      return NextResponse.json(
        {
          error: 'Failed to delete file',
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)

// GET /api/files/:fileId - Get file metadata
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

      // Get file metadata
      const fileMetadata = await contractFileService.getFileById(fileId)

      if (!fileMetadata) {
        return NextResponse.json(
          { error: 'File not found', code: 'FILE_NOT_FOUND' },
          { status: 404 }
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

      // Return file metadata (excluding sensitive fields)
      return NextResponse.json({
        id: fileMetadata.id,
        contract_id: fileMetadata.contract_id,
        milestone_id: fileMetadata.milestone_id,
        original_filename: fileMetadata.original_filename,
        mime_type: fileMetadata.mime_type,
        file_size: fileMetadata.file_size,
        file_hash: fileMetadata.file_hash,
        version: fileMetadata.version,
        parent_file_id: fileMetadata.parent_file_id,
        is_latest_version: fileMetadata.is_latest_version,
        is_deleted: fileMetadata.is_deleted,
        deleted_at: fileMetadata.deleted_at,
        description: fileMetadata.description,
        tags: fileMetadata.tags,
        created_at: fileMetadata.created_at,
        updated_at: fileMetadata.updated_at,
        uploader: {
          id: fileMetadata.uploaded_by,
          username: fileMetadata.uploader_username,
          wallet_address: fileMetadata.uploader_wallet,
        },
      })
    } catch (error) {
      console.error('[GET /api/files/:fileId]', error)
      return NextResponse.json(
        {
          error: 'Failed to retrieve file metadata',
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)
