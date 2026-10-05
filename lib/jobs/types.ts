export const JOB_TYPES = ['tx_monitor', 'notification', 'contract_sync', 'deadline_check'] as const

export type JobType = (typeof JOB_TYPES)[number]
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type JobState = 'pending' | 'running' | 'completed' | 'failed'

export const JOB_STATE: Record<JobStatus, JobState> = {
  queued: 'pending',
  processing: 'running',
  completed: 'completed',
  failed: 'failed',
}

export interface JobErrorRecord {
  attempt: number
  message: string
  stack: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface BackgroundJob {
  id: string
  type: JobType
  dedupeKey: string
  status: JobStatus
  state: JobState
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  retryCount: number
  maxRetries: number
  nextRunAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  errors: JobErrorRecord[]
}

export interface EnqueueJobInput {
  type: JobType
  dedupeKey: string
  payload?: Record<string, unknown>
  maxRetries?: number
}

export interface JobBatchResult {
  claimed: number
  completed: number
  retried: number
  failed: number
  errors: string[]
}

export type JobHandler = (job: BackgroundJob) => Promise<Record<string, unknown> | void>

export class JobQueueError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'JobQueueError'
  }
}

export function getJobBackoffMs(attempt: number): number {
  const base = Number(process.env.JOB_BACKOFF_BASE_MS) || 1_000
  const cap = Number(process.env.JOB_BACKOFF_CAP_MS) || 60_000
  return Math.min(cap, base * 2 ** Math.max(0, attempt - 1))
}
