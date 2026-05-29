-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS
CREATE TYPE user_role AS ENUM ('freelancer', 'client', 'admin');

CREATE TYPE project_status AS ENUM (
  'draft', 'open', 'in_progress', 'completed', 'cancelled', 'disputed'
);

CREATE TYPE milestone_status AS ENUM (
  'pending', 'in_progress', 'submitted', 'approved', 'rejected', 'paid'
);

CREATE TYPE contract_status AS ENUM (
  'pending', 'active', 'paused', 'completed', 'cancelled', 'disputed'
);

CREATE TYPE escrow_status AS ENUM (
  'unfunded', 'funded', 'partially_released', 'fully_released', 'refunded'
);

CREATE TYPE dispute_status AS ENUM (
  'open', 'under_review', 'resolved_client', 'resolved_freelancer',
  'resolved_split', 'withdrawn', 'escalated'
);

CREATE TYPE dispute_raised_by AS ENUM ('client', 'freelancer', 'admin');

-- USERS
CREATE TABLE users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role             user_role   NOT NULL DEFAULT 'freelancer',

  -- Auth
  email            TEXT        NOT NULL UNIQUE,
  password_hash    TEXT,                          -- null if wallet-only auth
  email_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at    TIMESTAMPTZ,

  -- Wallet
  wallet_address   TEXT        UNIQUE,           -- Ethereum / EVM address
  wallet_chain_id  INTEGER,                      -- e.g. 1 = Ethereum, 137 = Polygon

  -- Profile
  username         TEXT        UNIQUE NOT NULL,
  display_name     TEXT,
  avatar_url       TEXT,
  bio              TEXT,
  skills           TEXT[]      DEFAULT '{}',     -- tag array for freelancers
  hourly_rate      NUMERIC(12,2),                -- optional, freelancers only
  timezone         TEXT        DEFAULT 'UTC',
  country_code     CHAR(2),

  -- Reputation (denormalised for dashboard speed; recomputed by background job)
  avg_rating       NUMERIC(3,2) DEFAULT 0.00,
  total_reviews    INTEGER      DEFAULT 0,
  completed_jobs   INTEGER      DEFAULT 0,

  -- Soft-delete / status
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  is_banned        BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet auth lookups (most frequent read path)
CREATE INDEX idx_users_wallet_address  ON users (wallet_address)
  WHERE wallet_address IS NOT NULL;

-- Email login / verification lookups
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Dashboard filtering (active freelancers by skill)
CREATE INDEX idx_users_skills ON users USING GIN (skills);

-- Role filtering for admin views
CREATE INDEX idx_users_role ON users (role);

