import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: Date
}

const memoryStore = new Map<string, { windowId: number; count: number }>()

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return request.headers.get('x-real-ip') || 'unknown'
}

export function buildRateLimitKey(
  request: NextRequest,
  namespace: string,
  extra?: string
): string {
  const ip = getClientIp(request)
  const path = request.nextUrl.pathname
  const method = request.method.toUpperCase()
  const suffix = extra ? `:${extra}` : ''
  return `${namespace}:${method}:${path}:${ip}${suffix}`
}

async function checkRateLimitDb({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const windowId = Math.floor(now / windowMs)
  const resetAt = new Date((windowId + 1) * windowMs)

  const rows = await sql<{ count: number; window_id: string | number }[]>`
    INSERT INTO api_rate_limits (key, window_id, count, updated_at)
    VALUES (${key}, ${windowId}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
      SET window_id = EXCLUDED.window_id,
          count = CASE
            WHEN api_rate_limits.window_id = EXCLUDED.window_id
            THEN api_rate_limits.count + 1
            ELSE 1
          END,
          updated_at = NOW()
    RETURNING count, window_id
  `

  const row = rows[0]
  const count = row ? Number(row.count) : 1
  const remaining = Math.max(0, limit - count)

  return {
    allowed: count <= limit,
    limit,
    remaining,
    resetAt,
  }
}

function checkRateLimitMemory({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const windowId = Math.floor(now / windowMs)
  const resetAt = new Date((windowId + 1) * windowMs)

  const existing = memoryStore.get(key)
  const count =
    existing && existing.windowId === windowId ? existing.count + 1 : 1

  memoryStore.set(key, { windowId, count })

  const remaining = Math.max(0, limit - count)
  return {
    allowed: count <= limit,
    limit,
    remaining,
    resetAt,
  }
}

export async function enforceRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  let result: RateLimitResult

  try {
    result = await checkRateLimitDb(options)
  } catch {
    result = checkRateLimitMemory(options)
  }

  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
  }

  if (result.allowed) {
    return null
  }

  headers['Retry-After'] = String(
    Math.max(0, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
  )

  return NextResponse.json(
    { error: 'Too many requests', code: 'RATE_LIMITED' },
    { status: 429, headers }
  )
}

