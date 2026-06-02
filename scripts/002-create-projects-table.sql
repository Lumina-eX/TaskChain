-- scripts/002-create-projects-table.sql
--
-- Creates the `projects` table for TaskChain.
-- Run this against your Neon database after 001-create-tables.sql.
--
-- Column notes:
--   budget_usdc     — stored as NUMERIC(18,7) to handle Stellar's 7-decimal
--                     precision (1 stroop = 0.0000001 XLM/USDC).
--   status          — enforced by CHECK; mirrors the ProjectStatus type in
--                     lib/projects.ts.
--   milestone_count — convenience counter; actual milestone rows live in a
--                     separate `milestones` table (future migration).

CREATE TABLE IF NOT EXISTS projects (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID          NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  description     TEXT,
  budget_usdc     NUMERIC(18,7) NOT NULL CHECK (budget_usdc > 0),
  status          VARCHAR(20)   NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','completed','cancelled')),
  milestone_count INTEGER       NOT NULL DEFAULT 0 CHECK (milestone_count >= 0),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_projects_client_id
  ON projects (client_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status);

CREATE INDEX IF NOT EXISTS idx_projects_client_status
  ON projects (client_id, status);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
  ON projects (created_at DESC);

-- Automatically update updated_at on every row change.
-- Requires the update_updated_at_column() trigger function from 001-create-tables.sql.
-- If that function does not exist yet, create it with:
--
--   CREATE OR REPLACE FUNCTION update_updated_at_column()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     NEW.updated_at = NOW();
--     RETURN NEW;
--   END;
--   $$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE  routine_name = 'update_updated_at_column'
      AND  routine_type = 'FUNCTION'
  ) THEN
    EXECUTE $func$
      CREATE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $inner$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $inner$ LANGUAGE plpgsql
    $func$;
  END IF;
END $$;

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();