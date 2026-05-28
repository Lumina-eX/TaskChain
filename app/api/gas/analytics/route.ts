/**
 * GET /api/gas/analytics
 *
 * Returns a comprehensive gas/fee efficiency report for the platform.
 * Includes per-operation cost breakdowns, storage usage analysis,
 * daily fee trends, and actionable optimization recommendations.
 *
 * Query params:
 *   ?contractId=<id>  — scope to a specific contract (optional)
 *   ?days=<n>         — trend window in days (default: 30, max: 90)
 *
 * Auth: admin only (full report) or authenticated user (own contracts only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import {
  generateFeeEfficiencyReport,
  getContractFeeHistory,
  getOperationCostBreakdown,
  getDailyFeeTrend,
} from '@/lib/gas/analyzer'
import { sql } from '@/lib/db'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const { searchParams } = new URL(request.url)
  const contractIdParam = searchParams.get('contractId')
  const daysParam = searchParams.get('days')

  const days = Math.min(
    90,
    Math.max(1, parseInt(daysParam ?? '30', 10) || 30)
  )

  // ── Contract-scoped fee history ───────────────────────────────────────────
  if (contractIdParam) {
    const contractId = parseInt(contractIdParam, 10)
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json(
        { error: 'contractId must be a positive integer', code: 'INVALID_CONTRACT_ID' },
        { status: 400 }
      )
    }

    // Verify the requesting user owns this contract (or is admin)
    const isAdmin = auth.role === 'admin'
    if (!isAdmin) {
      const rows = await sql<{ id: number }[]>`
        SELECT c.id
          FROM contracts c
          JOIN users u ON (c.client_id = u.id OR c.freelancer_id = u.id)
         WHERE c.id = ${contractId}
           AND u.wallet_address = ${auth.walletAddress}
         LIMIT 1
      `
      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Contract not found or access denied', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }
    }

    try {
      const history = await getContractFeeHistory(contractId)
      return NextResponse.json({
        type: 'contract_fee_history',
        data: {
          ...history,
          operations: history.operations.map((op) => ({
            ...op,
            // Ensure dates are ISO strings
            submittedAt: new Date(op.submittedAt).toISOString(),
          })),
        },
      })
    } catch (err) {
      console.error('[gas/analytics] Contract fee history error:', err)
      return NextResponse.json(
        { error: 'Failed to retrieve contract fee history', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }

  // ── Full platform report (admin) or summary (authenticated user) ──────────
  const isAdmin = auth.role === 'admin'

  try {
    if (isAdmin) {
      // Full report with all analytics
      const report = await generateFeeEfficiencyReport()

      return NextResponse.json({
        type: 'full_report',
        data: {
          efficiencyScore: report.efficiencyScore,
          totalTransactions: report.totalTransactions,
          totalFeesXlm: report.totalFeesXlm,
          totalSavingsXlm: report.totalSavingsXlm,
          optimizationCoverage: report.optimizationCoverage,
          operationBreakdown: report.operationBreakdown.map(serializeOperation),
          storageUsage: {
            ...report.storageUsage,
            estimatedStorageCostStroops:
              report.storageUsage.estimatedStorageCostStroops.toString(),
          },
          dailyTrend: report.dailyTrend.map(serializeTrend),
          recommendations: report.recommendations,
          generatedAt: report.generatedAt,
        },
      })
    } else {
      // Non-admin: return only their own contract fee summary
      const walletAddress = auth.walletAddress

      const userFeeRows = await sql<{
        total_fees: string
        tx_count: string
        total_savings: string
      }[]>`
        SELECT
          COALESCE(SUM(tf.total_fee_stroops), 0)::text  AS total_fees,
          COUNT(tf.id)::text                            AS tx_count,
          COALESCE(SUM(tf.savings_stroops), 0)::text    AS total_savings
        FROM transaction_fees tf
        JOIN contracts c ON tf.contract_id = c.id
        JOIN users u ON (c.client_id = u.id OR c.freelancer_id = u.id)
        WHERE u.wallet_address = ${walletAddress}
      `

      const userTrend = await sql<{
        period: string
        avg_fee: string
        tx_count: string
        total_fees: string
      }[]>`
        SELECT
          DATE_TRUNC('day', tf.submitted_at)::text  AS period,
          AVG(tf.total_fee_stroops)::bigint::text   AS avg_fee,
          COUNT(tf.id)::text                        AS tx_count,
          SUM(tf.total_fee_stroops)::text           AS total_fees
        FROM transaction_fees tf
        JOIN contracts c ON tf.contract_id = c.id
        JOIN users u ON (c.client_id = u.id OR c.freelancer_id = u.id)
        WHERE u.wallet_address = ${walletAddress}
          AND tf.submitted_at >= NOW() - (${days} || ' days')::INTERVAL
        GROUP BY DATE_TRUNC('day', tf.submitted_at)
        ORDER BY period ASC
      `

      const totals = userFeeRows[0] ?? { total_fees: '0', tx_count: '0', total_savings: '0' }
      const { stroopsToXlm } = await import('@/lib/soroban/feeEstimator')

      return NextResponse.json({
        type: 'user_summary',
        data: {
          totalTransactions: parseInt(totals.tx_count, 10),
          totalFeesXlm: stroopsToXlm(BigInt(totals.total_fees)),
          totalSavingsXlm: stroopsToXlm(BigInt(totals.total_savings)),
          dailyTrend: userTrend.map((r) => ({
            period: r.period,
            avgFeeXlm: stroopsToXlm(BigInt(r.avg_fee)),
            txCount: parseInt(r.tx_count, 10),
            totalFeesXlm: stroopsToXlm(BigInt(r.total_fees)),
          })),
          trendDays: days,
        },
      })
    }
  } catch (err) {
    console.error('[gas/analytics] Report generation error:', err)
    return NextResponse.json(
      { error: 'Failed to generate fee analytics', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers (BigInt → string for JSON)
// ─────────────────────────────────────────────────────────────────────────────

function serializeOperation(op: {
  operationType: string
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
}) {
  return {
    operationType: op.operationType,
    txCount: op.txCount,
    avgFeeStroops: op.avgFeeStroops.toString(),
    avgFeeXlm: op.avgFeeXlm,
    minFeeStroops: op.minFeeStroops.toString(),
    maxFeeStroops: op.maxFeeStroops.toString(),
    p50FeeStroops: op.p50FeeStroops?.toString() ?? null,
    p95FeeStroops: op.p95FeeStroops?.toString() ?? null,
    totalFeesStroops: op.totalFeesStroops.toString(),
    totalFeesXlm: op.totalFeesXlm,
    avgCpuInstructions: op.avgCpuInstructions?.toString() ?? null,
    avgWriteBytes: op.avgWriteBytes?.toString() ?? null,
    totalSavingsStroops: op.totalSavingsStroops.toString(),
  }
}

function serializeTrend(t: {
  period: string
  avgFeeStroops: bigint
  avgFeeXlm: number
  txCount: number
  totalFeesXlm: number
}) {
  return {
    period: t.period,
    avgFeeStroops: t.avgFeeStroops.toString(),
    avgFeeXlm: t.avgFeeXlm,
    txCount: t.txCount,
    totalFeesXlm: t.totalFeesXlm,
  }
}
