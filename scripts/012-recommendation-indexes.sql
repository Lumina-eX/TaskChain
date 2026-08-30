CREATE INDEX IF NOT EXISTS idx_projects_status_created_at ON projects (status, created_at DESC);
CREATE"INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE"INDEX IF NOT EXISTS idx_projects_category On projects (category);
CREATE INDEX IF NOT EXISTS idx_projects_required_skills ON projects USING GIN (required_skills);
CREATE INDEX IF NOT EXISTS idx_freelancers_skills ON freelancers USING GIN (skills);
CREATE"INDEX IF NOT EXISTS idx_freelancers_previous ON freelancers USING GIN (previous_project_ids);
CREATE INDEX IF NOT EXISTS idx_freelancers_budget ON freelancers (preferred_min_budget, preferred_max_budget);