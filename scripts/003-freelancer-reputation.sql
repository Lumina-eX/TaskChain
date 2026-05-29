-- Freelancer reputation: denormalized metrics for fast reads + jobs completion timestamp

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

UPDATE jobs
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS freelancer_reputation (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jobs_started INTEGER NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  jobs_with_dispute INTEGER NOT NULL DEFAULT 0,
  total_completed_volume NUMERIC(14, 2) NOT NULL DEFAULT 0,
  completed_with_deadline INTEGER NOT NULL DEFAULT 0,
  on_time_deliveries INTEGER NOT NULL DEFAULT 0,
  completion_rate NUMERIC(7, 6),
  dispute_rate NUMERIC(7, 6),
  on_time_delivery_rate NUMERIC(7, 6),
  reputation_score NUMERIC(6, 2),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freelancer_reputation_computed_at
  ON freelancer_reputation (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_freelancer_status
  ON jobs (freelancer_id, status)
  WHERE freelancer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_freelancer_completed
  ON jobs (freelancer_id)
  WHERE freelancer_id IS NOT NULL AND status = 'completed';
