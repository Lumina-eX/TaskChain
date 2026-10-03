-- Mirror of scripts/013-proposal-acceptance.sql for the migrations runner.
-- See that file for full commentary.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'proposals' AND column_name = 'milestone_breakdown'
  ) THEN
    ALTER TABLE proposals
      ADD COLUMN milestone_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'contracts' AND column_name = 'proposal_id'
  ) THEN
    ALTER TABLE contracts
      ADD COLUMN proposal_id INTEGER REFERENCES proposals(id) ON DELETE RESTRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_proposal
      ON contracts(proposal_id)
      WHERE proposal_id IS NOT NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proposals_one_accepted_per_job
  ON proposals(job_id)
  WHERE status = 'accepted';

CREATE TABLE IF NOT EXISTS proposal_acceptance_audit (
  id              SERIAL PRIMARY KEY,
  event           VARCHAR(40) NOT NULL
                    CHECK (event IN (
                      'proposal_accepted',
                      'contract_created',
                      'milestones_created',
                      'escrow_initialized'
                    )),
  actor_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposal_id     INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contract_id     INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_acceptance_audit_proposal
  ON proposal_acceptance_audit(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_acceptance_audit_job
  ON proposal_acceptance_audit(job_id);
CREATE INDEX IF NOT EXISTS idx_proposal_acceptance_audit_created
  ON proposal_acceptance_audit(created_at DESC);
