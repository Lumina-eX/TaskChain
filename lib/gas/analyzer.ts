/**
 * Gas / Fee Analytics Engine
 *
 * Aggregates on-chain fee data from `transaction_fees` to power:
 *  - Per-operation cost breakdowns
 *  - Storage usage trends
 *  - Fee efficiency scoring
 *  - Optimization opportunity detection
 *  - Time-series data for dashboard charts
 */

import { sql } from '@/lib/db'
import { stroopsToXlm } from '@/lib/soroban/feeEstimator'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FeeOperationType =
  | 'contract_deploy'
  | 'milestone_fund'
  | 'milestone_release'
  | 'milestone_refund'
  | 'job_fund'
  | 'job_release'
  | 'job_refund'
  | 'dispute_resolution'
  | 'contract_freeze'
  | 'wasm_upload'

export interface OperationCostSummary {
  operationType: FeeOperationType
  txCount: number
  avgFeeStroops: bigint
  avgFeeXlm: number
  minFeeStroops: bigint
  maxFeeStroops: bigint
  p50FeeStroops: bigint | null
  p95FeeStroops: bigint | null
  totalFeesStroops: bigint
  totalFeesXlm: number
  avgCpuInstructions: bigint | null
  avgWriteBytes: bigint | null
  totalSavingsStroops: bigint
}

export interface StorageUsageSummary {
  avgWriteBytes: number
  avgReadBytes: number
  avgLedgerWrites: number
  avgLedgerReads: number
  totalWriteBytes: number
  /** Estimated cost of storage writes in stroops */
  estimatedStorageCostStroops: bigint
  /** Top operations by write bytes */
  topWriteOperations: Array<{
    operationType: FeeOperationType
    avgWriteBytes: number
    txCount: number
  }>
}

export interface FeeTimeSeries {
  period: string
  avgFeeStroops: bigint
  avgFeeXlm: number
  txCount: number
  totalFeesXlm: number
}

export interface FeeEfficiencyReport {
  /** 0–100 score; higher = more efficient */
  efficiencyScore: number
  totalTransactions: number
  totalFeesXlm: number
  totalSavingsXlm: number
  /** Percentage of transactions where optimization was applied */
  optimizationCoverage: number
  /** Breakdown by operation */
  operationBreakdown: OperationCostSummary[]
  /** Storage analysis */
  storageUsage: StorageUsageSummary
  /** Time-series for charts (last 30 days, daily) */
  dailyTrend: FeeTimeSeries[]
  /** Actionable recommendations */
  recommendations: FeeRecommendation[]
  generatedAt: string
}

export interface FeeRecommendation {
  priority: 'high' | 'medium' | 'low'
  category: 'storage' | 'cpu' | 'batching' | 'fee_strategy' | 'transaction_size'
  title: string
  description: string
  estimatedSavingsXlm: number
}

