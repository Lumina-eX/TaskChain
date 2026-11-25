import { sql } from '@/lib/db'
import {
  computeFileHash,
  readEncryptedFile,
  removeEncryptedFile,
  storeEncryptedFile,
} from '@/lib/security/fileEncryption'
import { randomUUID } from 'crypto'
import {
  type ContractFile,
  type ContractFileListItem,
  type ContractFileWithUploader,
  type DeleteFileParams,
  type FileAccessCheckResult,
  type FileDownload,
  type FileListResponse,
  type UploadFileParams,
} from './types'

export class ContractFileService {
  /**
   * Check if a user has access to a contract's files
   */
  async checkContractAccess(
    contractId: number,
    walletAddress: string
  ): Promise<FileAccessCheckResult> {
    const userRows = await sql<{ id: number; role: string }>`
      SELECT id, role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
    `

    if (userRows.length === 0) {
      return {
        hasAccess: false,
        userId: 0,
        userRole: '',
        isParticipant: false,
      }
    }

    const user = userRows[0]
    const userId = Number(user.id)

    // Admins always have access
    if (user.role === 'admin') {
      return {
        hasAccess: true,
        userId,
        userRole: user.role,
        isParticipant: false,
      }
    }

    // Check if user is a participant (client or freelancer) in the contract
    const contractRows = await sql<{
      id: number
      client_id: number
      freelancer_id: number
    }>`
      SELECT id, client_id, freelancer_id
      FROM contracts
      WHERE id = ${contractId}
      LIMIT 1
    `

    if (contractRows.length === 0) {
      return {
        hasAccess: false,
        userId,
        userRole: user.role,
        isParticipant: false,
      }
    }

    const contract = contractRows[0]
    const isParticipant =
      Number(contract.client_id) === userId ||
      Number(contract.freelancer_id) === userId

    return {
      hasAccess: isParticipant,
      userId,
      userRole: user.role,
      isParticipant,
    }
  }

