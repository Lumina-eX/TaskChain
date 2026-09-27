'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Banknote,
  CalendarRange,
  CheckCircle2,
  Loader2,
  Shield,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  formatMoney,
  type DateRangePreset,
  type EarningsAnalytics,
} from '@/lib/freelancer-earnings'
import { cn } from '@/lib/utils'

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'All time' },
]

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border/60 bg-card/40 p-5">
      <div className="mb-3 h-3 w-24 rounded bg-muted" />
      <div className="h-7 w-32 rounded bg-muted" />
      <div className="mt-2 h-3 w-40 rounded bg-muted" />
    </div>
  )
}

function SummaryCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string
  value: string
  helper: string
  icon: ReactNode
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-card/60 p-5 shadow-lg shadow-black/10 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </article>
  )
}

function statusClass(status: string): string {
  if (status === 'confirmed') return 'bg-emerald-500/20 text-emerald-300'
  if (status === 'failed') return 'bg-rose-500/20 text-rose-300'
  return 'bg-amber-500/20 text-amber-300'
}

export function EarningsAnalyticsDashboard() {
  const [preset, setPreset] = useState<DateRangePreset>('30d')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<EarningsAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        preset,
        page: String(page),
        pageSize: '8',
      })
      const res = await fetch(`/api/freelancer/earnings?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Please sign in to view your earnings analytics.')
        }
        throw new Error('Unable to load earnings analytics right now.')
      }
      const json = (await res.json()) as { data: EarningsAnalytics }
      setData(json.data)
    } catch (err) {
      setData(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load earnings analytics right now.',
      )
    } finally {
      setLoading(false)
    }
  }, [preset, page])

  useEffect(() => {
    void load()
  }, [load])

  const currency = data?.summary.currency ?? 'USDC'
  const chartData = useMemo(() => data?.monthly ?? [], [data])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">
            Earnings & Payment Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Track total earnings, pending escrow, released payments, and monthly
            trends for your freelance contracts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range filters">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {PRESET_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={preset === opt.value ? 'default' : 'outline'}
              className={cn(
                'text-xs',
                preset === opt.value && 'bg-primary text-primary-foreground',
              )}
              onClick={() => {
                setPage(1)
                setPreset(opt.value)
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading earnings…
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="h-72 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4" />
            <p>{error}</p>
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!loading && !error && data?.empty ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
          <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">No transactions yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Once escrow deposits or milestone releases land for your contracts,
            they will show up here with charts and a full history.
          </p>
        </div>
      ) : null}

      {!loading && !error && data && !data.empty ? (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Total Earnings"
              value={formatMoney(data.summary.totalEarnings, currency)}
              helper="Cumulative released payments"
              icon={<Banknote className="size-4" />}
            />
            <SummaryCard
              title="Pending Escrow"
              value={formatMoney(data.summary.pendingEscrow, currency)}
              helper="Funds held awaiting release"
              icon={<Shield className="size-4" />}
            />
            <SummaryCard
              title="Released Payments"
              value={formatMoney(data.summary.releasedPayments, currency)}
              helper="Successfully transferred to you"
              icon={<Wallet className="size-4" />}
            />
            <SummaryCard
              title="Completed Contracts"
              value={String(data.summary.completedContracts)}
              helper="Contracts finalized with payment"
              icon={<CheckCircle2 className="size-4" />}
            />
          </section>

          <section className="mb-8 rounded-2xl border border-border/70 bg-card/50 p-5">
            <h2 className="text-lg font-semibold text-foreground">Monthly earnings</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Released vs pending amounts over the last six months.
            </p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value, currency)}
                  />
                  <Legend />
                  <Bar dataKey="released" name="Released" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/50 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Transaction history</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.pagination.total} transaction
                  {data.pagination.total === 1 ? '' : 's'} in selected range
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {data.pagination.page} / {data.pagination.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border/60 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Contract</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/40">
                      <td className="px-2 py-3 text-muted-foreground">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }).format(new Date(tx.occurredAt))}
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-foreground">{tx.contractTitle}</div>
                        <div className="text-xs text-muted-foreground">{tx.contractId}</div>
                      </td>
                      <td className="px-2 py-3 capitalize text-muted-foreground">
                        {tx.type.replace('_', ' ')}
                      </td>
                      <td className="px-2 py-3 font-medium">
                        {formatMoney(tx.amount, tx.currency)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs capitalize',
                            statusClass(tx.status),
                          )}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
