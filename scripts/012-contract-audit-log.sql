-- Contract Audit Log: immutable application-level audit trail for contract actions.
-- Append-only: no UPDATE or DELETE allowed (enforced by app-layer + migration comment).
-- Tracks: contract_creation, milestone_creation, milestone_submission,
--          approval, rejection, dispute_creation, dispute_resolution, contract_completion.

-- Drop if exists for clean re-runs
DROP TABLE IF EXISTS contract_audit_logs;

CREATE TABLE contract_audit_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  contract_id     INTEGER       NOT NULL,  -- FK to contracts(id), SERIAL
  project_id      INTEGER       NOT NULL,  -- FK to projects(id),   SERIAL

  -- Immutable audit fields
  action          VARCHAR(50)   NOT NULL
                  CHECK (action IN (
                    'contract_creation',
                    'milestone_creation',
                    'milestone_submission',
                    'approval',
                    'rejection',
                    'dispute_creation',
                    'dispute_resolution',
                    'contract_completion'
                  )),

  -- Actor (who performed the action)
  actor_user_id   INTEGER       NOT NULL,  -- FK to users(id)
  actor_wallet    VARCHAR(255)  NOT NULL,

  -- State transition (for status-change actions)
  previous_state  VARCHAR(100),
  new_state       VARCHAR(100),

  -- Optional references
  milestone_id    INTEGER,
  dispute_id      INTEGER,
  amount          DECIMAL(18, 6),

  -- Metadata blob
  metadata        JSONB         NOT NULL DEFAULT '{}',

  -- UTC timestamp (set at insert time)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient paginated queries and filtering
CREATE INDEX idx_audit_contract    ON contract_audit_logs(contract_id);
CREATE INDEX idx_audit_project     ON contract_audit_logs(project_id);
CREATE INDEX idx_audit_actor      ON contract_audit_logs(actor_user_id);
CREATE INDEX idx_audit_action     ON contract_audit_logs(action);
CREATE INDEX idx_audit_created    ON contract_audit_logs(created_at DESC);
-- Composite for common filter combos
CREATE INDEX idx_audit_contract_created ON contract_audit_logs(contract_id, created_at DESC);
CREATE INDEX idx_audit_project_actor     ON contract_audit_logs(project_id, actor_user_id);

-- FK constraints
ALTER TABLE contract_audit_logs
  ADD CONSTRAINT fk_audit_contract
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT;

ALTER TABLE contract_audit_logs
  ADD CONSTRAINT fk_audit_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

ALTER TABLE contract_audit_logs
  ADD CONSTRAINT fk_audit_actor
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;

COMMENT ON TABLE contract_audit_logs IS
  'Immutable append-only contract audit log. UPDATE and DELETE must never be issued by application code.';