  /**
   * Upload a file to a contract
   */
  async uploadFile(params: UploadFileParams): Promise<ContractFileWithUploader> {
    const {
      contractId,
      milestoneId,
      uploaderId,
      uploaderWallet,
      file,
      description,
      tags,
    } = params

    // Verify contract exists
    const contractRows = await sql`
      SELECT id FROM contracts WHERE id = ${contractId} LIMIT 1
    `
    if (contractRows.length === 0) {
      throw new Error('Contract not found')
    }

    // Verify milestone belongs to contract if specified
    if (milestoneId) {
      const milestoneRows = await sql`
        SELECT id FROM milestones 
        WHERE id = ${milestoneId} AND contract_id = ${contractId}
        LIMIT 1
      `
      if (milestoneRows.length === 0) {
        throw new Error('Milestone not found or does not belong to this contract')
      }
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Compute hash for integrity and deduplication
    const fileHash = computeFileHash(buffer)

    // Generate unique stored filename
    const ext = file.name.split('.').pop() || 'bin'
    const storedFilename = `contract-${contractId}-${randomUUID()}.${ext}`

    // Encrypt and store file
    const { iv, filePath } = await storeEncryptedFile(buffer, storedFilename)

    // Check if there's an existing file with the same hash (deduplication)
    const existingFileRows = await sql<{ id: number; version: number }>`
      SELECT id, version FROM contract_files
      WHERE contract_id = ${contractId}
        AND file_hash = ${fileHash}
        AND is_deleted = FALSE
        AND is_latest_version = TRUE
      ORDER BY version DESC
      LIMIT 1
    `

    let version = 1
    let parentFileId: number | null = null

    if (existingFileRows.length > 0) {
      // File content is duplicate - create new version
      const existingFile = existingFileRows[0]
      version = Number(existingFile.version) + 1
      parentFileId = Number(existingFile.id)

      // Mark previous version as not latest
      await sql`
        UPDATE contract_files
        SET is_latest_version = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${existingFile.id}
      `
    }

    // Insert file record
    const fileRows = await sql<ContractFile>`
      INSERT INTO contract_files (
        contract_id,
        milestone_id,
        uploaded_by,
        original_filename,
        stored_filename,
        mime_type,
        file_size,
        file_hash,
        file_path,
        encryption_iv,
        version,
        parent_file_id,
        is_latest_version,
        description,
        tags
      )
      VALUES (
        ${contractId},
        ${milestoneId ?? null},
        ${uploaderId},
        ${file.name},
        ${storedFilename},
        ${file.type || 'application/octet-stream'},
        ${buffer.length},
        ${fileHash},
        ${filePath},
        ${iv},
        ${version},
        ${parentFileId},
        TRUE,
        ${description ?? null},
        ${tags ? JSON.stringify(tags) : '{}'}
      )
      RETURNING *
    `

    const uploadedFile = fileRows[0]

    // Get uploader info
    const uploaderRows = await sql<{ username: string; wallet_address: string }>`
      SELECT username, wallet_address FROM users WHERE id = ${uploaderId} LIMIT 1
    `
    const uploader = uploaderRows[0]

    return {
      ...uploadedFile,
      uploader_username: uploader?.username ?? null,
      uploader_wallet: uploader?.wallet_address ?? null,
    }
  }

  /**
   * List files for a contract
   */
  async listFiles(
    contractId: number,
    params: {
      milestoneId?: number
      includeDeleted?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<FileListResponse> {
    const limit = Math.min(params.limit ?? 50, 100)
    const offset = params.offset ?? 0
    const includeDeleted = params.includeDeleted ?? false

    // Build WHERE conditions
    const milestoneCondition = params.milestoneId 
      ? sql`AND cf.milestone_id = ${params.milestoneId}` 
      : sql``
    
    const deletedCondition = includeDeleted 
      ? sql`` 
      : sql`AND cf.is_deleted = FALSE`

    // Count total
    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM contract_files cf
      WHERE cf.contract_id = ${contractId}
        ${deletedCondition}
        ${milestoneCondition}
        AND cf.is_latest_version = TRUE
    `
    const total = Number(countRows[0]?.total ?? 0)

    // Fetch files with pagination
    const files = await sql<ContractFileListItem>`
      SELECT 
        cf.id,
        cf.contract_id,
        cf.milestone_id,
        cf.uploaded_by,
        cf.original_filename,
        cf.mime_type,
        cf.file_size,
        cf.file_hash,
        cf.version,
        cf.is_latest_version,
        cf.description,
        cf.tags,
        cf.created_at,
        u.username AS uploader_username,
        u.wallet_address AS uploader_wallet,
        EXISTS(
          SELECT 1 FROM contract_files cf2
          WHERE cf2.parent_file_id = cf.id OR cf2.id = cf.parent_file_id
        ) AS has_previous_versions
      FROM contract_files cf
      LEFT JOIN users u ON u.id = cf.uploaded_by
      WHERE cf.contract_id = ${contractId}
        ${deletedCondition}
        ${milestoneCondition}
        AND cf.is_latest_version = TRUE
      ORDER BY cf.created_at DESC, cf.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    return {
      files,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + files.length < total,
      },
    }
  }

  /**
   * Get a single file by ID (for download)
   */
  async getFileForDownload(fileId: number): Promise<FileDownload | null> {
    const fileRows = await sql<ContractFile>`
      SELECT * FROM contract_files
      WHERE id = ${fileId} AND is_deleted = FALSE
      LIMIT 1
    `

    if (fileRows.length === 0) {
      return null
    }

    const file = fileRows[0]

    // Decrypt and read file
    const buffer = await readEncryptedFile(file.file_path, file.encryption_iv)

    // Verify integrity
    const actualHash = computeFileHash(buffer)
    if (actualHash !== file.file_hash) {
      throw new Error('File integrity check failed')
    }

    return {
      buffer,
      filename: file.original_filename,
      mime_type: file.mime_type,
      file_size: Number(file.file_size),
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileById(fileId: number): Promise<ContractFileWithUploader | null> {
    const fileRows = await sql<ContractFile>`
      SELECT cf.*, u.username AS uploader_username, u.wallet_address AS uploader_wallet
      FROM contract_files cf
      LEFT JOIN users u ON u.id = cf.uploaded_by
      WHERE cf.id = ${fileId}
      LIMIT 1
    `

    if (fileRows.length === 0) {
      return null
    }

    return fileRows[0] as unknown as ContractFileWithUploader
  }

  /**
   * Soft delete a file
   */
  async deleteFile(params: DeleteFileParams): Promise<void> {
    const { fileId, deletedBy, deletedByWallet } = params

    const fileRows = await sql<ContractFile>`
      SELECT * FROM contract_files WHERE id = ${fileId} LIMIT 1
    `

    if (fileRows.length === 0) {
      throw new Error('File not found')
    }

    const file = fileRows[0]

    if (file.is_deleted) {
      throw new Error('File already deleted')
    }

    // Soft delete (preserve for audit)
    await sql`
      UPDATE contract_files
      SET 
        is_deleted = TRUE,
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by = ${deletedBy},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${fileId}
    `

    // Note: We do NOT physically delete the encrypted file from disk
    // This preserves the audit trail and allows recovery if needed
  }

  /**
   * Log a file download
   */
  async logDownload(
    fileId: number,
    downloadedBy: number,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<void> {
    await sql`
      INSERT INTO contract_file_downloads (
        file_id,
        downloaded_by,
        ip_address,
        user_agent
      )
      VALUES (
        ${fileId},
        ${downloadedBy},
        ${ipAddress},
        ${userAgent}
      )
    `
  }

  /**
   * Get file download history
   */
  async getDownloadHistory(
    fileId: number,
    limit = 50,
    offset = 0
  ): Promise<{
    downloads: Array<{
      id: number
      file_id: number
      downloaded_by: number
      downloaded_at: string
      username: string | null
      wallet_address: string | null
    }>
    total: number
  }> {
    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM contract_file_downloads
      WHERE file_id = ${fileId}
    `
    const total = Number(countRows[0]?.total ?? 0)

    const downloads = await sql`
      SELECT 
        cfd.id,
        cfd.file_id,
        cfd.downloaded_by,
        cfd.downloaded_at,
        u.username,
        u.wallet_address
      FROM contract_file_downloads cfd
      LEFT JOIN users u ON u.id = cfd.downloaded_by
      WHERE cfd.file_id = ${fileId}
      ORDER BY cfd.downloaded_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    return { downloads, total }
  }
}

export const contractFileService = new ContractFileService()
