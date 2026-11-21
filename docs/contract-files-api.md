# Contract Files & Workspace API

## Overview

The Contract Files API provides secure file management for contract-related documents with comprehensive metadata tracking, version control, and audit trails.

## Features

- **Secure File Storage**: Files are encrypted at rest using AES-256-CBC encryption
- **Access Control**: Only contract participants (client/freelancer) can access files
- **Version Tracking**: Automatic versioning when files with the same content hash are uploaded
- **Soft Deletion**: Files are soft-deleted to preserve audit history
- **Download Auditing**: All downloads are logged with timestamp, user, IP, and user agent
- **File Integrity**: SHA-256 hashing ensures file integrity on download
- **Milestone Association**: Files can be linked to specific milestones
- **Metadata Support**: Files support descriptions and tags

## API Endpoints

### 1. Upload Files

**POST** `/api/contracts/:id/files`

Upload one or more files to a contract.

**Authentication:** Required (JWT)

**Authorization:** Contract participant (client or freelancer)

**Request:**
- Content-Type: `multipart/form-data`
- Max files per request: 10
- Max file size: 50 MB per file

**Form Fields:**
- `file` or `file0`, `file1`, ... (File, required): Files to upload
- `milestone_id` (number, optional): Associate files with a milestone
- `description` (string, optional): File description (max 1000 chars)
- `tags` (JSON array, optional): Array of tags (max 20 tags, each max 50 chars)

**Allowed File Types:**
- Documents: PDF, Word, Excel, PowerPoint
- Images: PNG, JPEG, GIF, WebP, SVG
- Archives: ZIP, GZIP, TAR
- Text: Plain text, CSV, Markdown, JSON

**Response (201 Created):**
```json
{
  "files": [
    {
      "id": 123,
      "contract_id": 45,
      "milestone_id": 67,
      "original_filename": "proposal.pdf",
      "mime_type": "application/pdf",
      "file_size": 524288,
      "file_hash": "abc123...",
      "version": 1,
      "description": "Project proposal document",
      "tags": ["proposal", "draft"],
      "created_at": "2024-01-15T10:30:00Z",
      "uploader": {
        "username": "john_doe",
        "wallet_address": "GABC..."
      }
    }
  ],
  "errors": []
}
```

**Error Responses:**
- `400`: Invalid contract ID or parameters
- `403`: Access denied (not a contract participant)
- `404`: Contract or milestone not found
- `422`: Validation failed (file type not allowed, file too large, etc.)
- `500`: Server error

### 2. List Files

**GET** `/api/contracts/:id/files`

List all files for a contract with pagination.

**Authentication:** Required (JWT)

**Authorization:** Contract participant

