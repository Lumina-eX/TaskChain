import { sql } from '@/lib/db'

/** Maximum age of a cached row before metrics are recomputed from `jobs` / `disputes`. */
export const REPUTATION_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000

export interface ReputationMetrics {
  /** Share of assigned jobs that reached `completed` (0–1). */
  completionRate: number | null
  /** Share of assigned jobs that are disputed or have a `disputes` row (0–1). */
  disputeRate: number | null
  /** Sum of `budget` for completed jobs (same numeric mix as stored per job). */
  totalVolume: number
  /** Among completed jobs with both `deadline` and `completed_at`, share finished on/before deadline (0–1). */
  onTimeDeliveryPct: number | null
  jobsStarted: number
  jobsCompleted: number
  jobsWithDispute: number
  completedWithDeadline: number
  onTimeDeliveries: number
}

export interface FreelancerReputationPayload {
  userId: number
  metrics: ReputationMetrics
  /** Optional blended score 0–100 for display; null if insufficient data. */
  reputationScore: number | null
  computedAt: string
}

interface AggregateRow {
  jobs_started: number
  jobs_completed: number
  jobs_with_dispute: number
  total_volume: string | number
  completed_with_deadline: number
  on_time_deliveries: number
}

interface SnapshotRow {
  user_id: number
  jobs_started: number
  jobs_completed: number
  jobs_with_dispute: number
  total_completed_volume: string | number
  completed_with_deadline: number
  on_time_deliveries: number
  completion_rate: string | number | null
  dispute_rate: string | number | null
  on_time_delivery_rate: string | number | null
  reputation_score: string | number | null
  computed_at: string
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function buildPayload(
  userId: number,
  row: {
    jobs_started: number
    jobs_completed: number
    jobs_with_dispute: number
    total_volume: string | number
    completed_with_deadline: number
    on_time_deliveries: number
    completion_rate: number | null
    dispute_rate: number | null
    on_time_delivery_rate: number | null
    reputation_score: number | null
    computed_at: Date | string
  }
): FreelancerReputationPayload {
  const computedAt =
    row.computed_at instanceof Date
      ? row.computed_at.toISOString()
      : row.computed_at

  return {
    userId,
    metrics: {
      completionRate: row.completion_rate,
      disputeRate: row.dispute_rate,
      totalVolume: num(row.total_volume) ?? 0,
      onTimeDeliveryPct: row.on_time_delivery_rate,
      jobsStarted: row.jobs_started,
      jobsCompleted: row.jobs_completed,
      jobsWithDispute: row.jobs_with_dispute,
      completedWithDeadline: row.completed_with_deadline,
      onTimeDeliveries: row.on_time_deliveries,
    },
    reputationScore: row.reputation_score,
    computedAt,
  }
}

export function deriveRatesFromCounts(args: {
  jobsStarted: number
  jobsCompleted: number
  jobsWithDispute: number
  completedWithDeadline: number
  onTimeDeliveries: number
}): {
  completionRate: number | null
  disputeRate: number | null
  onTimeDeliveryPct: number | null
  reputationScore: number | null
} {
  const { jobsStarted, jobsCompleted, jobsWithDispute, completedWithDeadline, onTimeDeliveries } =
    args

  const completionRate =
    jobsStarted > 0 ? Math.min(1, Math.max(0, jobsCompleted / jobsStarted)) : null
  const disputeRate =
    jobsStarted > 0 ? Math.min(1, Math.max(0, jobsWithDispute / jobsStarted)) : null
  const onTimeDeliveryPct =
    completedWithDeadline > 0
      ? Math.min(1, Math.max(0, onTimeDeliveries / completedWithDeadline))
      : null

  let reputationScore: number | null = null
  if (jobsStarted > 0 && completionRate !== null && disputeRate !== null) {
    const onTimeComponent = onTimeDeliveryPct ?? 0.5
    const raw =
      100 * (0.4 * completionRate + 0.35 * onTimeComponent + 0.25 * (1 - disputeRate))
    reputationScore = Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10
  }

  return { completionRate, disputeRate, onTimeDeliveryPct, reputationScore }
}

async function aggregateForFreelancer(userId: number): Promise<AggregateRow> {
  const rows = await sql<AggregateRow[]>`
    SELECT
      COUNT(*)::int AS jobs_started,
      COUNT(*) FILTER (WHERE j.status = 'completed')::int AS jobs_completed,
      COUNT(*) FILTER (
        WHERE j.status = 'disputed'
          OR EXISTS (SELECT 1 FROM disputes d WHERE d.job_id = j.id)
      )::int AS jobs_with_dispute,
      COALESCE(
        SUM(j.budget) FILTER (WHERE j.status = 'completed'),
        0
      )::numeric AS total_volume,
      COUNT(*) FILTER (
        WHERE j.status = 'completed'
          AND j.deadline IS NOT NULL
          AND j.completed_at IS NOT NULL
      )::int AS completed_with_deadline,
      COUNT(*) FILTER (
        WHERE j.status = 'completed'
          AND j.deadline IS NOT NULL
          AND j.completed_at IS NOT NULL
          AND j.completed_at <= j.deadline
      )::int AS on_time_deliveries
    FROM jobs j
    WHERE j.freelancer_id = ${userId}
  `

  return (
    rows[0] ?? {
      jobs_started: 0,
      jobs_completed: 0,
      jobs_with_dispute: 0,
      total_volume: 0,
      completed_with_deadline: 0,
      on_time_deliveries: 0,
    }
  )
}

async function upsertSnapshot(userId: number, agg: AggregateRow): Promise<void> {
  const totalVolume = num(agg.total_volume) ?? 0
  const { completionRate, disputeRate, onTimeDeliveryPct, reputationScore } =
    deriveRatesFromCounts({
      jobsStarted: agg.jobs_started,
      jobsCompleted: agg.jobs_completed,
      jobsWithDispute: agg.jobs_with_dispute,
      completedWithDeadline: agg.completed_with_deadline,
      onTimeDeliveries: agg.on_time_deliveries,
    })

  await sql`
    INSERT INTO freelancer_reputation (
      user_id,
      jobs_started,
      jobs_completed,
      jobs_with_dispute,
      total_completed_volume,
      completed_with_deadline,
      on_time_deliveries,
      completion_rate,
      dispute_rate,
      on_time_delivery_rate,
      reputation_score,
      computed_at
    )
    VALUES (
      ${userId},
      ${agg.jobs_started},
      ${agg.jobs_completed},
      ${agg.jobs_with_dispute},
      ${totalVolume},
      ${agg.completed_with_deadline},
      ${agg.on_time_deliveries},
      ${completionRate},
      ${disputeRate},
      ${onTimeDeliveryPct},
      ${reputationScore},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      jobs_started = EXCLUDED.jobs_started,
      jobs_completed = EXCLUDED.jobs_completed,
      jobs_with_dispute = EXCLUDED.jobs_with_dispute,
      total_completed_volume = EXCLUDED.total_completed_volume,
      completed_with_deadline = EXCLUDED.completed_with_deadline,
      on_time_deliveries = EXCLUDED.on_time_deliveries,
      completion_rate = EXCLUDED.completion_rate,
      dispute_rate = EXCLUDED.dispute_rate,
      on_time_delivery_rate = EXCLUDED.on_time_delivery_rate,
      reputation_score = EXCLUDED.reputation_score,
      computed_at = EXCLUDED.computed_at
  `
}

async function readSnapshot(userId: number): Promise<SnapshotRow | null> {
  const rows = await sql<SnapshotRow[]>`
    SELECT
      user_id,
      jobs_started,
      jobs_completed,
      jobs_with_dispute,
      total_completed_volume,
      completed_with_deadline,
      on_time_deliveries,
      completion_rate,
      dispute_rate,
      on_time_delivery_rate,
      reputation_score,
      computed_at
    FROM freelancer_reputation
    WHERE user_id = ${userId}
    LIMIT 1
  `
  return rows[0] ?? null
}

function snapshotIsFresh(computedAt: string, maxAgeMs: number): boolean {
  const t = new Date(computedAt).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t < maxAgeMs
}

/** Recomputes metrics from source tables and refreshes the snapshot row. */
export async function refreshFreelancerReputation(userId: number): Promise<FreelancerReputationPayload> {
  const agg = await aggregateForFreelancer(userId)
  await upsertSnapshot(userId, agg)
  const snap = await readSnapshot(userId)
  if (!snap) {
    throw new Error('Reputation snapshot missing after upsert')
  }

  return buildPayload(userId, {
    jobs_started: snap.jobs_started,
    jobs_completed: snap.jobs_completed,
    jobs_with_dispute: snap.jobs_with_dispute,
    total_volume: snap.total_completed_volume,
    completed_with_deadline: snap.completed_with_deadline,
    on_time_deliveries: snap.on_time_deliveries,
    completion_rate: num(snap.completion_rate),
    dispute_rate: num(snap.dispute_rate),
    on_time_delivery_rate: num(snap.on_time_delivery_rate),
    reputation_score: num(snap.reputation_score),
    computed_at: snap.computed_at,
  })
}

/**
 * Returns cached reputation when fresh; otherwise recomputes once per TTL window.
 * Reads are O(1) against `freelancer_reputation`; recomputation uses one aggregation query.
 */
export async function getFreelancerReputation(
  userId: number,
  options?: { maxAgeMs?: number; forceRefresh?: boolean }
): Promise<FreelancerReputationPayload> {
  const maxAgeMs = options?.maxAgeMs ?? REPUTATION_SNAPSHOT_MAX_AGE_MS
  const forceRefresh = options?.forceRefresh ?? false

  if (!forceRefresh) {
    const snap = await readSnapshot(userId)
    if (snap && snapshotIsFresh(snap.computed_at, maxAgeMs)) {
      return buildPayload(userId, {
        jobs_started: snap.jobs_started,
        jobs_completed: snap.jobs_completed,
        jobs_with_dispute: snap.jobs_with_dispute,
        total_volume: snap.total_completed_volume,
        completed_with_deadline: snap.completed_with_deadline,
        on_time_deliveries: snap.on_time_deliveries,
        completion_rate: num(snap.completion_rate),
        dispute_rate: num(snap.dispute_rate),
        on_time_delivery_rate: num(snap.on_time_delivery_rate),
        reputation_score: num(snap.reputation_score),
        computed_at: snap.computed_at,
      })
    }
  }

  return refreshFreelancerReputation(userId)
}

export async function getUserIdByWallet(walletAddress: string): Promise<number | null> {
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `
  return rows[0]?.id ?? null
}

export async function userExists(userId: number): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE id = ${userId} LIMIT 1
  `
  return rows.length > 0
}
