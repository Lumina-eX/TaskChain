-- Proposals and audit logs with concurrency-safe constraints

CREATE TABLE IF NOT EXISTS proposals (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter       TEXT        NOT NULL,
  proposed_budget    NUMERIC(18,6) NOT NULL,
  currency           TEXT        NOT NULL DEFAULT 'USDC',
  estimated_duration TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','updated')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer ON proposals(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_status ON proposals(client_id, status);

-- Ensure at most one accepted proposal per project (single-award projects).
-- A partial unique index is the database-level guard against concurrent acceptance.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_proposals_one_accepted_per_project
  ON proposals(project_id)
  WHERE status = 'accepted';

-- Prevent duplicate processing of the same request by deduplicing audit entries
-- for the same proposal/actor/action within a short window.
CREATE TABLE IF NOT EXISTS proposal_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID        NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  actor_id        UUID        NOT NULL REFERENCES users(id),
  action           TEXT        NOT NULL CHECK (action IN ('accept','reject','update','create')),
  previous_status  TEXT,
  new_status       TEXT,
  metadata         JSON        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_audit_proposal ON proposal_audit_logs(proposal_id);