**Query Parameters:**
- `milestone_id` (number, optional): Filter by milestone
- `include_deleted` (boolean, optional): Include deleted files (default: false)
- `limit` (number, optional): Results per page (1-100, default: 50)
- `offset` (number, optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "files": [
    {
      "id": 123,
      "contract_id": 45,
      "milestone_id": 67,
      "original_filename": "proposal.pdf",
      "mime_type": "application/pdf",
      "file_size": 524288,
      "file_hash": "abc123...",
      "version": 1,
      "is_latest_version": true,
      "description": "Project proposal",
      "tags": ["proposal"],
      "created_at": "2024-01-15T10:30:00Z",
      "uploader": {
        "id": 10,
        "username": "john_doe",
        "wallet_address": "GABC..."
      },
      "has_previous_versions": false
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

**Error Responses:**
- `400`: Invalid parameters
- `403`: Access denied
- `404`: Contract not found
- `500`: Server error

### 3. Download File

**GET** `/api/files/:fileId/download`

Download a file by its ID.

**Authentication:** Required (JWT)

**Authorization:** Contract participant

**Response (200 OK):**
- Content-Type: Original file MIME type
- Content-Disposition: `attachment; filename="original_filename.ext"`
- Content-Length: File size in bytes
- Cache-Control: `private, max-age=3600`

Returns the decrypted file content as a binary stream.

**Download Logging:**
- Every download is logged with:
  - User ID
  - Timestamp
  - IP address
  - User agent

**Error Responses:**
- `400`: Invalid file ID
- `403`: Access denied
- `404`: File not found
- `410`: File has been deleted
- `500`: Server error or integrity check failed

### 4. Get File Metadata

**GET** `/api/files/:fileId`

Get detailed metadata about a file without downloading it.

**Authentication:** Required (JWT)

**Authorization:** Contract participant

**Response (200 OK):**
```json
{
  "id": 123,
  "contract_id": 45,
  "milestone_id": 67,
  "original_filename": "proposal.pdf",
  "mime_type": "application/pdf",
  "file_size": 524288,
  "file_hash": "abc123...",
  "version": 1,
  "parent_file_id": null,
  "is_latest_version": true,
  "is_deleted": false,
  "deleted_at": null,
  "description": "Project proposal",
  "tags": ["proposal", "draft"],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "uploader": {
    "id": 10,
    "username": "john_doe",
    "wallet_address": "GABC..."
  }
}
```

**Error Responses:**
- `400`: Invalid file ID
- `403`: Access denied
- `404`: File not found
- `500`: Server error

### 5. Delete File

**DELETE** `/api/files/:fileId`

Soft delete a file. The file remains in the database for audit purposes but is marked as deleted.

**Authentication:** Required (JWT)

**Authorization:** 
- File uploader
- Contract participant
- Admin

**Response (200 OK):**
```json
{
  "success": true,
  "message": "File deleted successfully",
  "file_id": 123
}
```

**Notes:**
- This is a soft delete - the file is not physically removed
- The encrypted file remains on disk for audit/recovery purposes
- Deleted files are excluded from listings by default
- Deleted files cannot be downloaded

**Error Responses:**
- `400`: Invalid file ID or file already deleted
- `403`: Access denied (insufficient permissions)
- `404`: File not found
- `500`: Server error

## Security Features

### 1. Encryption at Rest
- All files are encrypted using AES-256-CBC before storage
- Each file has a unique initialization vector (IV)
- Encryption key is managed via environment variable `FILE_ENCRYPTION_KEY`

### 2. Access Control
- Only authenticated users can access the API
- Contract participants (client/freelancer) have read/write access
- Admins have full access to all files
- Non-participants are denied access

### 3. File Integrity
- SHA-256 hash computed on upload
- Hash verified on every download
- Download fails if integrity check fails

### 4. Audit Trail
- All uploads logged to activity logs
- All downloads logged to `contract_file_downloads` table
- All deletions logged with actor and timestamp
- Soft delete preserves historical records

### 5. Input Validation
- File type whitelist enforced
- File size limits enforced (50 MB max)
- Batch upload limits (10 files max)
- SQL injection prevention via parameterized queries
- Path traversal prevention via UUIDs for stored filenames

### 6. Download Logging
- IP address captured
- User agent captured
- Timestamp recorded
- User ID recorded

## Version Control

### How Versioning Works

1. **First Upload**: File is uploaded, version 1 is created
2. **Duplicate Content**: If a file with the same SHA-256 hash is uploaded again:
   - New version created (version incremented)
   - New version references previous version via `parent_file_id`
   - Previous version marked as `is_latest_version = false`
   - New version marked as `is_latest_version = true`

### Version Tracking Fields

- `version`: Integer version number (1, 2, 3, ...)
- `parent_file_id`: References the previous version
- `is_latest_version`: Boolean flag indicating current version

### Querying Versions

By default, only latest versions are returned. To see all versions:
- Query `contract_files` table directly
- Use `parent_file_id` to traverse version history

## Database Schema

### contract_files Table

```sql
CREATE TABLE contract_files (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(127) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  file_hash VARCHAR(64) NOT NULL,
  file_path TEXT NOT NULL,
  encryption_iv VARCHAR(32) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  parent_file_id INTEGER REFERENCES contract_files(id) ON DELETE SET NULL,
  is_latest_version BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### contract_file_downloads Table

```sql
CREATE TABLE contract_file_downloads (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES contract_files(id) ON DELETE CASCADE,
  downloaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  downloaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);
```

## Activity Logging

File operations are logged to the `activity_logs` table with the following action types:

- `file_uploaded`: When a file is uploaded
- `file_downloaded`: When a file is downloaded
- `file_deleted`: When a file is soft-deleted
- `file_version_updated`: When a new version is created

## Configuration

### Environment Variables

**Required:**

```env
FILE_ENCRYPTION_KEY=<32-byte hex key>
```

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Optional:**

```env
FILE_UPLOAD_DIR=/path/to/uploads
```

Defaults to `<project-root>/uploads` if not set.

## Usage Examples

### Upload a Single File

```typescript
const formData = new FormData()
formData.append('file', fileBlob, 'document.pdf')
formData.append('description', 'Contract terms document')
formData.append('tags', JSON.stringify(['contract', 'terms']))

const response = await fetch('/api/contracts/45/files', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
})

const data = await response.json()
console.log('Uploaded file ID:', data.files[0].id)
```

### Upload Multiple Files

```typescript
const formData = new FormData()
formData.append('file0', file1, 'doc1.pdf')
formData.append('file1', file2, 'doc2.pdf')
formData.append('milestone_id', '67')

const response = await fetch('/api/contracts/45/files', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
})
```

### List Files for a Milestone

```typescript
const response = await fetch(
  '/api/contracts/45/files?milestone_id=67&limit=20',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
)

const data = await response.json()
console.log('Files:', data.files)
console.log('Total:', data.pagination.total)
```

### Download a File

```typescript
const response = await fetch('/api/files/123/download', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})

