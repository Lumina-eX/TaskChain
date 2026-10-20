-- 011_session_history_index.sql
--
-- The Account Security dashboard lists a wallet's sessions (active, revoked
-- and expired) ordered by creation time so it can also present login history.
-- The existing index only covers *active* tokens (WHERE revoked_at IS NULL),
-- so add a full per-wallet index to keep the history query indexed for
-- accounts with many rotated / revoked tokens.

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_wallet_created_at
  ON auth_refresh_tokens (wallet_address, created_at DESC);
