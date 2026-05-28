-- Migration 003: Transaction fee tracking and gas analytics
-- Tracks Stellar/Soroban transaction fees for cost analysis and optimization.

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM: operation type for fee attribution
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE fee_operation_type AS ENUM (
    'contract_deploy',
    'milestone_fund',
    'milestone_release',
    'milestone_refund',
    'job_fund',
    'job_release',
    'job_refund',
    'dispute_resolution',
    'contract_freeze',
    'wasm_upload'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: transaction_fees
-- One row per on-chain transaction; captures actual fees paid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_fees (
  id                    BIGSERIAL       PRIMARY KEY,

  -- Link to existing tables (nullable — not every tx maps to a contract)
  contract_id           INTEGER         REFERENCES contracts (id) ON DELETE SET NULL,
  job_id                INTEGER         REFERENCES jobs (id) ON DELETE SET NULL,
  milestone_id          INTEGER         REFERENCES milestones (id) ON DELETE SET NULL,

  -- Stellar transaction identity
  stellar_tx_hash       TEXT            NOT NULL UNIQUE,
  operation_type        fee_operation_type NOT NULL,

  -- Fee breakdown (all values in stroops; 1 XLM = 10,000,000 stroops)
  base_fee_stroops      BIGINT          NOT NULL DEFAULT 0,   -- minimum network fee
  resource_fee_stroops  BIGINT          NOT NULL DEFAULT 0,   -- Soroban resource fee
  total_fee_stroops     BIGINT          NOT NULL DEFAULT 0,   -- base + resource
  total_fee_xlm         NUMERIC(20, 7)  NOT NULL DEFAULT 0,   -- human-readable XLM

  -- Soroban resource consumption (NULL for classic Stellar ops)
  cpu_instructions      BIGINT,         -- Soroban CPU instructions used
  memory_bytes          BIGINT,         -- Soroban memory bytes used
  ledger_reads          INTEGER,        -- number of ledger read entries
  ledger_writes         INTEGER,        -- number of ledger write entries
  read_bytes            BIGINT,         -- bytes read from ledger
  write_bytes           BIGINT,         -- bytes written to ledger
  events_size_bytes     BIGINT,         -- contract event data size
  transaction_size_bytes BIGINT,        -- total transaction envelope size

  -- Estimation vs actual (for accuracy tracking)
  estimated_fee_stroops BIGINT,         -- pre-submission estimate
  fee_accuracy_pct      NUMERIC(6, 2),  -- (actual / estimated) * 100

  -- Network context
  ledger_sequence       BIGINT,
  network_passphrase    TEXT,
  submitted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Optimization metadata
  optimization_applied  TEXT[],         -- e.g. ['footprint_trimmed', 'fee_bumped']
  savings_stroops       BIGINT          DEFAULT 0  -- stroops saved vs unoptimized baseline

);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: fee_estimates
-- Pre-submission simulation results; lets us compare estimate vs actual.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_estimates (
  id                    BIGSERIAL       PRIMARY KEY,
  contract_id           INTEGER         REFERENCES contracts (id) ON DELETE SET NULL,
  job_id                INTEGER         REFERENCES jobs (id) ON DELETE SET NULL,
  operation_type        fee_operation_type NOT NULL,

  -- Simulated resource limits
  estimated_cpu         BIGINT,
  estimated_memory      BIGINT,
  estimated_ledger_reads  INTEGER,
  estimated_ledger_writes INTEGER,
  estimated_read_bytes  BIGINT,
  estimated_write_bytes BIGINT,

  -- Fee estimate
  min_fee_stroops       BIGINT          NOT NULL DEFAULT 0,
  recommended_fee_stroops BIGINT        NOT NULL DEFAULT 0,
  max_fee_stroops       BIGINT          NOT NULL DEFAULT 0,

  -- Optimization suggestions
  optimization_hints    JSONB           DEFAULT '[]',

  -- Linked to actual tx once submitted
  actual_tx_fee_id      BIGINT          REFERENCES transaction_fees (id) ON DELETE SET NULL,

  estimated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  network_passphrase    TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: fee_analytics_snapshots
-- Hourly/daily aggregates for dashboard charts (avoids full-table scans).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_analytics_snapshots (
  id                    BIGSERIAL       PRIMARY KEY,
  snapshot_period       TEXT            NOT NULL,  -- 'hourly' | 'daily' | 'weekly'
  period_start          TIMESTAMPTZ     NOT NULL,
  operation_type        fee_operation_type,        -- NULL = all operations

  tx_count              INTEGER         NOT NULL DEFAULT 0,
  total_fees_stroops    BIGINT          NOT NULL DEFAULT 0,
  avg_fee_stroops       BIGINT          NOT NULL DEFAULT 0,
  min_fee_stroops       BIGINT          NOT NULL DEFAULT 0,
  max_fee_stroops       BIGINT          NOT NULL DEFAULT 0,
  p50_fee_stroops       BIGINT,
  p95_fee_stroops       BIGINT,

  total_cpu_instructions BIGINT,
  total_write_bytes     BIGINT,
  avg_write_bytes       BIGINT,

  total_savings_stroops BIGINT          NOT NULL DEFAULT 0,

  computed_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  UNIQUE (snapshot_period, period_start, operation_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Fast lookup by tx hash (idempotency checks in worker)
CREATE INDEX IF NOT EXISTS idx_tx_fees_stellar_hash
  ON transaction_fees (stellar_tx_hash);

-- Dashboard: fees by contract
CREATE INDEX IF NOT EXISTS idx_tx_fees_contract_id
  ON transaction_fees (contract_id)
  WHERE contract_id IS NOT NULL;

-- Dashboard: fees by job
CREATE INDEX IF NOT EXISTS idx_tx_fees_job_id
  ON transaction_fees (job_id)
  WHERE job_id IS NOT NULL;

-- Analytics: time-series queries
CREATE INDEX IF NOT EXISTS idx_tx_fees_submitted_at
  ON transaction_fees (submitted_at DESC);

-- Analytics: per-operation breakdown
CREATE INDEX IF NOT EXISTS idx_tx_fees_operation_type
  ON transaction_fees (operation_type, submitted_at DESC);

-- Estimates: pending linkage
CREATE INDEX IF NOT EXISTS idx_fee_estimates_unlinked
  ON fee_estimates (id)
  WHERE actual_tx_fee_id IS NULL;

-- Snapshots: time-range queries
CREATE INDEX IF NOT EXISTS idx_fee_snapshots_period
  ON fee_analytics_snapshots (snapshot_period, period_start DESC);
