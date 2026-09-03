-- Migration: Create milestone submission history table
-- This enables tracking of all submission attempts and client responses

CREATE TABLE IF NOT EXISTS milestone_submission_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id      UUID        NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  submission_type   VARCHAR(20) NOT NULL CHECK (submission_type IN ('submitted', 'approved', 'rejected', 'revision_requested')),
  submitted_by      UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_by       UUID        REFERENCES users (id) ON DELETE RESTRICT,
  
  -- Submission details
  deliverable_notes TEXT,
  deliverable_links TEXT[],
  
  -- Review feedback
  feedback          TEXT,
  revision_notes    TEXT,
  
  -- Metadata
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_milestone_submission_history_milestone 
  ON milestone_submission_history (milestone_id, created_at DESC);

CREATE INDEX idx_milestone_submission_history_submitter 
  ON milestone_submission_history (submitted_by);

CREATE INDEX idx_milestone_submission_history_reviewer 
  ON milestone_submission_history (reviewed_by);

-- Add submission notes to milestones table
ALTER TABLE milestones 
  ADD COLUMN IF NOT EXISTS submission_notes TEXT,
  ADD COLUMN IF NOT EXISTS revision_requested BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE milestone_submission_history IS 'Tracks all milestone submission attempts and client review decisions';
COMMENT ON COLUMN milestone_submission_history.submission_type IS 'Type of history entry: submitted, approved, rejected, revision_requested';
COMMENT ON COLUMN milestones.revision_requested IS 'Flag indicating if client has requested revisions';
COMMENT ON COLUMN milestones.revision_count IS 'Number of times revisions have been requested';