-- PROJECTS
CREATE TABLE projects (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  category         TEXT,
  tags             TEXT[]      DEFAULT '{}',

  -- Budget
  budget_min       NUMERIC(18,6),               -- in token units (e.g. USDC)
  budget_max       NUMERIC(18,6),
  currency         TEXT        NOT NULL DEFAULT 'USDC',

  -- Timeline
  deadline         TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,

  status           project_status NOT NULL DEFAULT 'draft',

  -- On-chain reference (optional, populated when project is anchored)
  chain_id         INTEGER,
  contract_address TEXT,
  tx_hash          TEXT,

  -- Visibility / access
  is_public        BOOLEAN     NOT NULL DEFAULT TRUE,
  max_applicants   INTEGER,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of all projects belonging to a client (dashboard)
CREATE INDEX idx_projects_client_id ON projects (client_id);

-- Status filtering (open projects marketplace)
CREATE INDEX idx_projects_status ON projects (status);

-- Composite: client + status for "my active projects" view
CREATE INDEX idx_projects_client_status ON projects (client_id, status);

-- Full-text search on title + description
CREATE INDEX idx_projects_fts ON projects
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Tag filtering (marketplace browse)
CREATE INDEX idx_projects_tags ON projects USING GIN (tags);

-- Partial: only open projects (heavy read path, small subset)
CREATE INDEX idx_projects_open ON projects (created_at DESC)
  WHERE status = 'open';

-- MILESTONES
CREATE TABLE milestones (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  contract_id      UUID,                         -- FK added after contracts table

  -- Content
  title            TEXT        NOT NULL,
  description      TEXT,
  sort_order       SMALLINT    NOT NULL DEFAULT 0,  -- display ordering

  -- Financials
  amount           NUMERIC(18,6) NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'USDC',

  -- Timeline
  due_date         TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,

  status           milestone_status NOT NULL DEFAULT 'pending',

  -- On-chain escrow reference
  escrow_tx_hash   TEXT,
  release_tx_hash  TEXT,

  -- Deliverable evidence (URLs / IPFS CIDs stored as JSON array)
  deliverables     JSONB       DEFAULT '[]',

  -- Rejection reason (populated when status = 'rejected')
  rejection_reason TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast join from project to its milestones
CREATE INDEX idx_milestones_project_id ON milestones (project_id);

-- Ordered milestone list for a contract
CREATE INDEX idx_milestones_contract_id ON milestones (contract_id)
  WHERE contract_id IS NOT NULL;

-- Composite: project + status (e.g. count pending milestones for progress bar)
CREATE INDEX idx_milestones_project_status ON milestones (project_id, status);

-- Due-date sweep for reminder notifications
CREATE INDEX idx_milestones_due_date ON milestones (due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('approved', 'paid');

-- CONTRACTS
CREATE TABLE contracts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  client_id        UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  freelancer_id    UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- Terms (human-readable; canonical on-chain terms in terms_ipfs_cid)
  terms            TEXT,
  terms_ipfs_cid   TEXT,                         -- IPFS CID for immutable record
  agreed_at        TIMESTAMPTZ,                   -- when freelancer accepted

  -- Total value (= sum of all milestone amounts)
  total_amount     NUMERIC(18,6) NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'USDC',

  -- Escrow
  escrow_address   TEXT,                         -- smart-contract escrow wallet
  escrow_status    escrow_status NOT NULL DEFAULT 'unfunded',
  funded_at        TIMESTAMPTZ,
  funding_tx_hash  TEXT,

  -- Contract lifecycle
  status           contract_status NOT NULL DEFAULT 'pending',
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- On-chain reference
  chain_id         INTEGER,
  contract_tx_hash TEXT,

  -- Dispute FK added after disputes table
  active_dispute_id UUID,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A project may only have one active contract at a time
  CONSTRAINT uq_project_active_contract UNIQUE (project_id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Back-reference milestone → contract now that contracts table exists
ALTER TABLE milestones
  ADD CONSTRAINT fk_milestones_contract
  FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL;

-- Fast lookup for freelancer dashboard
CREATE INDEX idx_contracts_freelancer_id ON contracts (freelancer_id);

-- Fast lookup for client dashboard
CREATE INDEX idx_contracts_client_id ON contracts (client_id);

-- Join from project to its contract
CREATE INDEX idx_contracts_project_id ON contracts (project_id);

-- Composite: freelancer + status for "my active contracts"
CREATE INDEX idx_contracts_freelancer_status ON contracts (freelancer_id, status);

-- Composite: client + status
CREATE INDEX idx_contracts_client_status ON contracts (client_id, status);

-- Partial: only active contracts (most-read subset)
CREATE INDEX idx_contracts_active ON contracts (updated_at DESC)
  WHERE status = 'active';

-- Partial: completed contracts for historical queries / pagination
CREATE INDEX idx_contracts_completed ON contracts (completed_at DESC)
  WHERE status = 'completed';

-- Escrow monitoring (funded but not yet released)
CREATE INDEX idx_contracts_escrow_funded ON contracts (funded_at)
  WHERE escrow_status = 'funded';

-- DISPUTES
CREATE TABLE disputes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID        NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  milestone_id     UUID        REFERENCES milestones (id) ON DELETE SET NULL,

  raised_by        dispute_raised_by NOT NULL,
  raised_by_user_id UUID       NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- Claim
  reason           TEXT        NOT NULL,
  desired_outcome  TEXT,

  -- Evidence (array of {type, url/cid, label} objects)
  evidence         JSONB       DEFAULT '[]',

  -- Resolution
  status           dispute_status NOT NULL DEFAULT 'open',
  resolver_id      UUID        REFERENCES users (id) ON DELETE SET NULL, -- admin
  resolution_notes TEXT,
  resolved_at      TIMESTAMPTZ,

  -- Split amounts (populated for resolved_split outcome)
  client_refund_amount     NUMERIC(18,6),
  freelancer_payout_amount NUMERIC(18,6),

  -- Deadline for arbitration response
  response_deadline TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wire back the active_dispute_id FK on contracts
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_active_dispute
  FOREIGN KEY (active_dispute_id) REFERENCES disputes (id) ON DELETE SET NULL;

-- All disputes on a contract
CREATE INDEX idx_disputes_contract_id ON disputes (contract_id);

-- Specific milestone dispute
CREATE INDEX idx_disputes_milestone_id ON disputes (milestone_id)
  WHERE milestone_id IS NOT NULL;

-- Admin queue: open disputes, oldest first
CREATE INDEX idx_disputes_open ON disputes (created_at ASC)
  WHERE status = 'open';

-- Disputes raised by a specific user
CREATE INDEX idx_disputes_raised_by_user ON disputes (raised_by_user_id, status);

-- Disputes assigned to a resolver (admin workload)
CREATE INDEX idx_disputes_resolver ON disputes (resolver_id)
  WHERE resolver_id IS NOT NULL AND status NOT IN ('resolved_client',
    'resolved_freelancer', 'resolved_split', 'withdrawn');

-- OPTIONAL EXTENSION TABLES (future-ready stubs)

-- ADMIN AUDIT LOGS
CREATE TABLE admin_audit_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action           TEXT        NOT NULL,                          -- e.g. 'FREEZE_CONTRACT', 'BAN_USER', 'VIEW_DISPUTES'
  target_type      TEXT,                                        -- e.g. 'contract', 'user', 'dispute'
  target_id        UUID,                                        -- ID of the target record
  details          JSONB       NOT NULL DEFAULT '{}',           -- additional context
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_logs_admin_user ON admin_audit_logs (admin_user_id);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs (action);
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC);

-- OPTIONAL EXTENSION TABLES (future-ready stubs)

-- Ratings & Reviews
CREATE TABLE reviews (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  reviewer_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewee_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating         SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           TEXT,
  is_public      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_review_per_contract UNIQUE (contract_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewee_id ON reviews (reviewee_id);
CREATE INDEX idx_reviews_contract_id ON reviews (contract_id);

-- Notifications (fan-out table; supports pagination)
CREATE TABLE notifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type           TEXT        NOT NULL,          -- e.g. 'milestone_approved'
  payload        JSONB       NOT NULL DEFAULT '{}',
  is_read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, created_at DESC)
  WHERE is_read = FALSE;


-- UPDATED_AT TRIGGER (apply to all audited tables)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','projects','milestones','contracts','disputes','reviews'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
