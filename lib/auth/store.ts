import { sql } from '@/lib/db'

export async function saveNonce({
  walletAddress,
  nonceHash,
  expiresAt,
}: {
  walletAddress: string
  nonceHash: string
  expiresAt: Date
}): Promise<void> {
  await sql`
    INSERT INTO auth_nonces (wallet_address, nonce_hash, expires_at)
    VALUES (${walletAddress}, ${nonceHash}, ${expiresAt.toISOString()})
  `
}

export async function hasActiveNonce({
  walletAddress,
  nonceHash,
}: {
  walletAddress: string
  nonceHash: string
}): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM auth_nonces
    WHERE wallet_address = ${walletAddress}
      AND nonce_hash = ${nonceHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `

  return rows.length > 0
}

export async function consumeNonce({
  walletAddress,
  nonceHash,
}: {
  walletAddress: string
  nonceHash: string
}): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    WITH target AS (
      SELECT id
      FROM auth_nonces
      WHERE wallet_address = ${walletAddress}
        AND nonce_hash = ${nonceHash}
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    )
    UPDATE auth_nonces
    SET used_at = NOW()
    WHERE id IN (SELECT id FROM target)
    RETURNING id
  `

  return rows.length > 0
}

export async function storeRefreshToken({
  walletAddress,
  jti,
  tokenHash,
  expiresAt,
  userAgent,
  ipAddress,
}: {
  walletAddress: string
  jti: string
  tokenHash: string
  expiresAt: Date
  userAgent: string | null
  ipAddress: string | null
}): Promise<void> {
  await sql`
    INSERT INTO auth_refresh_tokens (
      wallet_address,
      jti,
      token_hash,
      expires_at,
      user_agent,
      ip_address
    )
    VALUES (
      ${walletAddress},
      ${jti},
      ${tokenHash},
      ${expiresAt.toISOString()},
      ${userAgent},
      ${ipAddress}
    )
  `
}

export async function revokeRefreshToken({
  jti,
  replacedByJti,
}: {
  jti: string
  replacedByJti?: string
}): Promise<void> {
  await sql`
    UPDATE auth_refresh_tokens
    SET revoked_at = NOW(),
        replaced_by_jti = COALESCE(${replacedByJti ?? null}, replaced_by_jti)
    WHERE jti = ${jti}
      AND revoked_at IS NULL
  `
}

export async function touchRefreshToken(jti: string): Promise<void> {
  await sql`
    UPDATE auth_refresh_tokens
    SET last_used_at = NOW()
    WHERE jti = ${jti}
  `
}

export async function findValidRefreshToken({
  walletAddress,
  jti,
  tokenHash,
}: {
  walletAddress: string
  jti: string
  tokenHash: string
}): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM auth_refresh_tokens
    WHERE wallet_address = ${walletAddress}
      AND jti = ${jti}
      AND token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `

  return rows.length > 0
}
