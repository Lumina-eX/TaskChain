-- Migration 012: Proposals table (UUID schema)
--
-- Stores freelancer proposals submitted against open projects.
-- A proposal can transition: pending → accepted | rejected.
-- Exactly one proposal can be accepted per project (enforced by partial unique index).
-- When a proposal is accepted the system atomically creates a contract record.

-- ─── Proposal status enum ─────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
    CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
  END IF;
END;
$$;

-- ─── Proposals table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposals (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  project_id          UUID          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  freelancer_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Proposal content
  cover_letter        TEXT          NOT NULL,
  proposed_amount     NUMERIC(18,6) NOT NULL
    CHECK (proposed_amount > 0),
  currency            TEXT          NOT NULL DEFAULT 'USDC',
  estimated_duration  TEXT,                       -- e.g. "2 weeks", "30 days"

  -- Milestone breakdown submitted with the proposal (optional JSON array)
  -- Each element: { title, description, amount, due_date? }
  milestone_breakdown JSONB         NOT NULL DEFAULT '[]',

  -- Lifecycle
  status              proposal_status NOT NULL DEFAULT 'pending',

  -- Traceability: which contract was created from this proposal
  contract_id         UUID          REFERENCES contracts (id) ON DELETE SET NULL,

  -- Timestamps
  accepted_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A freelancer may only submit one proposal per project
  CONSTRAINT uq_proposal_per_freelancer_project UNIQUE (project_id, freelancer_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────

-- Proposals for a project (client reviews these)
CREATE INDEX IF NOT EXISTS idx_proposals_project_id
  ON proposals (project_id);

-- Proposals by a freelancer (freelancer's application history)
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id
  ON proposals (freelancer_id);

-- Status filtering (e.g. open proposals awaiting response)
CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals (status)
  WHERE status = 'pending';

-- Only ONE accepted proposal is allowed per project.
-- This partial unique index enforces that at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposals_one_accepted_per_project
  ON proposals (project_id)
  WHERE status = 'accepted';

-- Back-reference from contract to the originating proposal
CREATE INDEX IF NOT EXISTS idx_proposals_contract_id
  ON proposals (contract_id)
  WHERE contract_id IS NOT NULL;

-- ─── updated_at trigger ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_proposals_updated_at'
  ) THEN
    CREATE TRIGGER trg_proposals_updated_at
      BEFORE UPDATE ON proposals
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
