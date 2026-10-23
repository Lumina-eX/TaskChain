CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,   -- REPLACE type if ids are not uuid
  opened_by uuid NOT NULL,                                                -- REPLACE with users.id type
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolution_pending','resolution_failed','resolved')),
  resolution_outcome text CHECK (resolution_outcome IN ('release_to_freelancer','refund_to_client','split')),
  resolution_reason text,
  resolution_metadata jsonb,
  resolved_by uuid,
  resolution_tx_hash text,
  resolution_submitted_at timestamptz,
  resolution_confirmed_at timestamptz,
  chain_attempts integer NOT NULL DEFAULT 0,
  chain_last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One unresolved dispute per contract (prevents duplicate disputes)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_dispute_per_contract
  ON disputes (contract_id) WHERE status <> 'resolved';

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,                                             -- REPLACE type
  kind text NOT NULL CHECK (kind IN ('url','ipfs')),
  uri text NOT NULL CHECK (char_length(uri) <= 2048),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispute_id, uri)                                                -- prevents duplicate evidence
);

-- Audit trail
CREATE TABLE IF NOT EXISTS dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor_id uuid,                                                          -- NULL = system
  event_type text NOT NULL,
  tx_hash text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON dispute_events (dispute_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);