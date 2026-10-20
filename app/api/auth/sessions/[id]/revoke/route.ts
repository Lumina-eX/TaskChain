export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuthCtx } from '@/lib/auth/middleware'
import { revokeWalletSession } from '@/lib/auth/sessions'
import { enforceRateLimit, buildRateLimitKey } from '@/lib/security/rateLimit'

/**
 * POST /api/auth/sessions/[id]/revoke
 *
 * Revokes a single session belonging to the authenticated wallet. The client
 * must only reflect the revocation in the UI after a 2xx response.
 *
 * Error codes:
 * - 400 INVALID_SESSION_ID   – non-numeric / non-positive id
 * - 404 SESSION_NOT_FOUND    – id does not belong to this wallet
 * - 409 SESSION_NOT_REVOCABLE – already revoked/expired or a rotation record
 * - 429 RATE_LIMITED
 * - 500 SESSION_REVOKE_FAILED
 */
export const POST = withAuthCtx<{ params: Promise<{ id: string }> }>(
  async (request: NextRequest, auth, context) => {
    try {
      const { id } = await context.params
      const sessionId = Number(id)
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return NextResponse.json(
          { error: 'Session id must be a positive integer.', code: 'INVALID_SESSION_ID' },
          { status: 400 }
        )
      }

      const limited = await enforceRateLimit(request, {
        key: buildRateLimitKey(
          request,
          'auth:sessions:revoke',
          auth.walletAddress
        ),
        limit: 20,
        windowMs: 60_000,
      })
      if (limited) return limited

      const result = await revokeWalletSession(auth.walletAddress, sessionId)

      if (result === 'not_found') {
        return NextResponse.json(
          { error: 'Session not found.', code: 'SESSION_NOT_FOUND' },
          { status: 404 }
        )
      }

      if (result === 'not_revocable') {
        return NextResponse.json(
          {
            error: 'This session is no longer active and cannot be revoked.',
            code: 'SESSION_NOT_REVOCABLE',
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { data: { id: sessionId, status: 'revoked' } },
        { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
      )
    } catch (err) {
      console.error('[POST /api/auth/sessions/[id]/revoke]', err)
      return NextResponse.json(
        { error: 'Failed to revoke session', code: 'SESSION_REVOKE_FAILED' },
        { status: 500 }
      )
    }
  }
)
