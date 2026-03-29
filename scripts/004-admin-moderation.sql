-- Admin Moderation Panel Schema
-- Adds admin role, ban/freeze fields, and audit logging

-- Extend user_type to include 'admin'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('client', 'freelancer', 'both', 'admin'));

-- Ban fields on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Freeze fields on jobs (separate from status so existing status is preserved)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            SERIAL PRIMARY KEY,
  admin_wallet  VARCHAR(56) NOT NULL,
  action        VARCHAR(50) NOT NULL,
  resource_type VARCHAR(30) NOT NULL,
  resource_id   INTEGER NOT NULL,
  details       JSONB,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin   ON admin_audit_log(admin_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON admin_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_banned       ON users(is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_jobs_frozen        ON jobs(is_frozen)  WHERE is_frozen = TRUE;