export interface ContractFeeHistory {
  contractId: number
  totalFeesXlm: number
  txCount: number
  operations: Array<{
    operationType: FeeOperationType
    feeXlm: number
    submittedAt: string
    stellarTxHash: string
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface OperationAggRow {
  operation_type: FeeOperationType
  tx_count: string
  avg_fee: string
  min_fee: string
  max_fee: string
  p50_fee: string | null
  p95_fee: string | null
  total_fees: string
  avg_cpu: string | null
  avg_write_bytes: string | null
  total_savings: string
}

interface StorageAggRow {
  avg_write_bytes: string
  avg_read_bytes: string
  avg_ledger_writes: string
  avg_ledger_reads: string
  total_write_bytes: string
}

interface TopWriteRow {
  operation_type: FeeOperationType
  avg_write_bytes: string
  tx_count: string
}

interface DailyTrendRow {
  period: string
  avg_fee: string
  tx_count: string
  total_fees: string
}

interface TotalRow {
  total_txs: string
  total_fees: string
  total_savings: string
  optimized_txs: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Core analytics functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns per-operation cost summaries across all recorded transactions.
 */
export async function getOperationCostBreakdown(): Promise<OperationCostSummary[]> {
  const rows = await sql<OperationAggRow[]>`
    SELECT
      operation_type,
      COUNT(*)::text                                          AS tx_count,
      AVG(total_fee_stroops)::bigint::text                   AS avg_fee,
      MIN(total_fee_stroops)::text                           AS min_fee,
      MAX(total_fee_stroops)::text                           AS max_fee,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY total_fee_stroops
      )::bigint::text                                        AS p50_fee,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY total_fee_stroops
      )::bigint::text                                        AS p95_fee,
      SUM(total_fee_stroops)::text                           AS total_fees,
      AVG(cpu_instructions)::bigint::text                    AS avg_cpu,
      AVG(write_bytes)::bigint::text                         AS avg_write_bytes,
      COALESCE(SUM(savings_stroops), 0)::text                AS total_savings
    FROM transaction_fees
    GROUP BY operation_type
    ORDER BY SUM(total_fee_stroops) DESC
  `

  return rows.map((r) => ({
    operationType: r.operation_type,
    txCount: parseInt(r.tx_count, 10),
    avgFeeStroops: BigInt(r.avg_fee),
    avgFeeXlm: stroopsToXlm(BigInt(r.avg_fee)),
    minFeeStroops: BigInt(r.min_fee),
    maxFeeStroops: BigInt(r.max_fee),
    p50FeeStroops: r.p50_fee ? BigInt(r.p50_fee) : null,
    p95FeeStroops: r.p95_fee ? BigInt(r.p95_fee) : null,
    totalFeesStroops: BigInt(r.total_fees),
    totalFeesXlm: stroopsToXlm(BigInt(r.total_fees)),
    avgCpuInstructions: r.avg_cpu ? BigInt(r.avg_cpu) : null,
    avgWriteBytes: r.avg_write_bytes ? BigInt(r.avg_write_bytes) : null,
    totalSavingsStroops: BigInt(r.total_savings),
  }))
}

/**
 * Analyzes storage usage patterns across all transactions.
 */
export async function getStorageUsageSummary(): Promise<StorageUsageSummary> {
  const [aggRows, topWriteRows] = await Promise.all([
    sql<StorageAggRow[]>`
      SELECT
        COALESCE(AVG(write_bytes), 0)::text        AS avg_write_bytes,
        COALESCE(AVG(read_bytes), 0)::text         AS avg_read_bytes,
        COALESCE(AVG(ledger_writes), 0)::text      AS avg_ledger_writes,
        COALESCE(AVG(ledger_reads), 0)::text       AS avg_ledger_reads,
        COALESCE(SUM(write_bytes), 0)::text        AS total_write_bytes
      FROM transaction_fees
      WHERE write_bytes IS NOT NULL
    `,
    sql<TopWriteRow[]>`
      SELECT
        operation_type,
        AVG(write_bytes)::bigint::text  AS avg_write_bytes,
        COUNT(*)::text                  AS tx_count
      FROM transaction_fees
      WHERE write_bytes IS NOT NULL
      GROUP BY operation_type
      ORDER BY AVG(write_bytes) DESC
      LIMIT 5
    `,
  ])

  const agg = aggRows[0] ?? {
    avg_write_bytes: '0',
    avg_read_bytes: '0',
    avg_ledger_writes: '0',
    avg_ledger_reads: '0',
    total_write_bytes: '0',
  }

  const totalWriteBytes = parseInt(agg.total_write_bytes, 10)
  // Soroban write cost: ~25 stroops per byte (approximate)
  const estimatedStorageCostStroops = BigInt(Math.ceil(totalWriteBytes * 25))

  return {
    avgWriteBytes: parseFloat(agg.avg_write_bytes),
    avgReadBytes: parseFloat(agg.avg_read_bytes),
    avgLedgerWrites: parseFloat(agg.avg_ledger_writes),
    avgLedgerReads: parseFloat(agg.avg_ledger_reads),
    totalWriteBytes,
    estimatedStorageCostStroops,
    topWriteOperations: topWriteRows.map((r) => ({
      operationType: r.operation_type,
      avgWriteBytes: parseInt(r.avg_write_bytes, 10),
      txCount: parseInt(r.tx_count, 10),
    })),
  }
}

/**
 * Returns daily fee trend for the last N days.
 */
export async function getDailyFeeTrend(days: number = 30): Promise<FeeTimeSeries[]> {
  const rows = await sql<DailyTrendRow[]>`
    SELECT
      DATE_TRUNC('day', submitted_at)::text  AS period,
      AVG(total_fee_stroops)::bigint::text   AS avg_fee,
      COUNT(*)::text                         AS tx_count,
      SUM(total_fee_stroops)::text           AS total_fees
    FROM transaction_fees
    WHERE submitted_at >= NOW() - (${days} || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', submitted_at)
    ORDER BY period ASC
  `

  return rows.map((r) => ({
    period: r.period,
    avgFeeStroops: BigInt(r.avg_fee),
    avgFeeXlm: stroopsToXlm(BigInt(r.avg_fee)),
    txCount: parseInt(r.tx_count, 10),
    totalFeesXlm: stroopsToXlm(BigInt(r.total_fees)),
  }))
}

/**
 * Generates actionable fee recommendations based on observed patterns.
 */
function buildRecommendations(
  operations: OperationCostSummary[],
  storage: StorageUsageSummary,
  totalTxs: number
): FeeRecommendation[] {
  const recs: FeeRecommendation[] = []

  // High write bytes → storage packing
  if (storage.avgWriteBytes > 8192) {
    recs.push({
      priority: 'high',
      category: 'storage',
      title: 'Pack contract storage entries',
      description: `Average write footprint is ${(storage.avgWriteBytes / 1024).toFixed(1)} KB. Consolidate related fields into a single storage key using a struct or map to reduce per-byte write costs.`,
      estimatedSavingsXlm: stroopsToXlm(
        BigInt(Math.ceil((storage.avgWriteBytes - 4096) * 25 * totalTxs))
      ),
    })
  }

  // High ledger writes → batching
  if (storage.avgLedgerWrites > 8) {
    recs.push({
      priority: 'high',
      category: 'batching',
      title: 'Reduce ledger write entries',
      description: `Average of ${storage.avgLedgerWrites.toFixed(1)} ledger write entries per transaction. Batch milestone updates into a single storage key to cut per-entry overhead.`,
      estimatedSavingsXlm: stroopsToXlm(
        BigInt(Math.ceil((storage.avgLedgerWrites - 4) * 500 * totalTxs))
      ),
    })
  }

  // contract_deploy is expensive → WASM reuse
  const deployOp = operations.find((o) => o.operationType === 'contract_deploy')
  if (deployOp && deployOp.avgFeeXlm > 0.01) {
    recs.push({
      priority: 'medium',
      category: 'fee_strategy',
      title: 'Reuse uploaded WASM hash',
      description: `Contract deployment costs an average of ${deployOp.avgFeeXlm.toFixed(5)} XLM. Upload the WASM once and reuse the hash for subsequent deployments to skip the upload fee.`,
      estimatedSavingsXlm: deployOp.avgFeeXlm * 0.6 * deployOp.txCount,
    })
  }

  // p95 >> p50 → fee spikes
  for (const op of operations) {
    if (op.p50FeeStroops && op.p95FeeStroops) {
      const ratio = Number(op.p95FeeStroops) / Number(op.p50FeeStroops)
      if (ratio > 3) {
        recs.push({
          priority: 'medium',
          category: 'fee_strategy',
          title: `Fee spikes in ${op.operationType.replace(/_/g, ' ')}`,
          description: `P95 fee is ${ratio.toFixed(1)}× the median for ${op.operationType.replace(/_/g, ' ')} operations. Investigate outlier transactions and consider fee bumping only when necessary.`,
          estimatedSavingsXlm: stroopsToXlm(
            (op.p95FeeStroops - op.p50FeeStroops) * BigInt(Math.ceil(op.txCount * 0.05))
          ),
        })
      }
    }
  }

  // Low optimization coverage
  const totalSavings = operations.reduce((s, o) => s + o.totalSavingsStroops, 0n)
  if (totalSavings === 0n && totalTxs > 10) {
    recs.push({
      priority: 'low',
      category: 'fee_strategy',
      title: 'Enable pre-submission fee simulation',
      description: 'No optimization savings recorded yet. Enable Soroban transaction simulation before submission to trim resource footprints and reduce fees by 10–30%.',
      estimatedSavingsXlm: 0,
    })
  }

  return recs.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.priority] - order[b.priority]
  })
}

