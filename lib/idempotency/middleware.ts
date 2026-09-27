/**
 * Idempotency Layer — Route Middleware
 *
 * `withIdempotency` wraps a payment route handler and enforces the idempotency
 * contract:
 *
 *   1. Parse + validate the JSON body.
 *   2. Require a valid idempotency key (header or body field).
 *   3. Claim the `(key, operation)` pair atomically.
 *   4. Execute the wrapped handler only if the claim succeeded.
 *   5. Persist a successful response and replay it for repeat requests.
 *
 * Compose it *inside* the auth / RBAC wrappers so unauthenticated requests are
 * rejected before a key is ever claimed:
 *
 *   export const POST = withRbac('escrow:fund', withIdempotency('escrow_fund', handler))
 */

import { NextRequest, NextResponse } from 'next/server'

import { IDEMPOTENCY_REPLAYED_HEADER } from './config'
import { IdempotencyError } from './errors'
import { idempotencyService } from './service'
import { extractIdempotencyKey, validateIdempotencyKey } from './validation'
import type { IdempotencyOperationType, IdempotentResponse } from './types'

export type IdempotentRouteHandler<C> = (
  request: NextRequest,
  auth: C,
  body: Record<string, unknown>
) => Promise<NextResponse>

function errorResponse(err: unknown): NextResponse {
  if (err instanceof IdempotencyError) {
    const headers: Record<string, string> = {}
    if (err.code === 'IDEMPOTENCY_IN_PROGRESS') {
      headers['Retry-After'] = '1'
    }
    return NextResponse.json(
      { error: err.message, code: err.code, ...(err.details ?? {}) },
      { status: err.status, headers }
    )
  }

  console.error('[idempotency] Unexpected error:', err)
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}

export function withIdempotency<C>(
  operationType: IdempotencyOperationType,
  handler: IdempotentRouteHandler<C>
): (request: NextRequest, auth: C) => Promise<NextResponse> {
  return async (request: NextRequest, auth: C): Promise<NextResponse> => {
    // --- Parse body (clone so the wrapped handler can still read it) ---
    let body: Record<string, unknown>
    try {
      const parsed = await request.clone().json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'Request body must be a JSON object', code: 'INVALID_JSON' },
          { status: 400 }
        )
      }
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    // --- Validate key presence / format before any work happens ---
    let key: string
    try {
      key = validateIdempotencyKey(extractIdempotencyKey(request, body))
    } catch (err) {
      return errorResponse(err)
    }

    try {
      const outcome = await idempotencyService.run({
        key,
        operationType,
        requestPayload: body,
        handler: async (): Promise<IdempotentResponse> => {
          const response = await handler(request, auth, body)
          let responseBody: Record<string, unknown> = {}
          try {
            const parsed = await response.clone().json()
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              responseBody = parsed as Record<string, unknown>
            }
          } catch {
            responseBody = {}
          }
          return { status: response.status, body: responseBody }
        },
      })

      return NextResponse.json(outcome.body, {
        status: outcome.status,
        headers: {
          [IDEMPOTENCY_REPLAYED_HEADER]: String(outcome.replayed),
        },
      })
    } catch (err) {
      return errorResponse(err)
    }
  }
}
