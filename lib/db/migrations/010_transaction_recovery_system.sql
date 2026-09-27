-- Durable state and append-only audit history for Stellar/Soroban transactions.
DO $$ BEGIN
  CREATE TYPE tx_recovery_status AS ENUM ('pending', 'success', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_network AS ENUM ('stellar', 'soroban');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tracked_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT NOT NULL UNIQUE CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
  network tx_network NOT NULL DEFAULT 'stellar',
  contract_id UUID REFERENCES contracts (id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones (id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'escrow_fund', 'milestone_submit', 'milestone_approve', 'payment_release',
    'refund', 'dispute_raise', 'dispute_resolve', 'contract_deploy'
  )),
  status tx_recovery_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 10 CHECK (max_retries BETWEEN 1 AND 50),
  last_polled_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_transactions_queue
  ON tracked_transactions (next_poll_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tracked_transactions_contract
  ON tracked_transactions (contract_id, created_at DESC) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracked_transactions_milestone
  ON tracked_transactions (milestone_id, created_at DESC) WHERE milestone_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transaction_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_transaction_id UUID NOT NULL REFERENCES tracked_transactions (id) ON DELETE CASCADE,
  status tx_recovery_status NOT NULL,
  code TEXT,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tracked_transaction_id, status)
);

CREATE INDEX IF NOT EXISTS idx_transaction_lifecycle_events_transaction
  ON transaction_lifecycle_events (tracked_transaction_id, created_at DESC);