/**
 * Computes an efficiency score (0–100) based on fee patterns.
 * Higher = more efficient use of network resources.
 */
function computeEfficiencyScore(
  operations: OperationCostSummary[],
  storage: StorageUsageSummary,
  optimizationCoverage: number
): number {
  let score = 100

  // Penalize high write bytes (max -30 points)
  if (storage.avgWriteBytes > 32768) score -= 30
  else if (storage.avgWriteBytes > 16384) score -= 20
  else if (storage.avgWriteBytes > 8192) score -= 10

  // Penalize high ledger writes (max -20 points)
  if (storage.avgLedgerWrites > 15) score -= 20
  else if (storage.avgLedgerWrites > 10) score -= 10
  else if (storage.avgLedgerWrites > 6) score -= 5

  // Reward optimization coverage (max +15 points)
  score += Math.round(optimizationCoverage * 15)

  // Penalize fee spikes (max -15 points)
  const spikyOps = operations.filter((o) => {
    if (!o.p50FeeStroops || !o.p95FeeStroops) return false
    return Number(o.p95FeeStroops) / Number(o.p50FeeStroops) > 3
  })
  score -= Math.min(15, spikyOps.length * 5)

  return Math.max(0, Math.min(100, score))
}

// ─────────────────────────────────────────────────────────────────────────────
// Main report generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a comprehensive fee efficiency report.
 * This is the primary entry point for the analytics API.
 */
