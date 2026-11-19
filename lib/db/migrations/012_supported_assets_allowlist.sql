-- Migration 012: Supported assets allowlist for escrow funding
--
-- Stores the explicit set of Stellar token contract addresses that the
-- platform accepts for escrow creation and funding. Every change is recorded
-- in supported_assets_audit_log with timestamp and actor information.

CREATE TABLE IF NOT EXISTS supported_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network         TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet', 'futurenet', 'standalone')),
  code            TEXT NOT NULL CHECK (char_length(code) BETWEEN 1 AND 12 AND code ~ '^[A-Za-z0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^C[A-Z2-7]{55}$'),
  decimals        SMALLINT NOT NULL CHECK (decimals BETWEEN 0 AND 18),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network, contract_address),
  UNIQUE (network, code)
);

CREATE INDEX IF NOT EXISTS idx_supported_assets_network_enabled
  ON supported_assets (network, enabled);

CREATE TABLE IF NOT EXISTS supported_assets_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID REFERENCES supported_assets(id) ON DELETE SET NULL,
  network         TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('create', 'enable', 'disable', 'update', 'remove')),
  actor           TEXT NOT NULL,
  previous_state  JSONB,
  new_state       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supported_assets_audit_created
  ON supported_assets_audit_log (created_at DESC);

-- Prevent mutation or deletion of audit records.
CREATE OR REPLACE FUNCTION supported_assets_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'supported_assets_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supported_assets_audit_no_update ON supported_assets_audit_log;
CREATE TRIGGER trg_supported_assets_audit_no_update
  BEFORE UPDATE OR DELETE ON supported_assets_audit_log
  FOR EACH ROW EXECUTE FUNCTION supported_assets_audit_immutable();
