import { sha256Hex } from '@/lib/auth/crypto'
import { sql } from '@/lib/db'
import {
  buildSecurityAlerts,
  parseUserAgent,
  type SecuritySession,
  type SecuritySessionsPayload,
  type SessionStatus,
} from '@/lib/auth/session-types'

/**
 * Server-side data access for the Account Security dashboard.
 *
 * Sessions are derived from the `auth_refresh_tokens` table, which stores one
 * row per issued refresh token. Because refresh tokens are rotated on every
 * use, a single logical login produces a *chain* of rows linked through
 * `replaced_by_jti`:
 *
 *   login row  ->  rotation row  ->  rotation row (tip)
 *
 * We collapse each chain back into one user-facing "session" whose identity is
 * the chain root (the original login). Rotation intermediates are never
 * surfaced, so the UI does not show a flood of "revoked" rows produced by
 * normal token rotation.
 *
 * Only non-sensitive columns are selected for the API response. `jti` and
 * `token_hash` are read internally for grouping but are never returned.
 */

export type RevokeSessionResult = 'revoked' | 'not_found' | 'not_revocable'

interface SessionRow {
  id: number | string
  jti: string
  user_agent: string | null
  ip_address: string | null
  created_at: string | Date
  last_used_at: string | Date | null
  expires_at: string | Date
  revoked_at: string | Date | null
  replaced_by_jti: string | null
}

/** Maximum number of raw token rows fetched per wallet. */
const MAX_SESSION_ROWS = 200

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function statusOf(tip: SessionRow, now: number): SessionStatus {
  if (tip.revoked_at) return 'revoked'
  const expiresAt = toIso(tip.expires_at)
  if (expiresAt === null || Date.parse(expiresAt) <= now) return 'expired'
  return 'active'
}

/**
 * Groups raw token rows into logical sessions. Exported for unit testing so
 * the chain-collapsing behaviour can be verified without a database.
 */
export function groupSessionRows(
  rows: SessionRow[],
  options: { currentJti?: string | null; now?: number } = {}
): SecuritySession[] {
  const now = options.now ?? Date.now()

  const byJti = new Map<string, SessionRow>()
  const replacedJtis = new Set<string>()
  const predecessorByJti = new Map<string, SessionRow>()

  for (const row of rows) {
    byJti.set(row.jti, row)
    if (row.replaced_by_jti) {
      replacedJtis.add(row.replaced_by_jti)
      predecessorByJti.set(row.replaced_by_jti, row)
    }
  }

  const rootOf = (row: SessionRow): SessionRow => {
    let current = row
    const seen = new Set<string>()
    while (predecessorByJti.has(current.jti) && !seen.has(current.jti)) {
      seen.add(current.jti)
      current = predecessorByJti.get(current.jti) as SessionRow
    }
    return current
  }

  let currentRootId: string | null = null
  if (options.currentJti && byJti.has(options.currentJti)) {
    currentRootId = String(rootOf(byJti.get(options.currentJti) as SessionRow).id)
  }

  // Roots are rows that were not produced by a rotation.
  const roots = rows.filter((row) => !replacedJtis.has(row.jti))

  const sessions: SecuritySession[] = roots.map((root) => {
    let tip = root
    const seen = new Set<string>()
    while (
      tip.replaced_by_jti &&
      byJti.has(tip.replaced_by_jti) &&
      !seen.has(tip.jti)
    ) {
      seen.add(tip.jti)
      tip = byJti.get(tip.replaced_by_jti) as SessionRow
    }

    const loginAt = toIso(root.created_at) ?? new Date(now).toISOString()
    const lastActiveAt =
      toIso(tip.last_used_at) ?? toIso(tip.created_at) ?? loginAt

    return {
      id: Number(root.id),
      status: statusOf(tip, now),
      current: currentRootId !== null && String(root.id) === currentRootId,
      device: parseUserAgent(tip.user_agent),
      ipAddress: tip.ip_address,
      loginAt,
      lastActiveAt,
      expiresAt: toIso(tip.expires_at) ?? loginAt,
      revokedAt: toIso(tip.revoked_at),
    }
  })

  return sessions.sort((a, b) => {
    const aTime = Date.parse(a.loginAt)
    const bTime = Date.parse(b.loginAt)
    return bTime - aTime
  })
}

async function fetchSessionRows(walletAddress: string): Promise<SessionRow[]> {
  const rows = await sql`
    SELECT
      id,
      jti,
      user_agent,
      ip_address,
      created_at,
      last_used_at,
      expires_at,
      revoked_at,
      replaced_by_jti
    FROM auth_refresh_tokens
    WHERE wallet_address = ${walletAddress}
    ORDER BY created_at DESC
    LIMIT ${MAX_SESSION_ROWS}
  `

  return rows as unknown as SessionRow[]
}

async function resolveCurrentJti(
  walletAddress: string,
  refreshToken: string | null
): Promise<string | null> {
  if (!refreshToken) return null

  const rows = await sql`
    SELECT jti
    FROM auth_refresh_tokens
    WHERE wallet_address = ${walletAddress}
      AND token_hash = ${sha256Hex(refreshToken)}
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `

  return (rows as unknown as { jti: string }[])[0]?.jti ?? null
}

/**
 * Returns every logical session for the wallet (active, revoked and expired)
 * together with derived security alerts.
 */
export async function listSecuritySessions(
  walletAddress: string,
  refreshToken: string | null = null
): Promise<SecuritySessionsPayload> {
  const [rows, currentJti] = await Promise.all([
    fetchSessionRows(walletAddress),
    resolveCurrentJti(walletAddress, refreshToken),
  ])

  const sessions = groupSessionRows(rows, { currentJti })
  const alerts = buildSecurityAlerts(sessions)

  return { sessions, alerts }
}

/**
 * Revokes a single session scoped to the authenticated wallet.
 *
 * Only the *tip* of an active chain can be revoked: rotation intermediates are
 * already invalid and expired sessions are no-ops. The `wallet_address` guard
 * prevents a user from revoking another wallet's session (IDOR).
 */
export async function revokeWalletSession(
  walletAddress: string,
  sessionId: number
): Promise<RevokeSessionResult> {
  const owned = await sql`
    SELECT id
    FROM auth_refresh_tokens
    WHERE id = ${sessionId}
      AND wallet_address = ${walletAddress}
    LIMIT 1
  `

  if ((owned as unknown as unknown[]).length === 0) {
    return 'not_found'
  }

  const revoked = await sql`
    UPDATE auth_refresh_tokens
    SET revoked_at = NOW()
    WHERE id = ${sessionId}
      AND wallet_address = ${walletAddress}
      AND revoked_at IS NULL
      AND replaced_by_jti IS NULL
      AND expires_at > NOW()
    RETURNING id
  `

  return (revoked as unknown as unknown[]).length > 0 ? 'revoked' : 'not_revocable'
}
