-- Auth nonces: one-time challenges issued during wallet sign-in.
-- Each nonce is tied to a wallet address and expires after a short TTL.
CREATE TABLE IF NOT EXISTS auth_nonces (
  id             BIGSERIAL   PRIMARY KEY,
  wallet_address TEXT        NOT NULL,
  nonce_hash     TEXT        NOT NULL,           -- SHA-256 of the raw nonce
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,                    -- NULL = unused
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: wallet + hash + unused + not expired (hot path on every login)
CREATE INDEX IF NOT EXISTS idx_auth_nonces_lookup
  ON auth_nonces (wallet_address, nonce_hash)
  WHERE used_at IS NULL;

-- Cleanup sweep: find expired/used nonces for pruning
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires_at
  ON auth_nonces (expires_at);


-- Refresh tokens: long-lived tokens used to rotate access tokens.
-- Each row represents one issued refresh token; revoked_at is set on logout
-- or rotation so the old token can never be reused (token-family protection).
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id               BIGSERIAL   PRIMARY KEY,
  wallet_address   TEXT        NOT NULL,
  jti              TEXT        NOT NULL UNIQUE,  -- JWT ID claim
  token_hash       TEXT        NOT NULL,         -- SHA-256 of the raw token
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,                  -- NULL = still valid
  replaced_by_jti  TEXT,                         -- set on rotation
  last_used_at     TIMESTAMPTZ,
  user_agent       TEXT,
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: validate an incoming refresh token
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_jti
  ON auth_refresh_tokens (jti)
  WHERE revoked_at IS NULL;

-- Wallet-level token listing (e.g. "active sessions" page)
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_wallet
  ON auth_refresh_tokens (wallet_address)
  WHERE revoked_at IS NULL;

-- Cleanup sweep: find expired tokens for pruning
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires_at
  ON auth_refresh_tokens (expires_at);
