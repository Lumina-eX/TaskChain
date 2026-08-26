-- Encrypted, server-managed dispute evidence metadata.
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id       UUID NOT NULL REFERENCES disputes (id) ON DELETE CASCADE,
  uploader_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  stored_filename   TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size         BIGINT NOT NULL CHECK (file_size > 0),
  file_hash         TEXT NOT NULL,
  encryption_iv     TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL DEFAULT 'primary',
  file_path         TEXT NOT NULL,
  description       TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  is_removed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute
  ON dispute_evidence (dispute_id, created_at DESC, id DESC)
  WHERE is_removed = FALSE;

ALTER TYPE activity_action_type ADD VALUE IF NOT EXISTS 'dispute_evidence_uploaded';
ALTER TYPE activity_action_type ADD VALUE IF NOT EXISTS 'dispute_evidence_viewed';
ALTER TYPE activity_action_type ADD VALUE IF NOT EXISTS 'dispute_evidence_deleted';