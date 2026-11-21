/**
 * Consistent HTTP mapping for dispute workflow errors.
 *
 * Every endpoint returns `{ error, code, ...details }`, matching the rest of
 * the API. Unknown errors are logged server-side and reported as a generic
 * 500 so internal details never leak to clients.
 */

import { NextResponse } from 'next/server'
import { DisputeError } from './types'

export function disputeErrorResponse(error: unknown): NextResponse {
  if (error instanceof DisputeError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ?? {}),
      },
      { status: error.status }
    )
  }

  console.error('[disputes] Unexpected error:', error)
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}

export function invalidIdResponse(kind: string): NextResponse {
  return NextResponse.json(
    { error: `Invalid ${kind} id`, code: 'INVALID_ID' },
    { status: 400 }
  )
}

export function invalidJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
    { status: 400 }
  )
}
