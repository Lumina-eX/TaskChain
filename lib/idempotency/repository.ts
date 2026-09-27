/**
 * Idempotency Layer — Database Repository
 *
 * All SQL for idempotency records lives here. The service layer depends on the
 * {@link IIdempotencyRepository} interface, so tests can substitute an
 * in-memory implementation without touching the database client.
 *
 * Concurrency model
 * -----------------
 * `claim()` is a single atomic `INSERT … ON CONFLICT` statement. PostgreSQL's
 * unique constraint on `(idempotency_key, operation_type)` serialises
 * simultaneous requests: exactly one caller gets the row back and is allowed
 * to execute the operation, every other caller observes the existing record.
 * This is what prevents duplicate escrow/payment records at the database
 * level.
 */

import { sql } from '@/lib/db'
import type {
  ClaimIdempotencyInput,
  ClaimIdempotencyResult,
  IdempotencyOperationType,
  IdempotencyRecord,
  IIdempotencyRepository,
} from './types'

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>
  return {}
}

function rowToRecord(row: Record<string, unknown>): IdempotencyRecord {
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    operationType: row.operation_type as IdempotencyOperationType,
    requestHash: row.request_hash as string,
    requestPayload: parsePayload(row.request_payload),
    responsePayload:
      row.response_payload === null || row.response_payload === undefined
        ? null
        : parsePayload(row.response_payload),
    responseStatus:
      row.response_status === null || row.response_status === undefined
        ? null
        : Number(row.response_status),
    status: row.status as IdempotencyRecord['status'],
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    expiresAt: new Date(row.expires_at as string).toISOString(),
  }
}

export class IdempotencyRepository implements IIdempotencyRepository {
  async claim(input: ClaimIdempotencyInput): Promise<ClaimIdempotencyResult> {
    const rows = (await sql`
      INSERT INTO idempotency_records (
        idempotency_key,
        operation_type,
        request_hash,
        request_payload,
        status,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        ${input.key},
        ${input.operationType},
        ${input.requestHash},
        ${JSON.stringify(input.requestPayload)}::jsonb,
        'in_progress',
        NOW() + make_interval(hours => ${input.ttlHours}::int),
        NOW(),
        NOW()
      )
      ON CONFLICT (idempotency_key, operation_type) DO UPDATE
        SET request_hash     = EXCLUDED.request_hash,
            request_payload  = EXCLUDED.request_payload,
            response_payload = NULL,
            response_status  = NULL,
            status           = 'in_progress',
            updated_at       = NOW(),
            expires_at       = EXCLUDED.expires_at
        WHERE idempotency_records.expires_at <= NOW()
           OR idempotency_records.status = 'failed'
      RETURNING *
    `) as Record<string, unknown>[]

    if (rows.length > 0) {
      return { claimed: true, record: rowToRecord(rows[0]) }
    }

    // A live record already exists — return it so the caller can decide
    // whether to replay the stored response or reject the request.
    return { claimed: false, record: await this.get(input.key, input.operationType) }
  }

  async get(
    key: string,
    operationType: IdempotencyOperationType
  ): Promise<IdempotencyRecord | null> {
    const rows = (await sql`
      SELECT * FROM idempotency_records
       WHERE idempotency_key = ${key}
         AND operation_type = ${operationType}
       LIMIT 1
    `) as Record<string, unknown>[]

    return rows[0] ? rowToRecord(rows[0]) : null
  }

  async complete(
    key: string,
    operationType: IdempotencyOperationType,
    responsePayload: Record<string, unknown>,
    responseStatus: number,
    ttlHours: number
  ): Promise<IdempotencyRecord | null> {
    const rows = (await sql`
      UPDATE idempotency_records
         SET response_payload = ${JSON.stringify(responsePayload)}::jsonb,
             response_status  = ${responseStatus},
             status           = 'completed',
             updated_at       = NOW(),
             expires_at       = NOW() + make_interval(hours => ${ttlHours}::int)
       WHERE idempotency_key = ${key}
         AND operation_type = ${operationType}
       RETURNING *
    `) as Record<string, unknown>[]

    return rows[0] ? rowToRecord(rows[0]) : null
  }

  async markFailed(
    key: string,
    operationType: IdempotencyOperationType
  ): Promise<void> {
    await sql`
      UPDATE idempotency_records
         SET status     = 'failed',
             updated_at = NOW()
       WHERE idempotency_key = ${key}
         AND operation_type = ${operationType}
    `
  }

  async remove(
    key: string,
    operationType: IdempotencyOperationType
  ): Promise<void> {
    await sql`
      DELETE FROM idempotency_records
       WHERE idempotency_key = ${key}
         AND operation_type = ${operationType}
    `
  }

  async purgeExpired(): Promise<number> {
    const rows = (await sql`
      DELETE FROM idempotency_records
       WHERE expires_at <= NOW()
      RETURNING id
    `) as Record<string, unknown>[]

    return rows.length
  }
}

export const idempotencyRepository = new IdempotencyRepository()
