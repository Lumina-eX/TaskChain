-- ============================================================================
-- 011_payment_ledger.sql
--
-- Payment Ledger & Reconciliation Reports infrastructure.
--
-- Adds:
--  1. A unique index on escrow_transaction_logs to prevent duplicate ledger
--     entries caused by repeated blockchain events.
--  2. reconciliation_reports table — metadata + summary of each reconciliation run.
--  3. reconciliation_discrepancies table — surfaced discrepancies for investigation.
--
-- The existing escrow_transaction_logs table remains the source of truth for
-- confirmed payment movements. This migration only adds read-side indexes
-- and new reconciliation tables without modifying the existing schema.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Deduplication: prevent duplicate ledger entries from repeated blockchain events
-- ---------------------------------------------------------------------------

-- A unique index on (transaction_hash, transaction_type, contract_id) ensures
-- that a replayed blockchain event (same hash, same type, same contract)
-- cannot insert a second row.  Rows with NULL transaction_hash (dispute logs)
-- are excluded from the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_tx_logs_dedup
  ON escrow_transaction_logs (transaction_hash, transaction_type, contract_id)
  WHERE transaction_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Reconciliation report status enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN
    CREATE TYPE reconciliation_status AS ENUM (
      'pending',
      'completed',
      'failed',
      'discrepancies_found'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Reconciliation reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by     UUID        REFERENCES users (id) ON DELETE SET NULL,

  status           reconciliation_status NOT NULL DEFAULT 'pending',

  -- Optional scope filters applied during the run
  contract_id      UUID,                        -- null = all contracts
  token            TEXT,                        -- e.g. 'USDC'
  date_from        TIMESTAMPTZ,
  date_to          TIMESTAMPTZ,

  -- Aggregated balances discovered during reconciliation
  total_funded     NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_released   NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_refunded   NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_pending    NUMERIC(18,6) NOT NULL DEFAULT 0,

  -- Number of discrepancies surfaced
  discrepancy_count INTEGER     NOT NULL DEFAULT 0,

  -- Flexible payload for run details (filters, timing, etc.)
  report_metadata  JSONB       NOT NULL DEFAULT '{}',

  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_status
  ON reconciliation_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_contract
  ON reconciliation_reports (contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_date
  ON reconciliation_reports (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Reconciliation discrepancies
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discrepancy_type') THEN
    CREATE TYPE discrepancy_type AS ENUM (
      'amount_mismatch',
      'missing_blockchain_event',
      'missing_application_record',
      'duplicate_entry',
      'status_mismatch',
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discrepancy_severity') THEN
    CREATE TYPE discrepancy_severity AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        UUID        NOT NULL REFERENCES reconciliation_reports (id) ON DELETE CASCADE,

  contract_id      UUID,
  milestone_id     UUID,
  transaction_hash TEXT,

  discrepancy_type discrepancy_type NOT NULL,
  severity         discrepancy_severity NOT NULL DEFAULT 'medium',

  description      TEXT        NOT NULL,

  expected_amount  NUMERIC(18,6),
  actual_amount    NUMERIC(18,6),

  blockchain_data  JSONB,
  application_data JSONB,

  status           TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved')),

  resolved_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_report
  ON reconciliation_discrepancies (report_id);

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_status
  ON reconciliation_discrepancies (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_severity
  ON reconciliation_discrepancies (severity)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_contract
  ON reconciliation_discrepancies (contract_id)
  WHERE contract_id IS NOT NULL;
