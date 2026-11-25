-- A project can have at most one accepted proposal. This constraint is the
-- final guard against concurrent acceptance requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_proposals_single_acceptance
  ON project_proposals (project_id)
  WHERE status = 'accepted';

-- Proposal decisions and shortlisting are written alongside their status
-- changes in one database statement.
CREATE TABLE IF NOT EXISTS project_proposal_audit_logs (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID            NOT NULL REFERENCES project_proposals (id) ON DELETE CASCADE,
  project_id      UUID            NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id        UUID            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action          TEXT            NOT NULL CHECK (action IN ('shortlist', 'accept', 'reject')),
  previous_status proposal_status NOT NULL,
  new_status      proposal_status NOT NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_proposal_audit_proposal
  ON project_proposal_audit_logs (proposal_id, created_at DESC);
