export interface ContractFile {
  id: number
  contract_id: number
  milestone_id: number | null
  uploaded_by: number
  original_filename: string
  stored_filename: string
  mime_type: string
  file_size: number
  file_hash: string
  file_path: string
  encryption_iv: string
  version: number
  parent_file_id: number | null
  is_latest_version: boolean
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: number | null
  description: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface ContractFileWithUploader extends ContractFile {
  uploader_username: string | null
  uploader_wallet: string | null
}

export interface ContractFileListItem {
  id: number
  contract_id: number
  milestone_id: number | null
  uploaded_by: number
  original_filename: string
  mime_type: string
  file_size: number
  file_hash: string
  version: number
  is_latest_version: boolean
  description: string | null
  tags: string[]
  created_at: string
  uploader_username: string | null
  uploader_wallet: string | null
  has_previous_versions: boolean
}

export interface FileListResponse {
  files: ContractFileListItem[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
}

export interface FileDownload {
  buffer: Buffer
  filename: string
  mime_type: string
  file_size: number
}

export interface UploadFileParams {
  contractId: number
  milestoneId?: number
  uploaderId: number
  uploaderWallet: string
  file: File
  description?: string
  tags?: string[]
}

export interface DeleteFileParams {
  fileId: number
  deletedBy: number
  deletedByWallet: string
}

export interface FileAccessCheckResult {
  hasAccess: boolean
  userId: number
  userRole: string
  isParticipant: boolean
}
