-- 010_project_proposals.sql
--
-- Issue #216 — Proposal Management API.
--
-- Freelancer proposals against client projects. The table is named
-- `project_proposals` so it cannot collide with the legacy `proposals`
-- table (job_id based) in scripts/001-create-tables.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
    CREATE TYPE proposal_status AS ENUM (
      'submitted', 'under_review', 'accepted', 'rejected', 'updated'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS project_proposals (
  id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID            NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  freelancer_id  UUID            NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  message        TEXT            NOT NULL,
  budget         NUMERIC(18,6)   NOT NULL CHECK (budget > 0),
  delivery_time  INTEGER         NOT NULL CHECK (delivery_time > 0),   -- days
  milestones     JSONB           NOT NULL DEFAULT '[]'::jsonb,

  status         proposal_status NOT NULL DEFAULT 'submitted',

  created_at     TIMESTAMPZ     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPZ     NOT NULL DEFAULT NOW()
);

-- Lookup indexes required by the issue (projectId / freelancerId).
CREATE INDEX IF NOT EXISTS idx_project_proposals_project
  ON project_proposals (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_proposals_freelancer
  ON project_proposals (freelancer_id);

-- Duplicate prevention at the database level: one *active* proposal per
-- freelancer per project. A rejected proposal no longer counts as active,
-- so the freelancer may submit a fresh one. The API also pre-checks this
-- and maps a unique violation (23505) to 409 Conflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_proposals_active
  ON project_proposals (project_id, freelancer_id)
  WHERE status <> 'rejected';

-- Concurrency control: a single-award project can have at most one
-- accepted proposal at any time. This partial unique index is the
-- authoritative guarantee that concurrent acceptance requests cannot
-- create multiple contracts for the same project: the second writer
-- fails with a unique violation (23505) which the API translates into a
-- graceful 409 Conflict and rolls back completely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_proposals_accepted
  ON project_proposals (project_id)
  WHERE status = 'accepted';

-- Keep updated_at in sync on every write so audit trails and conflict
-- resolution can rely on it.
CREATE OR REPLACE FUNCTION set_project_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgschema = 'public'
      AND tgname = 'trig_project_proposals_updated_at'
  ) THEN
    CREATE TRIGGER trig_project_proposals_updated_at
      BEFORE UPDATE ON project_proposals
      FOR EACH ROW
      EXECUTE PROCEDURE set_project_proposals_updated_at();
  END IF;
END$$;End