const blob = await response.blob()
const filename = response.headers
  .get('Content-Disposition')
  ?.match(/filename="(.+)"/)?.[1] || 'download'

// Trigger browser download
const url = window.URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = filename
a.click()
```

### Delete a File

```typescript
const response = await fetch('/api/files/123', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})

const data = await response.json()
console.log(data.message) // "File deleted successfully"
```

## Error Handling

All endpoints return structured error responses:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional details
}
```

### Common Error Codes

- `INVALID_CONTRACT_ID`: Contract ID is not a valid number
- `INVALID_FILE_ID`: File ID is not a valid number
- `INVALID_MILESTONE_ID`: Milestone ID is invalid
- `ACCESS_DENIED`: User does not have permission
- `CONTRACT_NOT_FOUND`: Contract does not exist
- `FILE_NOT_FOUND`: File does not exist
- `MILESTONE_NOT_FOUND`: Milestone does not exist
- `FILE_DELETED`: File has been soft-deleted
- `NO_FILES`: No files provided in upload request
- `TOO_MANY_FILES`: Exceeded batch upload limit
- `VALIDATION_FAILED`: File validation failed (with details)
- `UPLOAD_FAILED`: File upload failed
- `INTEGRITY_ERROR`: File integrity check failed
- `ALREADY_DELETED`: File already deleted
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `SERVER_ERROR`: Internal server error

## Testing

Comprehensive test suite covers:

- ✅ File upload (single and multiple)
- ✅ Milestone association
- ✅ File listing and pagination
- ✅ Filtering by milestone
- ✅ File download
- ✅ File integrity verification
- ✅ File metadata retrieval
- ✅ File deletion (soft delete)
- ✅ Access control (participants vs non-participants)
- ✅ Version tracking for duplicate content
- ✅ Download logging
- ✅ Error handling (invalid IDs, missing files, etc.)
- ✅ Input validation (file size, type, count)

Run tests:
```bash
npm run test
```

## Migration

The feature requires running migration `012_contract_files.sql`:

```bash
npm run migrate
```

This creates:
- `contract_files` table
- `contract_file_downloads` table
- Indexes for performance
- Activity log enum values
- Triggers for `updated_at` timestamp

## Performance Considerations

### Indexes

The migration creates indexes on:
- `contract_id` (filtered by `is_deleted = FALSE`)
- `milestone_id` (filtered by `is_deleted = FALSE`)
- `uploaded_by`
- `file_hash` (for version tracking)
- `parent_file_id` (for version history)
- Latest version per contract (composite, filtered)

### Pagination

Always use pagination for listing files:
- Default limit: 50
- Max limit: 100
- Use `offset` and `hasMore` for paging

### Caching

Downloads include cache headers:
- `Cache-Control: private, max-age=3600`
- Files are cacheable for 1 hour

## Limitations

1. **File Size**: Maximum 50 MB per file
2. **Batch Upload**: Maximum 10 files per request
3. **File Types**: Only whitelisted MIME types allowed
4. **Storage**: Files are stored on local disk (not cloud storage)
5. **Physical Deletion**: Deleted files remain on disk for audit purposes

## Future Enhancements

Potential improvements:

- Cloud storage integration (S3, Azure Blob, etc.)
- File preview generation
- OCR for scanned documents
- Virus scanning integration
- Hard delete after retention period
- File compression
- Duplicate detection across contracts
- Batch download (ZIP)
- File sharing links with expiration
- Advanced search (content, metadata)
