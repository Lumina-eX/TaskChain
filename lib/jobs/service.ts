import { sql } from '@/lib/db'
import {
  JOB_STATE,
  JobQueueError,
  getJobBackoffMs,
} from './types'
import type {
  BackgroundJob,
  EnqueueJobInput,
  JobBatchResult,
  JobErrorRecord,
  JobHandler,
  JobStatus,
  JobType,
} from './types'

const SELECT_COLUMNS = `id, job_type, dedupe_key, status, payload, result, retry_count,
  max_retries, next_run_at, completed_at, created_at, updated_at`

export class JobQueueService {
  async enqueue(input: EnqueueJobInput): Promise<{ job: BackgroundJob; isDuplicate: boolean }> {
    const dedupeKey = input.dedupeKey.trim()
    if (!dedupeKey || dedupeKey.length > 200) {
      throw new JobQueueError('INVALID_DEDUPE_KEY', 'dedupeKey must be 1–200 characters.', 422)
    }
    const maxRetries = input.maxRetries ?? 5
    if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 20) {
      throw new JobQueueError('INVALID_MAX_RETRIES', 'maxRetries must be an integer from 1 to 20.', 422)
    }

    const inserted = await sql.query(
      `INSERT INTO background_jobs (job_type, dedupe_key, payload, max_retries)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      [input.type, dedupeKey, JSON.stringify(input.payload ?? {}), maxRetries],
    ) as Array<Record<string, unknown>>

    if (inserted.length) return { job: this.mapRow(inserted[0]), isDuplicate: false }

    const existing = await sql.query(
      `SELECT ${SELECT_COLUMNS} FROM background_jobs WHERE dedupe_key = $1 LIMIT 1`,
      [dedupeKey],
    ) as Array<Record<string, unknown>>
    if (!existing.length) throw new JobQueueError('JOB_ENQUEUE_FAILED', 'Job could not be queued.', 500)

    const job = this.mapRow(existing[0])
    if (job.type !== input.type) {
      throw new JobQueueError('JOB_DEDUPE_CONFLICT', 'dedupeKey is already used by a different job type.', 409)
    }
    return { job, isDuplicate: true }
  }

  async getJob(id: string): Promise<BackgroundJob> {
    const rows = await sql.query(
      `SELECT ${SELECT_COLUMNS.split(', ').map((column) => `j.${column.trim()}`).join(', ')},
              COALESCE(
                json_agg(
                  json_build_object(
                    'attempt', e.attempt,
                    'message', e.message,
                    'stack', e.stack,
                    'metadata', e.metadata,
                    'createdAt', e.created_at
                  )
                  ORDER BY e.created_at
                ) FILTER (WHERE e.id IS NOT NULL),
                '[]'::json
              ) AS errors
         FROM background_jobs j
         LEFT JOIN background_job_errors e ON e.job_id = j.id
        WHERE j.id = $1::uuid
        GROUP BY j.id`,
      [id],
    ) as Array<Record<string, unknown>>
    if (!rows.length) throw new JobQueueError('JOB_NOT_FOUND', 'Job not found.', 404)
    return this.mapRow(rows[0], rows[0].errors)
  }

  async processBatch(options: {
    workerId: string
    batchSize?: number
    handlers: Partial<Record<JobType, JobHandler>>
  }): Promise<JobBatchResult> {
    const workerId = options.workerId.trim()
    if (!workerId) throw new JobQueueError('INVALID_WORKER', 'workerId is required.', 422)
    const limit = Number.isInteger(options.batchSize)
      ? Math.min(50, Math.max(1, options.batchSize as number))
      : 10

    const claimed = await sql.query(
      `WITH due AS (
         SELECT id FROM background_jobs
          WHERE status = 'queued' AND next_run_at <= NOW()
          ORDER BY next_run_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE background_jobs j
          SET status = 'processing', locked_by = $2, locked_at = NOW(), updated_at = NOW()
         FROM due
        WHERE j.id = due.id
       RETURNING ${SELECT_COLUMNS.split(', ').map((column) => `j.${column.trim()}`).join(', ')}`,
      [limit, workerId],
    ) as Array<Record<string, unknown>>

    const result: JobBatchResult = { claimed: claimed.length, completed: 0, retried: 0, failed: 0, errors: [] }
    for (const row of claimed) {
      const job = this.mapRow(row)
      try {
        const handler = options.handlers[job.type]
        if (!handler) throw new Error(`No handler registered for job type ${job.type}`)
        const output = await handler(job)
        await this.markCompleted(job.id, output ?? {})
        result.completed++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack ?? null : null
        try {
          const outcome = await this.recordFailure(job, workerId, message, stack)
          if (outcome === 'failed') result.failed++
          else result.retried++
        } catch (persistError) {
          result.errors.push(`Job ${job.id}: ${persistError instanceof Error ? persistError.message : String(persistError)}`)
        }
        result.errors.push(`Job ${job.id}: ${message}`)
      }
    }
    return result
  }

  private async markCompleted(id: string, output: Record<string, unknown>): Promise<void> {
    await sql.query(
      `UPDATE background_jobs
          SET status = 'completed', result = $2::jsonb, completed_at = NOW(),
              locked_by = NULL, locked_at = NULL, updated_at = NOW()
        WHERE id = $1::uuid AND status = 'processing'`,
      [id, JSON.stringify(output)],
    )
  }

  private async recordFailure(
    job: BackgroundJob,
    workerId: string,
    message: string,
    stack: string | null,
  ): Promise<'queued' | 'failed'> {
    const attempt = job.retryCount + 1
    const rows = await sql.query(
      `WITH err AS (
         INSERT INTO background_job_errors (job_id, attempt, message, stack, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
         RETURNING job_id
       )
       UPDATE background_jobs j
          SET retry_count = j.retry_count + 1,
              status = CASE
                WHEN j.retry_count + 1 >= j.max_retries THEN 'failed'::background_job_status
                ELSE 'queued'::background_job_status
              END,
              next_run_at = CASE
                WHEN j.retry_count + 1 >= j.max_retries THEN j.next_run_at
                ELSE NOW() + ($6 * INTERVAL '1 millisecond')
              END,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = NOW()
         FROM err
        WHERE j.id = err.job_id AND j.status = 'processing'
       RETURNING j.status`,
      [
        job.id,
        attempt,
        message,
        stack,
        JSON.stringify({ workerId, jobType: job.type, dedupeKey: job.dedupeKey }),
        getJobBackoffMs(attempt),
      ],
    ) as Array<{ status: JobStatus }>
    return rows[0]?.status === 'failed' ? 'failed' : 'queued'
  }

  private mapRow(row: Record<string, unknown>, errors: unknown = []): BackgroundJob {
    const status = row.status as JobStatus
    return {
      id: String(row.id),
      type: row.job_type as JobType,
      dedupeKey: String(row.dedupe_key),
      status,
      state: JOB_STATE[status],
      payload: asObject(row.payload),
      result: row.result == null ? null : asObject(row.result),
      retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries),
      nextRunAt: asTimestamp(row.next_run_at),
      completedAt: row.completed_at == null ? null : asTimestamp(row.completed_at),
      createdAt: asTimestamp(row.created_at),
      updatedAt: asTimestamp(row.updated_at),
      errors: asErrors(errors),
    }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function asTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function asErrors(value: unknown): JobErrorRecord[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? safeParseArray(value) : []
  return list.map((entry) => {
    const row = asObject(entry)
    return {
      attempt: Number(row.attempt),
      message: String(row.message ?? ''),
      stack: row.stack == null ? null : String(row.stack),
      metadata: asObject(row.metadata),
      createdAt: asTimestamp(row.createdAt ?? row.created_at),
    }
  })
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const jobQueueService = new JobQueueService()
