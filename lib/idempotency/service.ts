/**
 * Idempotency Layer — Service
 *
 * Orchestrates the claim → execute → store lifecycle. It is persistence-
 * agnostic (depends on {@link IIdempotencyRepository}) and free of Next.js
 * imports, which keeps it straightforward to unit-test.
 *
 * Exactly-once semantics
 * ----------------------
 * The operation is executed only by the caller that wins the atomic
 * `repository.claim()`. Duplicate / concurrent callers never reach the handler:
 *   - completed record  → the stored response is replayed
 *   - in-progress record → a 409 tells the client to retry shortly
 *   - failed record      → the key is reclaimed so a retry can proceed
 */

import { getIdempotencyTtlHours } from './config'
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  IdempotencyStorageError,
} from './errors'
import { idempotencyRepository } from './repository'
import { hashRequestPayload } from './validation'
import type {
  IdempotencyOperationType,
  IdempotentOutcome,
  IdempotentResponse,
  IIdempotencyRepository,
} from './types'

export interface RunIdempotentParams {
  key: string
  operationType: IdempotencyOperationType
  requestPayload: Record<string, unknown>
  handler: () => Promise<IdempotentResponse>
}

export class IdempotencyService {
  constructor(
    private readonly repo: IIdempotencyRepository = idempotencyRepository,
    private readonly ttlHours: () => number = getIdempotencyTtlHours
  ) {}

  /**
   * Runs `handler` exactly once for the given `(key, operationType)` pair.
   *
   * @throws {IdempotencyKeyReusedError}   same key, different payload
   * @throws {IdempotencyInProgressError}  duplicate request while in flight
   * @throws {IdempotencyStorageError}     the store could not be reached
   */
  async run(params: RunIdempotentParams): Promise<IdempotentOutcome> {
    const ttlHours = this.ttlHours()
    const requestHash = hashRequestPayload(params.requestPayload)

    let claim
    try {
      claim = await this.repo.claim({
        key: params.key,
        operationType: params.operationType,
        requestHash,
        requestPayload: params.requestPayload,
        ttlHours,
      })
    } catch (err) {
      throw new IdempotencyStorageError(
        err instanceof Error ? `Failed to claim idempotency key: ${err.message}` : undefined
      )
    }

    if (!claim.claimed) {
      const existing = claim.record
      if (!existing) {
        throw new IdempotencyStorageError('Idempotency record disappeared during claim')
      }

      // Reusing a key with a different payload is a client bug / replay attack.
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyKeyReusedError()
      }

      if (existing.status === 'completed') {
        return {
          status: existing.responseStatus ?? 200,
          body: existing.responsePayload ?? {},
          replayed: true,
        }
      }

      if (existing.status === 'in_progress') {
        throw new IdempotencyInProgressError(existing.expiresAt)
      }

      throw new IdempotencyStorageError(
        `Idempotency record is in an unexpected state: ${existing.status}`
      )
    }

    try {
      const response = await params.handler()

      if (response.status >= 200 && response.status < 300) {
        try {
          await this.repo.complete(
            params.key,
            params.operationType,
            response.body,
            response.status,
            ttlHours
          )
        } catch (err) {
          throw new IdempotencyStorageError(
            err instanceof Error
              ? `Failed to store idempotent response: ${err.message}`
              : undefined
          )
        }
        return { ...response, replayed: false }
      }

      // Only successful responses are cached; a failed attempt may be retried
      // with the same key, so release the claim.
      await this.repo.markFailed(params.key, params.operationType).catch(() => {})
      return { ...response, replayed: false }
    } catch (err) {
      // Best-effort release so the client can retry the same key.
      await this.repo.markFailed(params.key, params.operationType).catch(() => {})
      throw err
    }
  }
}

export const idempotencyService = new IdempotencyService()
