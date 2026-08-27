-- 012-project-recommendation-columns.sql
--
-- Adds `skills` and `category` columns to the `projects` table so the
-- recommendation service (issue #185) can match projects to freelancers
-- based on skill overlap, budget range, and category affinity.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- GIN index for skill overlap queries used by the recommendation algorithm.
CREATE INDEX IF NOT EXISTS idx_projects_skills_gin
  ON projects USING GIN (skills);

-- Index for category-based filtering.
CREATE INDEX IF NOT EXISTS idx_projects_category
  ON projects (category);

-- Composite partial index: only open projects by (category, budget) for
-- fast recommendation candidate retrieval.
CREATE INDEX IF NOT EXISTS idx_projects_recommendation_candidate
  ON projects (category, budget_usdc DESC)
  WHERE status = 'open';
