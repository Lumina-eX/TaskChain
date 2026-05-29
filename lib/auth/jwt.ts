import { createHmac } from 'crypto'
import { encodeBase64Url, fromBase64Url, randomId, safeEqual } from '@/lib/auth/crypto'

type TokenType = 'access' | 'refresh'

interface JwtHeader {
  alg: 'HS256'
  typ: 'JWT'
}

export interface SessionTokenPayload {
  sub: string
  wallet: string
  jti: string
  type: TokenType
  iat: number
  exp: number
}

function createSignature(input: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(input).digest()
  return encodeBase64Url(digest)
}

export function signSessionToken({
  subject,
  walletAddress,
  type,
  expiresInSeconds,
  secret,
}: {
  subject: string
  walletAddress: string
  type: TokenType
  expiresInSeconds: number
  secret: string
}): { token: string; payload: SessionTokenPayload } {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionTokenPayload = {
    sub: subject,
    wallet: walletAddress,
    jti: randomId(),
    type,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const header: JwtHeader = {
    alg: 'HS256',
    typ: 'JWT',
  }

  const encodedHeader = encodeBase64Url(JSON.stringify(header))
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createSignature(signingInput, secret)

  return {
    token: `${signingInput}.${signature}`,
    payload,
  }
}

function parseJson<T>(input: Buffer): T | null {
  try {
    const parsed: unknown = JSON.parse(input.toString('utf8'))
    return parsed as T
  } catch {
    return null
  }
}

function isSessionPayload(value: unknown): value is SessionTokenPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Record<string, unknown>
  return (
    typeof payload.sub === 'string' &&
    typeof payload.wallet === 'string' &&
    typeof payload.jti === 'string' &&
    (payload.type === 'access' || payload.type === 'refresh') &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  )
}

export function verifySessionToken(
  token: string,
  secret: string
): SessionTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [encodedHeader, encodedPayload, signature] = parts
  if (!encodedHeader || !encodedPayload || !signature) {
    return null
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = createSignature(signingInput, secret)
  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  const header = parseJson<JwtHeader>(fromBase64Url(encodedHeader))
  if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') {
    return null
  }

  const payload = parseJson<SessionTokenPayload>(fromBase64Url(encodedPayload))
  if (!payload || !isSessionPayload(payload)) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) {
    return null
  }

  return payload
}
