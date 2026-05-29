import { NextRequest, NextResponse } from 'next/server'
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/lib/auth/constants'
import { sha256Hex } from '@/lib/auth/crypto'
import { signSessionToken, verifySessionToken } from '@/lib/auth/jwt'
import {
  revokeRefreshToken,
  rotateRefreshToken,
  storeRefreshToken,
} from '@/lib/auth/store'
import { normalizeWalletAddress } from '@/lib/auth/stellar'

export interface AuthSession {
  walletAddress: string
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt: Date
  refreshJti: string
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 chars long')
  }

  return secret
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null
  }

  return request.headers.get('x-real-ip')
}

function buildSessionTokens(
  walletAddress: string,
  secret: string
): Omit<AuthSession, 'walletAddress'> {
  const access = signSessionToken({
    subject: walletAddress,
    walletAddress,
    type: 'access',
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    secret,
  })
  const refresh = signSessionToken({
    subject: walletAddress,
    walletAddress,
    type: 'refresh',
    expiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
    secret,
  })

  const accessTokenExpiresAt = new Date(access.payload.exp * 1000)
  const refreshTokenExpiresAt = new Date(refresh.payload.exp * 1000)

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    refreshJti: refresh.payload.jti,
  }
}

export async function createSession(
  request: NextRequest,
  walletAddress: string
): Promise<AuthSession> {
  const normalizedWallet = normalizeWalletAddress(walletAddress)
  const secret = getJwtSecret()

  const tokens = buildSessionTokens(normalizedWallet, secret)

  await storeRefreshToken({
    walletAddress: normalizedWallet,
    jti: tokens.refreshJti,
    tokenHash: sha256Hex(tokens.refreshToken),
    expiresAt: tokens.refreshTokenExpiresAt,
    userAgent: request.headers.get('user-agent'),
    ipAddress: getClientIp(request),
  })

  return {
    walletAddress: normalizedWallet,
    ...tokens,
  }
}

export async function rotateSession(
  request: NextRequest,
  refreshToken: string
): Promise<AuthSession | null> {
  const secret = getJwtSecret()
  const payload = verifySessionToken(refreshToken, secret)
  if (!payload || payload.type !== 'refresh') {
    return null
  }

  const normalizedWallet = normalizeWalletAddress(payload.wallet)
  const nextTokens = buildSessionTokens(normalizedWallet, secret)

  const rotated = await rotateRefreshToken({
    walletAddress: normalizedWallet,
    currentJti: payload.jti,
    currentTokenHash: sha256Hex(refreshToken),
    newJti: nextTokens.refreshJti,
    newTokenHash: sha256Hex(nextTokens.refreshToken),
    newExpiresAt: nextTokens.refreshTokenExpiresAt,
    userAgent: request.headers.get('user-agent'),
    ipAddress: getClientIp(request),
  })
  if (!rotated) {
    return null
  }

  return {
    walletAddress: normalizedWallet,
    ...nextTokens,
  }
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const secret = getJwtSecret()
  const payload = verifySessionToken(refreshToken, secret)
  if (!payload || payload.type !== 'refresh') {
    return
  }

  await revokeRefreshToken({ jti: payload.jti })
}

export function readAccessToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  return request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export function readRefreshToken(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}

export function verifyAccessToken(token: string): {
  walletAddress: string
  jti: string
} | null {
  const secret = getJwtSecret()
  const payload = verifySessionToken(token, secret)
  if (!payload || payload.type !== 'access') {
    return null
  }

  return {
    walletAddress: payload.wallet,
    jti: payload.jti,
  }
}

export function setSessionCookies(
  response: NextResponse,
  session: AuthSession
): void {
  const secure = process.env.NODE_ENV === 'production'

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: session.accessToken,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: session.accessTokenExpiresAt,
  })

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE,
    value: session.refreshToken,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: session.refreshTokenExpiresAt,
  })
}

export function clearSessionCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === 'production'

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
