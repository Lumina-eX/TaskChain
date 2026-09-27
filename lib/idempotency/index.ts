/**
 * Idempotency Layer — Public API
 *
 * Usage (payment route):
 *   import { withIdempotency } from '@/lib/idempotency'
 *
 *   export const POST = withRbac(
 *     'escrow:fund',
 *     withIdempotency('escrow_fund', async (request, auth, body) => {
 *       // `auth` is the RBAC context, `body` is the parsed request body
 *       return NextResponse.json({ ... })
 *     })
 *   )
 */

export { IdempotencyService, idempotencyService } from './service'
export { withIdempotency } from './middleware'
export type { IdempotentRouteHandler } from './middleware'
export {
  IdempotencyRepository,
  idempotencyRepository,
} from './repository'

export {
  IdempotencyError,
  IdempotencyKeyRequiredError,
  IdempotencyKeyInvalidError,
  IdempotencyKeyReusedError,
  IdempotencyInProgressError,
  IdempotencyStorageError,
} from './errors'

export {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  DEFAULT_IDEMPOTENCY_TTL_HOURS,
  MIN_IDEMPOTENCY_TTL_HOURS,
  MAX_IDEMPOTENCY_TTL_HOURS,
  getIdempotencyTtlHours,
} from './config'

export {
  extractIdempotencyKey,
  validateIdempotencyKey,
  hashRequestPayload,
  stableStringify,
} from './validation'

export { IDEMPOTENCY_OPERATIONS } from './types'
export type {
  IdempotencyStatus,
  IdempotencyOperationType,
  IdempotencyRecord,
  ClaimIdempotencyInput,
  ClaimIdempotencyResult,
  IdempotentResponse,
  IdempotentOutcome,
  IIdempotencyRepository,
} from './types'