export async function generateFeeEfficiencyReport(): Promise<FeeEfficiencyReport> {
  const [operations, storage, dailyTrend, totalRows] = await Promise.all([
    getOperationCostBreakdown(),
    getStorageUsageSummary(),
    getDailyFeeTrend(30),
    sql<TotalRow[]>`
      SELECT
        COUNT(*)::text                                          AS total_txs,
        COALESCE(SUM(total_fee_stroops), 0)::text              AS total_fees,
        COALESCE(SUM(savings_stroops), 0)::text                AS total_savings,
        COUNT(*) FILTER (
          WHERE array_length(optimization_applied, 1) > 0
        )::text                                                AS optimized_txs
      FROM transaction_fees
    `,
  ])

  const totals = totalRows[0] ?? {
    total_txs: '0',
    total_fees: '0',
    total_savings: '0',
    optimized_txs: '0',
  }

  const totalTxs = parseInt(totals.total_txs, 10)
  const totalFeesXlm = stroopsToXlm(BigInt(totals.total_fees))
  const totalSavingsXlm = stroopsToXlm(BigInt(totals.total_savings))
  const optimizedTxs = parseInt(totals.optimized_txs, 10)
  const optimizationCoverage = totalTxs > 0 ? optimizedTxs / totalTxs : 0

  const recommendations = buildRecommendations(operations, storage, totalTxs)
  const efficiencyScore = computeEfficiencyScore(operations, storage, optimizationCoverage)

  return {
    efficiencyScore,
    totalTransactions: totalTxs,
    totalFeesXlm,
    totalSavingsXlm,
    optimizationCoverage,
    operationBreakdown: operations,
    storageUsage: storage,
    dailyTrend,
    recommendations,
    generatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract-level fee history
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the complete fee history for a specific contract.
 */
export async function getContractFeeHistory(contractId: number): Promise<ContractFeeHistory> {
  const rows = await sql<{
    operation_type: FeeOperationType
    total_fee_stroops: string
    submitted_at: string
    stellar_tx_hash: string
  }[]>`
    SELECT
      operation_type,
      total_fee_stroops::text,
      submitted_at,
      stellar_tx_hash
    FROM transaction_fees
    WHERE contract_id = ${contractId}
    ORDER BY submitted_at ASC
  `

  const totalFeesStroops = rows.reduce(
    (sum, r) => sum + BigInt(r.total_fee_stroops),
    0n
  )

  return {
    contractId,
    totalFeesXlm: stroopsToXlm(totalFeesStroops),
    txCount: rows.length,
    operations: rows.map((r) => ({
      operationType: r.operation_type,
      feeXlm: stroopsToXlm(BigInt(r.total_fee_stroops)),
      submittedAt: r.submitted_at,
      stellarTxHash: r.stellar_tx_hash,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordFeeParams {
  stellarTxHash: string
  operationType: FeeOperationType
  contractId?: number | null
  jobId?: number | null
  milestoneId?: number | null
  baseFeeStroops: bigint
  resourceFeeStroops: bigint
  totalFeeStroops: bigint
  totalFeeXlm: number
  cpuInstructions?: bigint | null
  memoryBytes?: bigint | null
  ledgerReads?: number | null
  ledgerWrites?: number | null
  readBytes?: bigint | null
  writeBytes?: bigint | null
  eventsSizeBytes?: bigint | null
  transactionSizeBytes?: bigint | null
  estimatedFeeStroops?: bigint | null
  ledgerSequence?: bigint | null
  networkPassphrase?: string | null
  optimizationApplied?: string[]
  savingsStroops?: bigint
}

/**
 * Persists a fee record to the database.
 * Safe to call multiple times for the same tx hash (upsert on conflict).
 */
export async function recordTransactionFee(params: RecordFeeParams): Promise<void> {
  const feeAccuracyPct =
    params.estimatedFeeStroops && params.estimatedFeeStroops > 0n
      ? (Number(params.totalFeeStroops) / Number(params.estimatedFeeStroops)) * 100
      : null

  await sql`
    INSERT INTO transaction_fees (
      stellar_tx_hash,
      operation_type,
      contract_id,
      job_id,
      milestone_id,
      base_fee_stroops,
      resource_fee_stroops,
      total_fee_stroops,
      total_fee_xlm,
      cpu_instructions,
      memory_bytes,
      ledger_reads,
      ledger_writes,
      read_bytes,
      write_bytes,
      events_size_bytes,
      transaction_size_bytes,
      estimated_fee_stroops,
      fee_accuracy_pct,
      ledger_sequence,
      network_passphrase,
      optimization_applied,
      savings_stroops
    )
    VALUES (
      ${params.stellarTxHash},
      ${params.operationType},
      ${params.contractId ?? null},
      ${params.jobId ?? null},
      ${params.milestoneId ?? null},
      ${params.baseFeeStroops.toString()},
      ${params.resourceFeeStroops.toString()},
      ${params.totalFeeStroops.toString()},
      ${params.totalFeeXlm},
      ${params.cpuInstructions?.toString() ?? null},
      ${params.memoryBytes?.toString() ?? null},
      ${params.ledgerReads ?? null},
      ${params.ledgerWrites ?? null},
      ${params.readBytes?.toString() ?? null},
      ${params.writeBytes?.toString() ?? null},
      ${params.eventsSizeBytes?.toString() ?? null},
      ${params.transactionSizeBytes?.toString() ?? null},
      ${params.estimatedFeeStroops?.toString() ?? null},
      ${feeAccuracyPct},
      ${params.ledgerSequence?.toString() ?? null},
      ${params.networkPassphrase ?? null},
      ${params.optimizationApplied ?? []},
      ${(params.savingsStroops ?? 0n).toString()}
    )
    ON CONFLICT (stellar_tx_hash) DO UPDATE SET
      optimization_applied = EXCLUDED.optimization_applied,
      savings_stroops      = EXCLUDED.savings_stroops,
      fee_accuracy_pct     = EXCLUDED.fee_accuracy_pct
  `
}

/**
 * Persists a pre-submission fee estimate.
 */
export async function recordFeeEstimate(params: {
  contractId?: number | null
  jobId?: number | null
  operationType: FeeOperationType
  estimatedCpu?: bigint | null
  estimatedMemory?: bigint | null
  estimatedLedgerReads?: number | null
  estimatedLedgerWrites?: number | null
  estimatedReadBytes?: bigint | null
  estimatedWriteBytes?: bigint | null
  minFeeStroops: bigint
  recommendedFeeStroops: bigint
  maxFeeStroops: bigint
  optimizationHints: unknown[]
  networkPassphrase?: string | null
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO fee_estimates (
      contract_id,
      job_id,
      operation_type,
      estimated_cpu,
      estimated_memory,
      estimated_ledger_reads,
      estimated_ledger_writes,
      estimated_read_bytes,
      estimated_write_bytes,
      min_fee_stroops,
      recommended_fee_stroops,
      max_fee_stroops,
      optimization_hints,
      network_passphrase
    )
    VALUES (
      ${params.contractId ?? null},
      ${params.jobId ?? null},
      ${params.operationType},
      ${params.estimatedCpu?.toString() ?? null},
      ${params.estimatedMemory?.toString() ?? null},
      ${params.estimatedLedgerReads ?? null},
      ${params.estimatedLedgerWrites ?? null},
      ${params.estimatedReadBytes?.toString() ?? null},
      ${params.estimatedWriteBytes?.toString() ?? null},
      ${params.minFeeStroops.toString()},
      ${params.recommendedFeeStroops.toString()},
      ${params.maxFeeStroops.toString()},
      ${JSON.stringify(params.optimizationHints)},
      ${params.networkPassphrase ?? null}
    )
    RETURNING id
  `
  return rows[0].id
}
