-- 012_dispute_resolution_workflow.sql
--
-- Dispute Resolution Workflow & Authorization API (issue #247)
--
-- Extends the canonical (UUID) contract schema with everything the dispute
-- workflow needs:
--   * arbitrator / designated decision-maker configuration on contracts
--   * evidence references stored separately from the free-form JSONB column
--   * resolution attempts that track on-chain transactions separately for
--     pending / confirmed / failed states
--   * an append-only audit trail for every dispute lifecycle event
--   * database-level guarantees against duplicate disputes, duplicate evidence
--     and duplicate/concurrent resolutions.

-- ── Contracts: arbitration configuration ─────────────────────────────────────
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS arbiter_address TEXT,
  ADD COLUMN IF NOT EXISTS designated_resolver_id UUID
    REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN contracts.arbiter_address IS
  'Stellar address of the arbitrator authorised to resolve disputes on-chain. Mirrors the escrow contract Arbiter.';
COMMENT ON COLUMN contracts.designated_resolver_id IS
  'Optional platform user allowed to arbitrate this contract in addition to admins and the on-chain arbiter.';

CREATE INDEX IF NOT EXISTS idx_contracts_arbiter_address
  ON contracts (arbiter_address)
  WHERE arbiter_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_designated_resolver
  ON contracts (designated_resolver_id)
  WHERE designated_resolver_id IS NOT NULL;

-- ── Disputes: idempotent creation + resolution metadata ──────────────────────
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS creation_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_resolution_attempt_id UUID;

-- A client may only create one dispute per contract for a given idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_contract_creation_key
  ON disputes (contract_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

-- A contract can never have more than one open dispute. Concurrent creation
-- requests race on this index; only one INSERT can win.
CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_one_active_per_contract
  ON disputes (contract_id)
  WHERE status IN ('open', 'under_review', 'escalated');

-- ── Evidence references ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_evidence_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id           UUID        NOT NULL REFERENCES disputes (id) ON DELETE RESTRICT,
  milestone_id         UUID        REFERENCES milestones (id) ON DELETE SET NULL,
  submitted_by_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  evidence_type        TEXT        NOT NULL
    CHECK (evidence_type IN ('url', 'ipfs', 'document', 'transaction', 'other')),
  reference_url        TEXT        NOT NULL CHECK (length(btrim(reference_url)) > 0),
  label                TEXT,
  description          TEXT,
  -- sha256(evidence_type|reference_url|label) — used to reject duplicate
  -- submissions of the same reference against the same dispute.
  content_hash         TEXT        NOT NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_dispute_evidence_reference UNIQUE (dispute_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_items_dispute
  ON dispute_evidence_items (dispute_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_items_submitter
  ON dispute_evidence_items (submitted_by_user_id);

-- ── Resolution attempts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_resolution_attempts (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id           UUID          NOT NULL REFERENCES disputes (id) ON DELETE RESTRICT,
  requested_by_user_id UUID          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  outcome              dispute_status NOT NULL
    CHECK (outcome IN ('resolved_client', 'resolved_freelancer', 'resolved_split', 'withdrawn')),
  -- Documented resolution reason. Short one-liners are rejected by the API.
  reasons              TEXT          NOT NULL CHECK (length(btrim(reasons)) >= 10),
  metadata             JSONB         NOT NULL DEFAULT '{}'::jsonb,

  -- On-chain transaction tracking. `pending` is never treated as resolved.
  status               TEXT          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  onchain              BOOLEAN       NOT NULL DEFAULT TRUE,
  tx_hash              TEXT,
  ledger               INTEGER,
  error_code           TEXT,
  error_message        TEXT,
  retry_of             UUID          REFERENCES dispute_resolution_attempts (id) ON DELETE SET NULL,

  -- Client supplied idempotency key. Unique per dispute so a replayed request
  -- cannot create a second attempt or a second on-chain transaction.
  idempotency_key      TEXT          NOT NULL,

  submitted_at         TIMESTAMPTZ,
  confirmed_at         TIMESTAMPTZ,
  failed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_resolution_attempt_key UNIQUE (dispute_id, idempotency_key)
);

-- At most one in-flight resolution per dispute (blocks concurrent resolutions).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispute_pending_resolution
  ON dispute_resolution_attempts (dispute_id)
  WHERE status = 'pending';

-- A dispute can only be resolved once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispute_confirmed_resolution
  ON dispute_resolution_attempts (dispute_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_resolution_attempts_dispute
  ON dispute_resolution_attempts (dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolution_attempts_status
  ON dispute_resolution_attempts (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_resolution_attempts_tx
  ON dispute_resolution_attempts (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- ── Append-only audit trail ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_audit_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable so authorization decisions taken before a dispute exists (for
  -- example a rejected creation request) are still auditable.
  dispute_id    UUID        REFERENCES disputes (id) ON DELETE RESTRICT,
  contract_id   UUID        NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  actor_user_id UUID        REFERENCES users (id) ON DELETE RESTRICT,
  actor_wallet  TEXT,
  action        TEXT        NOT NULL CHECK (action IN (
                  'dispute_created',
                  'evidence_submitted',
                  'authorization_denied',
                  'resolution_requested',
                  'resolution_pending',
                  'resolution_confirmed',
                  'resolution_failed',
                  'resolution_retried'
                )),
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_audit_events_dispute
  ON dispute_audit_events (dispute_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_dispute_audit_events_contract
  ON dispute_audit_events (contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_audit_events_action
  ON dispute_audit_events (action, created_at DESC);

-- Audit rows are immutable: the database itself refuses UPDATE and DELETE.
CREATE OR REPLACE FUNCTION dispute_audit_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dispute_audit_events is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispute_audit_events_immutable ON dispute_audit_events;
CREATE TRIGGER trg_dispute_audit_events_immutable
  BEFORE UPDATE OR DELETE ON dispute_audit_events
  FOR EACH ROW EXECUTE FUNCTION dispute_audit_events_reject_mutation();

COMMENT ON TABLE dispute_audit_events IS
  'Append-only audit trail for the dispute resolution workflow. UPDATE/DELETE are rejected by trigger.';
