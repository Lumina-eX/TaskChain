-- 010_idempotency_records.sql
--
-- Idempotency layer for payment operations (issue #218).
--
-- Guarantees that blockchain / payment requests are processed exactly once:
--   * every request carries a client-generated idempotency key
--   * the key + operation type is unique at the database level
--   * concurrent duplicates are rejected by the unique constraint instead of
--     racing through the escrow lifecycle
--   * stored responses are replayed for repeated requests
--   * records expire after a configurable TTL and are purged by a cleanup job

-- ── Status enum ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idempotency_status') THEN
    CREATE TYPE idempotency_status AS ENUM ('in_progress', 'completed', 'failed');
  END IF;
END;
$$;

-- ── Core table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_records (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT               NOT NULL,
  operation_type    TEXT               NOT NULL,
  request_hash      TEXT               NOT NULL,
  request_payload   JSONB              NOT NULL DEFAULT '{}'::jsonb,
  response_payload  JSONB,
  response_status   INTEGER,
  status            idempotency_status NOT NULL DEFAULT 'in_progress',
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ        NOT NULL,

  -- Race-safety: only one record may exist for a (key, operation) pair.
  -- A concurrent duplicate INSERT fails here rather than executing the
  -- payment operation a second time.
  CONSTRAINT uq_idempotency_key_operation UNIQUE (idempotency_key, operation_type)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Supports the TTL cleanup sweep.
CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at
  ON idempotency_records (expires_at);

-- Supports operational queries / dashboards for a given operation type.
CREATE INDEX IF NOT EXISTS idx_idempotency_records_operation_created
  ON idempotency_records (operation_type, created_at DESC);

-- ── Database-level duplicate protection for payment records ─────────────────
-- A given on-chain transaction hash must never be recorded twice for a money
-- movement (deposit / release / refund). Partial index so dispute rows and
-- rows without a hash are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_escrow_transaction_logs_payment_hash
  ON escrow_transaction_logs (transaction_hash)
  WHERE transaction_hash IS NOT NULL
    AND transaction_type IN ('deposit', 'milestone_release', 'refund');
