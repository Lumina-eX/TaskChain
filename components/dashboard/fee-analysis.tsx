'use client'

/**
 * Fee Analysis Dashboard Component
 *
 * Displays gas/fee analytics for the platform (admin) or a user's own
 * contracts. Shows:
 *  - Efficiency score gauge
 *  - Total fees paid and savings achieved
 *  - Per-operation cost breakdown table
 *  - Daily fee trend chart
 *  - Storage usage summary
 *  - Actionable optimization recommendations
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import {
  TrendingDown,
  Zap,
  Database,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors API response shape)
// ─────────────────────────────────────────────────────────────────────────────

interface OperationBreakdown {
  operationType: string
  txCount: number
  avgFeeXlm: number
  minFeeStroops: string
  maxFeeStroops: string
  p50FeeStroops: string | null
  p95FeeStroops: string | null
  totalFeesXlm: number
  avgCpuInstructions: string | null
  avgWriteBytes: string | null
  totalSavingsStroops: string
}

interface DailyTrend {
  period: string
  avgFeeXlm: number
  txCount: number
  totalFeesXlm: number
}

interface StorageUsage {
  avgWriteBytes: number
  avgReadBytes: number
  avgLedgerWrites: number
  avgLedgerReads: number
  totalWriteBytes: number
  estimatedStorageCostStroops: string
  topWriteOperations: Array<{
    operationType: string
    avgWriteBytes: number
    txCount: number
  }>
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  estimatedSavingsXlm: number
}

interface FullReport {
  efficiencyScore: number
  totalTransactions: number
  totalFeesXlm: number
  totalSavingsXlm: number
  optimizationCoverage: number
  operationBreakdown: OperationBreakdown[]
  storageUsage: StorageUsage
  dailyTrend: DailyTrend[]
  recommendations: Recommendation[]
  generatedAt: string
}

interface UserSummary {
  totalTransactions: number
  totalFeesXlm: number
  totalSavingsXlm: number
  dailyTrend: DailyTrend[]
  trendDays: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatXlm(xlm: number): string {
  if (xlm === 0) return '0 XLM'
  if (xlm < 0.0001) return `${(xlm * 10_000_000).toFixed(0)} stroops`
  return `${xlm.toFixed(5)} XLM`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatOpType(op: string): string {
  return op.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-500'
  if (score >= 60) return 'text-yellow-500'
  return 'text-red-500'
}

function priorityBadgeVariant(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') return 'destructive' as const
  if (priority === 'medium') return 'secondary' as const
  return 'outline' as const
}

function RecommendationIcon({ priority }: { priority: string }) {
  if (priority === 'high') return <AlertTriangle className="h-4 w-4 text-red-500" />
  if (priority === 'medium') return <Info className="h-4 w-4 text-yellow-500" />
  return <CheckCircle className="h-4 w-4 text-green-500" />
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EfficiencyScoreCard({ score }: { score: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Efficiency Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-4xl font-bold ${scoreColor(score)}`}>{score}</div>
        <div className="text-xs text-muted-foreground mt-1">out of 100</div>
        <Progress value={score} className="mt-3 h-2" />
        <div className="text-xs text-muted-foreground mt-2">
          {score >= 80
            ? 'Excellent — contract storage and fees are well optimized.'
            : score >= 60
            ? 'Good — some optimization opportunities remain.'
            : 'Needs attention — significant savings possible.'}
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  )
}

function OperationBreakdownTable({ operations }: { operations: OperationBreakdown[] }) {
  if (operations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No transaction data yet. Fees will appear here after contracts are deployed.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 pr-4 font-medium">Operation</th>
            <th className="text-right py-2 pr-4 font-medium">Txs</th>
            <th className="text-right py-2 pr-4 font-medium">Avg Fee</th>
            <th className="text-right py-2 pr-4 font-medium">P50</th>
            <th className="text-right py-2 pr-4 font-medium">P95</th>
            <th className="text-right py-2 font-medium">Total Fees</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.operationType} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-2 pr-4 font-medium">{formatOpType(op.operationType)}</td>
              <td className="text-right py-2 pr-4 tabular-nums">{op.txCount}</td>
              <td className="text-right py-2 pr-4 tabular-nums">{formatXlm(op.avgFeeXlm)}</td>
              <td className="text-right py-2 pr-4 tabular-nums text-muted-foreground">
                {op.p50FeeStroops
                  ? formatXlm(Number(op.p50FeeStroops) / 10_000_000)
                  : '—'}
              </td>
              <td className="text-right py-2 pr-4 tabular-nums text-muted-foreground">
                {op.p95FeeStroops
                  ? formatXlm(Number(op.p95FeeStroops) / 10_000_000)
                  : '—'}
              </td>
              <td className="text-right py-2 tabular-nums">{formatXlm(op.totalFeesXlm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DailyTrendChart({ data }: { data: DailyTrend[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No trend data available yet.
      </div>
    )
  }

  const chartData = data.map((d) => ({
    date: new Date(d.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    avgFee: parseFloat(d.avgFeeXlm.toFixed(6)),
    txCount: d.txCount,
    totalFees: parseFloat(d.totalFeesXlm.toFixed(6)),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(4)}`}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(6)} XLM`, 'Avg Fee']}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="avgFee"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function StorageUsageCard({ storage }: { storage: StorageUsage }) {
  const WRITE_BYTES_WARN = 8192
  const writeStatus =
    storage.avgWriteBytes > WRITE_BYTES_WARN * 4
      ? 'critical'
      : storage.avgWriteBytes > WRITE_BYTES_WARN
      ? 'warning'
      : 'good'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Avg Write Bytes</div>
          <div
            className={`font-semibold ${
              writeStatus === 'critical'
                ? 'text-red-500'
                : writeStatus === 'warning'
                ? 'text-yellow-500'
                : 'text-green-500'
            }`}
          >
            {formatBytes(storage.avgWriteBytes)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg Read Bytes</div>
          <div className="font-semibold">{formatBytes(storage.avgReadBytes)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg Ledger Writes</div>
          <div
            className={`font-semibold ${
              storage.avgLedgerWrites > 10 ? 'text-yellow-500' : ''
            }`}
          >
            {storage.avgLedgerWrites.toFixed(1)} entries
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg Ledger Reads</div>
          <div className="font-semibold">{storage.avgLedgerReads.toFixed(1)} entries</div>
        </div>
      </div>

      {storage.topWriteOperations.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Top Write Operations
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart
              data={storage.topWriteOperations.map((op) => ({
                name: formatOpType(op.operationType).split(' ').slice(0, 2).join(' '),
                bytes: op.avgWriteBytes,
              }))}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatBytes(v)}
              />
              <Tooltip
                formatter={(v: number) => [formatBytes(v), 'Avg Write Bytes']}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="bytes" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function RecommendationsList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle className="h-4 w-4" />
        No optimization issues detected. Keep up the good work!
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg border bg-muted/20">
          <RecommendationIcon priority={rec.priority} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{rec.title}</span>
              <Badge variant={priorityBadgeVariant(rec.priority)} className="text-xs">
                {rec.priority}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {rec.category.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {rec.description}
            </p>
            {rec.estimatedSavingsXlm > 0 && (
              <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                Est. savings: {formatXlm(rec.estimatedSavingsXlm)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface FeeAnalysisProps {
  /** When true, shows the full admin report. When false, shows user summary. */
  isAdmin?: boolean
  /** Scope to a specific contract (optional). */
  contractId?: number
}

