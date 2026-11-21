-- Issue #217: proposal -> contract traceability + one accepted proposal per project
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS proposal_id UUID UNIQUE
  REFERENCES project_proposals (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_proposals_one_accepted
  ON project_proposals (project_id) WHERE status = 'accepted';

-- Audit trail: acceptance, contract creation and escrow initialisation,
-- each with actor and timestamp (UUID-based, matches contracts/users).
CREATE TABLE IF NOT EXISTS proposal_acceptance_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event       TEXT        NOT NULL
    CHECK (event IN ('proposal_accepted', 'contract_created', 'escrow_initialized')),
  proposal_id UUID        NOT NULL REFERENCES project_proposals (id) ON DELETE CASCADE,
  contract_id UUID        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  actor_id    UUID        NOT NULL REFERENCES users (id),
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_acceptance_audit_contract
  ON proposal_acceptance_audit_logs (contract_id);
