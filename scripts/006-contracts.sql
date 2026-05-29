-- Deployed Soroban contracts
-- Each job may have at most one active contract (enforced by UNIQUE constraint).
CREATE TABLE IF NOT EXISTS contracts (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER     NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id           INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  freelancer_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Human-readable terms (canonical immutable record lives on-chain / IPFS)
  terms               TEXT,

  -- Financials (= sum of milestone amounts)
  total_amount        DECIMAL(18, 6) NOT NULL,
  currency            VARCHAR(10)  NOT NULL DEFAULT 'XLM',

  -- Soroban on-chain references
  contract_address    VARCHAR(255),           -- deployed Soroban contract address
  contract_tx_hash    VARCHAR(64),            -- deployment transaction hash
  network_passphrase  TEXT,                   -- Stellar network identifier

  -- Lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','paused','completed','cancelled','disputed')),

  created_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,

  -- Enforce one active contract per job
  CONSTRAINT uq_contracts_job UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_contracts_job        ON contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client     ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer ON contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status     ON contracts(status);

-- Milestones linked to a contract
-- Extends the existing milestones table with a contract_id column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'milestones' AND column_name = 'contract_id'
  ) THEN
    ALTER TABLE milestones ADD COLUMN contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_milestones_contract ON milestones(contract_id);
  END IF;
END;
$$;
