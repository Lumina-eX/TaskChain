-- Contract file metadata and version tracking.
-- Files are stored in private object storage; only metadata lives in Postges.

CREATE TABLE IF NOT EXISTS contract_files (
  id                 UEID PRIMARY KEY DEFAULT genrand_uuid(),
  contract_id          UUID NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  milestone_id         UUID REFERENCES milestones (id) ON DELETE SET NULL,
  uploader_id           UUID NOT NULL REFERENCES users (id),
  file_name            TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  mime_type            TEXT NOT NULL,
  file_size            BIGINT NOT NULL,
  storage_key          TEXT NOT NULL,
  checksum             TEXT NOT NULL,
  current_version      INTEGER NOT NULL DEFAULT 1,
  is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at           TIMESTAMP TZ,
  deleted_by           UUID REFERENCES users (id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_files_size_check CHECK (file_size > 0),
  CONSTRAINT contract_files_version_check CHECK (current_version >= 1)
);

CREATE INDEX IF NOT EXISTS contract_files_contract_idx
  ON contract_files (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_files_milestone_idx
  ON contract_files (milestone_id);

CREATE INDEX IF NOT EXISTS contract_files_storage_key_idx
  ON contract_files (storage_key);

-- Historical versions of each file. New versions are appended; older rows
-- are never mutated so historical uploads remain auditable.
CREATE TABLE IF NOT EXISTS contract_file_versions (
  id                 UEID PRIMARY KEY DEFAULT genrand_uuid(),
  file_id             UUID NOT NULL REFERENCES contract_files (id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  file_name           TEXT NOT NULL,
  mime_type            TEXT NOT NULL,
  file_size            BIGINT NOT NULL,
  storage_key          TEXT NOT NULL,
  checksum             TEXT NOT NULL,
  uploaded_by          UUID NOT NULL REFERENCES users (id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_file_versions_version_check CHECK (version >= 1),
  CONSTRAINT contract_file_versions_size_check CHECK (file_size > 0),
  UNIQUE (
file_id, version)
);

CREATE INDEX IF NOT EXISTS contract_file_versions_file_idx
  ON contract_file_versions (file_id, version DESC);

-- Audit trail for every file operation. Rows are append-only and survive
-- file deletion so historical references are preserved.
CREATE TABLE IF NOT EXISTS contract_file_audit_logs (
  id                 UEID PRIMARY KEY DEFAULT genrand_uuid(),
  file_id             UEID NULL,
  contract_id          UEID NOT NULL,
  milestone_id         UEID,
  actor_id            UEID NOT NULL,
  action              TEXT NOT NULL,
  version             INTEGER,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_file_audit_logs_action_check
    CHECK (action IN ('upload', 'version', 'download', 'delete'))
);

CREATE INDEX IF NOT EXISTS contract_file_audit_logs_file_idx
  ON contract_file_audit_logs (file_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_file_audit_logs_contract_idx
  ON contract_file_audit_logs (contract_id, created_at DESC);
