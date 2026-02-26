-- Auth tables for wallet nonce verification and refresh-token sessions

CREATE TABLE IF NOT EXISTS auth_nonces (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(56) NOT NULL,
  nonce_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet_created
  ON auth_nonces (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_active
  ON auth_nonces (wallet_address, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(56) NOT NULL,
  jti VARCHAR(128) UNIQUE NOT NULL,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_jti VARCHAR(128),
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_wallet
  ON auth_refresh_tokens (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_active
  ON auth_refresh_tokens (wallet_address, expires_at)
  WHERE revoked_at IS NULL;
