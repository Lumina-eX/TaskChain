/**
 * Client-safe session types and pure helpers for the Account Security
 * dashboard.
 *
 * This module deliberately contains **no server-only imports** (no `@/lib/db`,
 * no Node built-ins) so it can be shared by API routes, the dashboard client
 * component, and unit tests.
 *
 * Sensitive token material (`jti`, `token_hash`, raw wallet address) is never
 * represented here; only the human-readable fields a user is allowed to see.
 */

export type SessionStatus = 'active' | 'revoked' | 'expired'

export type SessionDeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown'

export interface SessionDevice {
  /** Browser name, e.g. "Chrome". */
  browser: string
  /** Operating system, e.g. "Windows". */
  os: string
  /** Coarse device class derived from the user agent. */
  type: SessionDeviceType
  /** Human-readable summary, e.g. "Chrome on Windows". */
  label: string
}

export interface SecuritySession {
  /** Opaque, non-sensitive database identifier used to revoke the session. */
  id: number
  status: SessionStatus
  /** True for the session that issued the current browser request. */
  current: boolean
  /** Device that most recently used the session. */
  device: SessionDevice
  /** IP address of the most recent request (may be null). */
  ipAddress: string | null
  /** When this session was first created (i.e. the login event). */
  loginAt: string
  /** When the session was last used (falls back to login time). */
  lastActiveAt: string
  /** When the refresh token expires. */
  expiresAt: string
  /** When the session was explicitly revoked, if applicable. */
  revokedAt: string | null
}

export type SecurityAlertSeverity = 'info' | 'warning' | 'critical'

export interface SecurityAlert {
  id: string
  severity: SecurityAlertSeverity
  title: string
  message: string
}

export interface SecuritySessionsPayload {
  sessions: SecuritySession[]
  alerts: SecurityAlert[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge'
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera'
  if (/chrome\/crios/i.test(ua)) return 'Chrome'
  if (/chrome\//i.test(ua)) return 'Chrome'
  if (/firefox\/|fxios/i.test(ua)) return 'Firefox'
  if (/safari\//i.test(ua)) return 'Safari'
  return 'Unknown browser'
}

function detectOs(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/android/i.test(ua)) return 'Android'
  if (/mac os x|macintosh/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Unknown OS'
}

function detectDeviceType(ua: string): SessionDeviceType {
  if (/ipad|tablet/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile'
  if (/android/i.test(ua)) return 'tablet'
  if (/windows|mac os x|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'unknown'
}

/**
 * Best-effort, dependency-free user-agent parser. Returns a safe
 * "Unknown device" descriptor when the user agent is missing or unparseable
 * (never throws).
 */
export function parseUserAgent(userAgent: string | null | undefined): SessionDevice {
  const ua = (userAgent ?? '').trim()
  if (!ua) {
    return {
      browser: 'Unknown browser',
      os: 'Unknown OS',
      type: 'unknown',
      label: 'Unknown device',
    }
  }

  const browser = detectBrowser(ua)
  const os = detectOs(ua)
  const type = detectDeviceType(ua)

  return {
    browser,
    os,
    type,
    label: `${browser} on ${os}`,
  }
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * Derives non-blocking security warnings from the user's session list.
 *
 * Heuristics (all purely local, no external geo/IP intelligence):
 * - recent sign-ins from devices other than this one
 * - active sessions observed from an IP different to the current device
 * - active sessions spread across more than one network
 * - a session revoked within the last week (possible compromise follow-up)
 */
export function buildSecurityAlerts(
  sessions: SecuritySession[],
  options: { now?: number } = {}
): SecurityAlert[] {
  const now = options.now ?? Date.now()
  const alerts: SecurityAlert[] = []

  const current = sessions.find((session) => session.current) ?? null
  const active = sessions.filter((session) => session.status === 'active')
  const otherActive = active.filter((session) => session.id !== current?.id)

  const recentSignIns = otherActive.filter((session) => {
    const created = parseTime(session.loginAt)
    return created !== null && now - created <= 2 * DAY_MS
  })

  if (recentSignIns.length > 0) {
    alerts.push({
      id: 'recent-sign-in',
      severity: 'warning',
      title: 'New sign-in detected',
      message:
        recentSignIns.length === 1
          ? 'A session was started in the last 48 hours. If this was not you, revoke it immediately.'
          : `${recentSignIns.length} sessions were started in the last 48 hours. If any of these were not you, revoke them immediately.`,
    })
  }

  const unfamiliar = current?.ipAddress
    ? otherActive.filter(
        (session) =>
          session.ipAddress !== null && session.ipAddress !== current.ipAddress
      )
    : []

  if (unfamiliar.length > 0) {
    alerts.push({
      id: 'unfamiliar-network',
      severity: 'critical',
      title: 'Unfamiliar network activity',
      message:
        'An active session is connected from a different network than this device. Review and revoke any session you do not recognise.',
    })
  } else {
    const distinctIps = new Set(
      active.map((session) => session.ipAddress).filter((ip): ip is string => !!ip)
    )
    if (distinctIps.size > 1) {
      alerts.push({
        id: 'multiple-networks',
        severity: 'warning',
        title: 'Sessions from multiple networks',
        message:
          'Your active sessions originate from more than one network. Confirm that every device listed below belongs to you.',
      })
    }
  }

  const recentlyRevoked = sessions.filter((session) => {
    const revoked = parseTime(session.revokedAt)
    return revoked !== null && now - revoked <= 7 * DAY_MS
  })

  if (recentlyRevoked.length > 0) {
    alerts.push({
      id: 'recent-revocation',
      severity: 'info',
      title: 'A session was revoked recently',
      message:
        'A session was revoked in the last 7 days. If you did not perform this action, review your remaining sessions and sign out of any you do not recognise.',
    })
  }

  return alerts
}
