DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_transaction_type') THEN
    CREATE TYPE escrow_transaction_type AS ENUM (
      'deposit',
      'milestone_release',
      'refund',
      'dispute'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS escrow_transaction_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id          UUID NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  project_id           UUID NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  milestone_id         UUID REFERENCES milestones (id) ON DELETE SET NULL,
  dispute_id           UUID REFERENCES disputes (id) ON DELETE SET NULL,
  actor_user_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  counterparty_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  transaction_type     escrow_transaction_type NOT NULL,
  amount               NUMERIC(18,6),
  currency             TEXT NOT NULL DEFAULT 'USDC',
  transaction_hash     TEXT,
  status               TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  description          TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_escrow_transaction_logs_money_amount
    CHECK (
      (transaction_type IN ('deposit', 'milestone_release', 'refund') AND amount IS NOT NULL AND amount > 0)
      OR (transaction_type = 'dispute')
    ),
  CONSTRAINT chk_escrow_transaction_logs_milestone_release
    CHECK (transaction_type <> 'milestone_release' OR milestone_id IS NOT NULL),
  CONSTRAINT chk_escrow_transaction_logs_dispute
    CHECK (transaction_type <> 'dispute' OR dispute_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_contract
  ON escrow_transaction_logs (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_project
  ON escrow_transaction_logs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_actor
  ON escrow_transaction_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_counterparty
  ON escrow_transaction_logs (counterparty_user_id, created_at DESC)
  WHERE counterparty_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_type
  ON escrow_transaction_logs (transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_transaction_logs_hash
  ON escrow_transaction_logs (transaction_hash)
  WHERE transaction_hash IS NOT NULL;
