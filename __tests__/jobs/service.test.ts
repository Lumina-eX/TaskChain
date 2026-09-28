import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: { query } }))

import { JobQueueService } from '@/lib/jobs/service'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  job_type: 'deadline_check',
  dedupe_key: 'deadline:2026-09-28T09',
  status: 'queued',
  payload: {},
  result: null,
  retry_count: 0,
  max_retries: 3,
  next_run_at: '2026-09-28T09:00:00Z',
  completed_at: null,
  created_at: '2026-09-28T08:00:00Z',
  updated_at: '2026-09-28T08:00:00Z',
  ...overrides,
})

describe('JobQueueService', () => {
  beforeEach(() => query.mockReset())

  it('queues a job once and returns it without running the handler', async () => {
    query.mockResolvedValueOnce([row()])
    const service = new JobQueueService()
    const result = await service.enqueue({ type: 'deadline_check', dedupeKey: 'deadline:2026-09-28T09' })
    expect(result.isDuplicate).toBe(false)
    expect(result.job.state).toBe('pending')
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (dedupe_key) DO NOTHING')
  })

  it('returns the existing job when the same dedupe key is queued again', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row({ status: 'completed' })])
    const service = new JobQueueService()
    const result = await service.enqueue({ type: 'deadline_check', dedupeKey: 'deadline:2026-09-28T09' })
    expect(result.isDuplicate).toBe(true)
    expect(result.job.status).toBe('completed')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('rejects a dedupe key already bound to another job type', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row()])
    const service = new JobQueueService()
    await expect(service.enqueue({ type: 'tx_monitor', dedupeKey: 'deadline:2026-09-28T09' }))
      .rejects.toMatchObject({ code: 'JOB_DEDUPE_CONFLICT', httpStatus: 409 })
  })

  it('claims due jobs with a row lock so another worker cannot take them', async () => {
    query.mockResolvedValueOnce([row({ status: 'processing' })])
    query.mockResolvedValueOnce([])
    const service = new JobQueueService()
    const result = await service.processBatch({
      workerId: 'worker-a',
      handlers: { deadline_check: async () => ({ remindersSent: 1, overdueFlagged: 0 }) },
    })
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED')
    expect(query.mock.calls[1][0]).toContain("status = 'completed'")
    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 })
  })

  it('records the stack and requeues with backoff while retries remain', async () => {
    query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([{ status: 'queued' }])
    const service = new JobQueueService()
    const result = await service.processBatch({
      workerId: 'worker-a',
      handlers: { deadline_check: async () => { throw new Error('horizon timeout') } },
    })
    const failureSql = query.mock.calls[1][0] as string
    expect(failureSql).toContain('INSERT INTO background_job_errors')
    expect(failureSql).toContain('INTERVAL \'1 millisecond\'')
    expect(query.mock.calls[1][1][3]).toContain('horizon timeout')
    expect(result).toMatchObject({ retried: 1, failed: 0 })
  })

  it('marks the job failed once the retry limit is exhausted', async () => {
    query.mockResolvedValueOnce([row({ retry_count: 2 })]).mockResolvedValueOnce([{ status: 'failed' }])
    const service = new JobQueueService()
    const result = await service.processBatch({
      workerId: 'worker-a',
      handlers: { deadline_check: async () => { throw new Error('still down') } },
    })
    expect(result).toMatchObject({ retried: 0, failed: 1 })
  })

  it('returns job state and stored errors', async () => {
    query.mockResolvedValueOnce([row({
      status: 'failed',
      errors: [{ attempt: 3, message: 'still down', stack: 'Error: still down', metadata: { workerId: 'worker-a' }, createdAt: '2026-09-28T09:05:00Z' }],
    })])
    const job = await new JobQueueService().getJob(row().id)
    expect(job.state).toBe('failed')
    expect(job.errors[0]).toMatchObject({ attempt: 3, message: 'still down', stack: 'Error: still down' })
  })
})
