-- Contract Files Table
-- Tracks files uploaded by contract participants with metadata, versioning, and audit trail.

CREATE TABLE IF NOT EXISTS contract_files (
  id SERIAL PRIMARY KEY,
  
  -- References
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- File metadata
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(127) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  file_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity verification
  
  -- Storage
  file_path TEXT NOT NULL,
  encryption_iv VARCHAR(32) NOT NULL, -- Initialization vector for AES-256-CBC
  
  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  parent_file_id INTEGER REFERENCES contract_files(id) ON DELETE SET NULL,
  is_latest_version BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Soft delete (preserve audit history)
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Metadata
  description TEXT,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_files_contract ON contract_files(contract_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_contract_files_milestone ON contract_files(milestone_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_contract_files_uploaded_by ON contract_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_contract_files_hash ON contract_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_contract_files_parent ON contract_files(parent_file_id);
CREATE INDEX IF NOT EXISTS idx_contract_files_latest ON contract_files(contract_id, is_latest_version) WHERE is_deleted = FALSE AND is_latest_version = TRUE;

-- Ensure only one "latest version" per file lineage
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_files_unique_latest 
  ON contract_files(COALESCE(parent_file_id, id)) 
  WHERE is_latest_version = TRUE AND is_deleted = FALSE;

-- File Download Audit Log
-- Tracks all file downloads for security and compliance
CREATE TABLE IF NOT EXISTS contract_file_downloads (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES contract_files(id) ON DELETE CASCADE,
  downloaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  downloaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_downloads_file ON contract_file_downloads(file_id);
CREATE INDEX IF NOT EXISTS idx_file_downloads_user ON contract_file_downloads(downloaded_by);
CREATE INDEX IF NOT EXISTS idx_file_downloads_timestamp ON contract_file_downloads(downloaded_at DESC);

-- Add file-related actions to activity logs
DO $$
BEGIN
  -- Check if the activity_action_type enum exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_action_type') THEN
    -- Add new enum values if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumtypid = 'activity_action_type'::regtype 
      AND enumlabel = 'file_uploaded'
    ) THEN
      ALTER TYPE activity_action_type ADD VALUE 'file_uploaded';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumtypid = 'activity_action_type'::regtype 
      AND enumlabel = 'file_downloaded'
    ) THEN
      ALTER TYPE activity_action_type ADD VALUE 'file_downloaded';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumtypid = 'activity_action_type'::regtype 
      AND enumlabel = 'file_deleted'
    ) THEN
      ALTER TYPE activity_action_type ADD VALUE 'file_deleted';
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumtypid = 'activity_action_type'::regtype 
      AND enumlabel = 'file_version_updated'
    ) THEN
      ALTER TYPE activity_action_type ADD VALUE 'file_version_updated';
    END IF;
  END IF;
END;
$$;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_contract_files_updated_at ON contract_files;
CREATE TRIGGER trigger_contract_files_updated_at
  BEFORE UPDATE ON contract_files
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_files_updated_at();

-- Add file_id reference to activity_logs if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'activity_logs' AND column_name = 'file_id'
  ) THEN
    ALTER TABLE activity_logs ADD COLUMN file_id INTEGER REFERENCES contract_files(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_logs_file ON activity_logs(file_id);
  END IF;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE contract_files IS 'Stores contract-related files with encryption, versioning, and audit trail';
COMMENT ON COLUMN contract_files.file_hash IS 'SHA-256 hash for integrity verification and deduplication';
COMMENT ON COLUMN contract_files.encryption_iv IS 'Initialization vector for AES-256-CBC encryption';
COMMENT ON COLUMN contract_files.version IS 'Version number, increments for each update to the same logical file';
COMMENT ON COLUMN contract_files.parent_file_id IS 'References the previous version of this file for version history';
COMMENT ON COLUMN contract_files.is_latest_version IS 'Indicates whether this is the current version of the file';
COMMENT ON TABLE contract_file_downloads IS 'Audit log of all file downloads for security and compliance';