export function FeeAnalysis({ isAdmin = false, contractId }: FeeAnalysisProps) {
  const [report, setReport] = useState<FullReport | null>(null)
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = contractId
        ? `/api/gas/analytics?contractId=${contractId}`
        : '/api/gas/analytics'

      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const json = await res.json()
      if (json.type === 'full_report') {
        setReport(json.data as FullReport)
      } else if (json.type === 'user_summary') {
        setUserSummary(json.data as UserSummary)
      }
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fee analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="h-24 animate-pulse bg-muted/30 rounded-lg mt-4" />
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── User summary view ─────────────────────────────────────────────────────
  if (userSummary && !report) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transaction Fees</h2>
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Transactions"
            value={userSummary.totalTransactions.toString()}
            icon={Zap}
          />
          <StatCard
            title="Total Fees Paid"
            value={formatXlm(userSummary.totalFeesXlm)}
            subtitle="across all contracts"
            icon={TrendingDown}
          />
          <StatCard
            title="Savings Achieved"
            value={formatXlm(userSummary.totalSavingsXlm)}
            subtitle="via optimization"
            icon={CheckCircle}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Daily Fee Trend (last {userSummary.trendDays} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart data={userSummary.dailyTrend} />
          </CardContent>
        </Card>

        {lastRefreshed && (
          <div className="text-xs text-muted-foreground text-right">
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </div>
        )}
      </div>
    )
  }

  // ── Full admin report view ────────────────────────────────────────────────
  if (!report) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gas & Fee Analytics</h2>
        <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1">
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <EfficiencyScoreCard score={report.efficiencyScore} />
        <StatCard
          title="Total Transactions"
          value={report.totalTransactions.toString()}
          subtitle={`${(report.optimizationCoverage * 100).toFixed(0)}% optimized`}
          icon={Zap}
        />
        <StatCard
          title="Total Fees Paid"
          value={formatXlm(report.totalFeesXlm)}
          subtitle="all operations"
          icon={TrendingDown}
        />
        <StatCard
          title="Total Savings"
          value={formatXlm(report.totalSavingsXlm)}
          subtitle="via gas optimization"
          icon={CheckCircle}
        />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Average Fee Trend (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyTrendChart data={report.dailyTrend} />
        </CardContent>
      </Card>

      {/* Operation breakdown + storage side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Cost by Operation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OperationBreakdownTable operations={report.operationBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StorageUsageCard storage={report.storageUsage} />
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Optimization Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationsList recommendations={report.recommendations} />
        </CardContent>
      </Card>

      {lastRefreshed && (
        <div className="text-xs text-muted-foreground text-right">
          Generated: {new Date(report.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee Estimate Preview (shown before contract deployment)
// ─────────────────────────────────────────────────────────────────────────────

interface FeeEstimatePreviewProps {
  totalAmount: string
  milestoneCount?: number
  jobId?: number
}

interface FeeEstimateData {
  minFeeXlm: number
  recommendedFeeXlm: number
  maxFeeXlm: number
  optimizationHints: Array<{
    category: string
    severity: string
    message: string
    estimatedSavingsXlm: number
  }>
  estimatedSavingsXlm: number
  simulationMode: 'live' | 'static'
  simulatedAt: string
}

export function FeeEstimatePreview({
  totalAmount,
  milestoneCount = 0,
  jobId,
}: FeeEstimatePreviewProps) {
  const [estimate, setEstimate] = useState<FeeEstimateData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!totalAmount || Number(totalAmount) <= 0) return

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/contracts/fee-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalAmount, milestoneCount, jobId }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setEstimate(data as FeeEstimateData)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message ?? 'Failed to estimate fees')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [totalAmount, milestoneCount, jobId])

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground animate-pulse">
        Estimating deployment fee…
      </div>
    )
  }

  if (error || !estimate) return null

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
          Estimated Deployment Fee
        </span>
        {estimate.simulationMode === 'live' ? (
          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
            Live simulation
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            Static estimate
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-muted-foreground">Min</div>
          <div className="font-mono text-xs">{formatXlm(estimate.minFeeXlm)}</div>
        </div>
        <div className="border-x">
          <div className="text-xs text-muted-foreground">Recommended</div>
          <div className="font-mono text-xs font-semibold">{formatXlm(estimate.recommendedFeeXlm)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Max</div>
          <div className="font-mono text-xs">{formatXlm(estimate.maxFeeXlm)}</div>
        </div>
      </div>

      {estimate.optimizationHints.length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          {estimate.optimizationHints.slice(0, 2).map((hint, i) => (
            <div key={i} className="flex gap-1.5 text-xs text-muted-foreground">
              {hint.severity === 'warning' || hint.severity === 'critical' ? (
                <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
              )}
              <span>{hint.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
