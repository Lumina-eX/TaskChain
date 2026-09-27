-- 010_project_discovery.sql
--
-- Advanced project filtering & sorting (issue #181).
--
-- Ensures the `projects` table carries every column the discovery service
-- (lib/projectDiscovery.ts) filters or sorts on:
--   * deadline  — enables "deadline" sorting
--   * skills    — enables multi-select "required skills" filtering
--   * category  — lets the discovery UI surface a category badge
--
-- `skills`/`category` are also introduced by scripts/012-project-recommendation-
-- columns.sql; the IF NOT EXISTS guards below make this migration safe to run
-- regardless of which schema path a deployment took.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skills   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Range scans for budget filtering/sorting.
CREATE INDEX IF NOT EXISTS idx_projects_budget_usdc
  ON projects (budget_usdc);

-- Deadline sorting / "ending soon" queries.
CREATE INDEX IF NOT EXISTS idx_projects_deadline
  ON projects (deadline);

-- Skill overlap filtering (required skills).
CREATE INDEX IF NOT EXISTS idx_projects_skills_gin
  ON projects USING GIN (skills);

-- Combined status + recency ordering used by the default "newest first" view.
CREATE INDEX IF NOT EXISTS idx_projects_status_created
  ON projects (status, created_at DESC);
