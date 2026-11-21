export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { contractFileService } from '@/lib/contract-files'
import { activityService } from '@/lib/activity'
import { contractAuditLogService } from '@/lib/audit-log'
import {
  ALLOWED_CONTRACT_FILE_MIME_TYPES,
  MAX_CONTRACT_FILE_SIZE,
  MAX_CONTRACT_FILES_PER_BATCH,
} from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

// POST /api/contracts/:id/files - Upload files
export const POST = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    try {
      const params = await context.params
      const contractId = Number(params.id)

      if (!contractId || isNaN(contractId)) {
        return NextResponse.json(
          { error: 'Invalid contract ID', code: 'INVALID_CONTRACT_ID' },
          { status: 400 }
        )
      }

      // Check access
      const access = await contractFileService.checkContractAccess(
        contractId,
        auth.walletAddress
      )

      if (!access.hasAccess) {
        return NextResponse.json(
          { error: 'Access denied', code: 'ACCESS_DENIED' },
          { status: 403 }
        )
      }

      // Parse multipart form data
      const formData = await request.formData()
      const files: File[] = []
      const milestoneId = formData.get('milestone_id')
        ? Number(formData.get('milestone_id'))
        : undefined
      const description = formData.get('description')?.toString() || undefined
      const tagsRaw = formData.get('tags')?.toString()
      const tags = tagsRaw ? JSON.parse(tagsRaw) : undefined

      // Collect all files from form data
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('file') && value instanceof File) {
          files.push(value)
        }
      }

      // Validation
      if (files.length === 0) {
        return NextResponse.json(
          { error: 'No files provided', code: 'NO_FILES' },
          { status: 400 }
        )
      }

      if (files.length > MAX_CONTRACT_FILES_PER_BATCH) {
        return NextResponse.json(
          {
            error: `Maximum ${MAX_CONTRACT_FILES_PER_BATCH} files per upload`,
            code: 'TOO_MANY_FILES',
          },
          { status: 400 }
        )
      }

      // Validate each file
      const errors: Array<{ filename: string; reason: string }> = []

      for (const file of files) {
        if (!file.size || file.size <= 0) {
          errors.push({ filename: file.name, reason: 'File is empty' })
          continue
        }

        if (file.size > MAX_CONTRACT_FILE_SIZE) {
          errors.push({
            filename: file.name,
            reason: `File exceeds ${MAX_CONTRACT_FILE_SIZE / (1024 * 1024)} MB limit`,
          })
          continue
        }

        if (
          !ALLOWED_CONTRACT_FILE_MIME_TYPES.includes(
            file.type as (typeof ALLOWED_CONTRACT_FILE_MIME_TYPES)[number]
          )
        ) {
          errors.push({
            filename: file.name,
            reason: `File type "${file.type || 'unknown'}" is not allowed`,
          })
        }
      }

      if (errors.length > 0) {
        return NextResponse.json(
          {
            error: 'File validation failed',
            code: 'VALIDATION_FAILED',
            details: errors,
          },
          { status: 422 }
        )
      }

      // Validate milestone if provided
      if (milestoneId && (!Number.isInteger(milestoneId) || milestoneId <= 0)) {
        return NextResponse.json(
          { error: 'Invalid milestone ID', code: 'INVALID_MILESTONE_ID' },
          { status: 400 }
        )
      }

      // Upload files
      const uploadedFiles = []
      const uploadErrors = []

      for (const file of files) {
        try {
          const uploadedFile = await contractFileService.uploadFile({
            contractId,
            milestoneId,
            uploaderId: access.userId,
            uploaderWallet: auth.walletAddress,
            file,
            description,
            tags,
          })

          uploadedFiles.push({
            id: uploadedFile.id,
            contract_id: uploadedFile.contract_id,
            milestone_id: uploadedFile.milestone_id,
            original_filename: uploadedFile.original_filename,
            mime_type: uploadedFile.mime_type,
            file_size: uploadedFile.file_size,
            file_hash: uploadedFile.file_hash,
            version: uploadedFile.version,
            description: uploadedFile.description,
            tags: uploadedFile.tags,
            created_at: uploadedFile.created_at,
            uploader: {
              username: uploadedFile.uploader_username,
              wallet_address: uploadedFile.uploader_wallet,
            },
          })

          // Log activity (best effort)
          activityService
            .log({
              actorId: access.userId,
              contractId,
              milestoneId: milestoneId || null,
              actionType: 'file_uploaded',
              description: `File "${file.name}" uploaded to contract`,
              metadata: {
                file_id: uploadedFile.id,
                filename: file.name,
                file_size: file.size,
                mime_type: file.type,
              },
            })
            .catch((err: unknown) =>
              console.error('[activity] Failed to log file_uploaded:', err)
            )

          // Audit log (best effort)
          contractAuditLogService
            .createLog(
              {
                contractId,
                projectId: 0, // Will be fetched from contract
                action: 'contract_creation', // Using existing action type
                actorUserId: access.userId,
                actorWallet: auth.walletAddress,
                metadata: {
                  action: 'file_upload',
                  file_id: uploadedFile.id,
                  filename: file.name,
                  file_size: file.size,
                },
              },
              auth.walletAddress
            )
            .catch((err: unknown) =>
              console.error('[audit] Failed to log file upload:', err)
            )
        } catch (error) {
          console.error(`[upload] Failed to upload file "${file.name}":`, error)
          uploadErrors.push({
            filename: file.name,
            reason:
              error instanceof Error ? error.message : 'Unknown error occurred',
          })
        }
      }

      if (uploadedFiles.length === 0) {
        return NextResponse.json(
          {
            error: 'All file uploads failed',
            code: 'UPLOAD_FAILED',
            details: uploadErrors,
          },
          { status: 500 }
        )
      }

      const response: {
        files: typeof uploadedFiles
        errors?: typeof uploadErrors
      } = { files: uploadedFiles }

      if (uploadErrors.length > 0) {
        response.errors = uploadErrors
      }

      return NextResponse.json(response, { status: 201 })
    } catch (error) {
      console.error('[POST /api/contracts/:id/files]', error)
      return NextResponse.json(
        {
          error: 'Failed to upload files',
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)

// GET /api/contracts/:id/files - List files
export const GET = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    try {
      const params = await context.params
      const contractId = Number(params.id)

      if (!contractId || isNaN(contractId)) {
        return NextResponse.json(
          { error: 'Invalid contract ID', code: 'INVALID_CONTRACT_ID' },
          { status: 400 }
        )
      }

      // Check access
      const access = await contractFileService.checkContractAccess(
        contractId,
        auth.walletAddress
      )

      if (!access.hasAccess) {
        return NextResponse.json(
          { error: 'Access denied', code: 'ACCESS_DENIED' },
          { status: 403 }
        )
      }

      // Parse query parameters
      const { searchParams } = new URL(request.url)
      const milestoneId = searchParams.get('milestone_id')
        ? Number(searchParams.get('milestone_id'))
        : undefined
      const includeDeleted = searchParams.get('include_deleted') === 'true'
      const limit = Number(searchParams.get('limit') || '50')
      const offset = Number(searchParams.get('offset') || '0')

      // Validate parameters
      if (milestoneId && (!Number.isInteger(milestoneId) || milestoneId <= 0)) {
        return NextResponse.json(
          { error: 'Invalid milestone ID', code: 'INVALID_MILESTONE_ID' },
          { status: 400 }
        )
      }

      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return NextResponse.json(
          { error: 'limit must be between 1 and 100', code: 'INVALID_LIMIT' },
          { status: 400 }
        )
      }

      if (!Number.isInteger(offset) || offset < 0) {
        return NextResponse.json(
          { error: 'offset must be non-negative', code: 'INVALID_OFFSET' },
          { status: 400 }
        )
      }

      // List files
      const result = await contractFileService.listFiles(contractId, {
        milestoneId,
        includeDeleted,
        limit,
        offset,
      })

      // Format response
      const files = result.files.map((file) => ({
        id: file.id,
        contract_id: file.contract_id,
        milestone_id: file.milestone_id,
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_size: file.file_size,
        file_hash: file.file_hash,
        version: file.version,
        is_latest_version: file.is_latest_version,
        description: file.description,
        tags: file.tags,
        created_at: file.created_at,
        uploader: {
          id: file.uploaded_by,
          username: file.uploader_username,
          wallet_address: file.uploader_wallet,
        },
        has_previous_versions: file.has_previous_versions,
      }))

      return NextResponse.json({
        files,
        pagination: result.pagination,
      })
    } catch (error) {
      console.error('[GET /api/contracts/:id/files]', error)
      return NextResponse.json(
        {
          error: 'Failed to list files',
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)
