/**
 * Freelancer Earnings & Payment Analytics
 *
 * Pure aggregation helpers plus optional DB-backed fetch for the
 * authenticated freelancer earnings dashboard (issue #214).
 */

import { sql } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/cache'

export type DateRangePreset = '7d' | '30d' | 'ytd' | 'all' | 'custom'

export type EarningsTxType = 'released' | 'escrow_held' | 'pending' | 'refund'

export interface EarningsTransaction {
  id: string
  contractId: string
  contractTitle: string
  type: EarningsTxType
  amount: number
  currency: string
  status: 'confirmed' | 'pending' | 'failed'
  occurredAt: string
  txHash?: string | null
}

export interface MonthlyEarning {
  month: string
  label: string
  released: number
  pending: number
}

export interface EarningsSummary {
  totalEarnings: number
  pendingEscrow: number
  releasedPayments: number
  completedContracts: number
  currency: string
}

export interface EarningsAnalytics {
  summary: EarningsSummary
  monthly: MonthlyEarning[]
  transactions: EarningsTransaction[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  range: {
    from: string | null
    to: string | null
    preset: DateRangePreset
  }
  generatedAt: string
  empty: boolean
}

export interface DateRange {
  from: Date | null
  to: Date | null
  preset: DateRangePreset
}

const CACHE_TTL_MS = 60_000

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Format an amount with currency symbol and decimal precision. */
export function formatMoney(
  amount: number,
  currency = 'USD',
  options?: { maximumFractionDigits?: number },
): string {
  const maximumFractionDigits =
    options?.maximumFractionDigits ?? (Number.isInteger(amount) ? 0 : 2)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'USDC' || currency === 'XLM' ? 'USD' : currency,
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(maximumFractionDigits)}`
  }
}

/** Resolve a preset / custom range into absolute Date bounds (inclusive). */
export function resolveDateRange(
  preset: DateRangePreset,
  fromIso?: string | null,
  toIso?: string | null,
  now: Date = new Date(),
): DateRange {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  if (preset === 'custom') {
    const from = fromIso ? new Date(fromIso) : null
    const to = toIso ? new Date(toIso) : end
    if (from && !Number.isNaN(from.getTime())) from.setHours(0, 0, 0, 0)
    if (to && !Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999)
    return { from, to, preset }
  }

  if (preset === 'all') {
    return { from: null, to: null, preset }
  }

  const from = new Date(end)
  from.setHours(0, 0, 0, 0)

  if (preset === '7d') {
    from.setDate(from.getDate() - 6)
  } else if (preset === '30d') {
    from.setDate(from.getDate() - 29)
  } else if (preset === 'ytd') {
    from.setMonth(0, 1)
  }

  return { from, to: end, preset }
}

export function isWithinRange(
  isoDate: string,
  range: DateRange,
): boolean {
  const t = new Date(isoDate).getTime()
  if (Number.isNaN(t)) return false
  if (range.from && t < range.from.getTime()) return false
  if (range.to && t > range.to.getTime()) return false
  return true
}

export function filterTransactions(
  transactions: EarningsTransaction[],
  range: DateRange,
): EarningsTransaction[] {
  return transactions
    .filter((tx) => isWithinRange(tx.occurredAt, range))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
}

export function buildMonthlySeries(
  transactions: EarningsTransaction[],
  range: DateRange,
  now: Date = new Date(),
): MonthlyEarning[] {
  const months: MonthlyEarning[] = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1)

  // Always show last 6 calendar months for a stable chart axis.
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({
      month: key,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      released: 0,
      pending: 0,
    })
  }

  const index = new Map(months.map((m) => [m.month, m]))

  for (const tx of transactions) {
    if (!isWithinRange(tx.occurredAt, range) && range.preset !== 'all') {
      // Still attribute to monthly buckets when preset is all;
      // for bounded ranges, only count in-range txs.
    }
    if (range.preset !== 'all' && !isWithinRange(tx.occurredAt, range)) continue

    const d = new Date(tx.occurredAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = index.get(key)
    if (!bucket) continue

    if (tx.type === 'released' && tx.status === 'confirmed') {
      bucket.released += tx.amount
    } else if (
      (tx.type === 'escrow_held' || tx.type === 'pending') &&
      tx.status !== 'failed'
    ) {
      bucket.pending += tx.amount
    }
  }

  return months
}

export function summarizeEarnings(
  transactions: EarningsTransaction[],
  completedContractIds: Set<string>,
  currency = 'USDC',
): EarningsSummary {
  let totalEarnings = 0
  let pendingEscrow = 0
  let releasedPayments = 0

  for (const tx of transactions) {
    if (tx.type === 'released' && tx.status === 'confirmed') {
      totalEarnings += tx.amount
      releasedPayments += tx.amount
    } else if (
      (tx.type === 'escrow_held' || tx.type === 'pending') &&
      tx.status !== 'failed'
    ) {
      pendingEscrow += tx.amount
    }
  }

  return {
    totalEarnings: round2(totalEarnings),
    pendingEscrow: round2(pendingEscrow),
    releasedPayments: round2(releasedPayments),
    completedContracts: completedContractIds.size,
    currency,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function paginateTransactions(
  transactions: EarningsTransaction[],
  page: number,
  pageSize: number,
): {
  items: EarningsTransaction[]
  page: number
  pageSize: number
  total: number
  totalPages: number
} {
  const safePage = Math.max(1, page)
  const safeSize = Math.min(50, Math.max(1, pageSize))
  const total = transactions.length
  const totalPages = Math.max(1, Math.ceil(total / safeSize) || 1)
  const offset = (safePage - 1) * safeSize
  return {
    items: transactions.slice(offset, offset + safeSize),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  }
}

/** Build a full analytics payload from raw transactions + completed contract ids. */
export function buildEarningsAnalytics(params: {
  transactions: EarningsTransaction[]
  completedContractIds: string[]
  preset?: DateRangePreset
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
  currency?: string
  now?: Date
}): EarningsAnalytics {
  const now = params.now ?? new Date()
  const preset = params.preset ?? '30d'
  const range = resolveDateRange(preset, params.from, params.to, now)
  const filtered = filterTransactions(params.transactions, range)
  const completedInRange = new Set(
    params.completedContractIds.filter((id) => {
      const related = params.transactions.find((t) => t.contractId === id)
      if (!related) return true
      return isWithinRange(related.occurredAt, range) || range.preset === 'all'
    }),
  )
  // Prefer counting completed contracts that appear via released txs in range.
  for (const tx of filtered) {
    if (tx.type === 'released' && tx.status === 'confirmed') {
      completedInRange.add(tx.contractId)
    }
  }

  const summary = summarizeEarnings(
    filtered,
    completedInRange,
    params.currency ?? 'USDC',
  )
  const monthly = buildMonthlySeries(params.transactions, range, now)
  const page = paginateTransactions(
    filtered,
    params.page ?? 1,
    params.pageSize ?? 10,
  )

  return {
    summary,
    monthly,
    transactions: page.items,
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages,
    },
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to ? range.to.toISOString() : null,
      preset: range.preset,
    },
    generatedAt: now.toISOString(),
    empty: filtered.length === 0,
  }
}

/** Demo seed used when DB is unavailable (mirrors other TaskChain stubs). */
export function getDemoEarningsTransactions(now: Date = new Date()): {
  transactions: EarningsTransaction[]
  completedContractIds: string[]
} {
  const day = (offset: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    return d.toISOString()
  }

  const transactions: EarningsTransaction[] = [
    {
      id: 'earn-1',
      contractId: 'c-101',
      contractTitle: 'Analytics Dashboard',
      type: 'released',
      amount: 2200,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-45),
      txHash: '0xa1',
    },
    {
      id: 'earn-2',
      contractId: 'c-102',
      contractTitle: 'API Integration',
      type: 'released',
      amount: 1200,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-32),
      txHash: '0xa2',
    },
    {
      id: 'earn-3',
      contractId: 'c-103',
      contractTitle: 'Marketing Site Redesign',
      type: 'escrow_held',
      amount: 900,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-12),
      txHash: '0xa3',
    },
    {
      id: 'earn-4',
      contractId: 'c-104',
      contractTitle: 'Mobile App QA Audit',
      type: 'pending',
      amount: 950,
      currency: 'USDC',
      status: 'pending',
      occurredAt: day(-5),
      txHash: null,
    },
    {
      id: 'earn-5',
      contractId: 'c-105',
      contractTitle: 'Brand Identity Kit',
      type: 'released',
      amount: 1800,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-18),
      txHash: '0xa5',
    },
    {
      id: 'earn-6',
      contractId: 'c-106',
      contractTitle: 'Smart Contract Audit',
      type: 'released',
      amount: 3500,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-8),
      txHash: '0xa6',
    },
    {
      id: 'earn-7',
      contractId: 'c-107',
      contractTitle: 'Landing Page Polish',
      type: 'released',
      amount: 650,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-2),
      txHash: '0xa7',
    },
    {
      id: 'earn-8',
      contractId: 'c-103',
      contractTitle: 'Marketing Site Redesign',
      type: 'released',
      amount: 900,
      currency: 'USDC',
      status: 'confirmed',
      occurredAt: day(-1),
      txHash: '0xa8',
    },
  ]

  return {
    transactions,
    completedContractIds: ['c-101', 'c-102', 'c-105', 'c-106', 'c-107', 'c-103'],
  }
}

interface DbTxRow {
  id: string
  contract_id: string
  contract_title: string | null
  transaction_type: string
  amount: string | number | null
  currency: string
  status: string
  created_at: string
  transaction_hash: string | null
}

interface DbContractRow {
  id: string
}

function mapDbType(transactionType: string): EarningsTxType {
  if (transactionType === 'milestone_release') return 'released'
  if (transactionType === 'deposit') return 'escrow_held'
  if (transactionType === 'refund') return 'refund'
  return 'pending'
}

function mapDbStatus(status: string): 'confirmed' | 'pending' | 'failed' {
  if (status === 'confirmed') return 'confirmed'
  if (status === 'failed') return 'failed'
  return 'pending'
}

/**
 * Load earnings rows for a freelancer from Neon.
 * Throws if DATABASE_URL is missing or the query fails.
 */
export async function fetchFreelancerEarningsFromDb(
  freelancerId: string,
): Promise<{
  transactions: EarningsTransaction[]
  completedContractIds: string[]
}> {
  const txRows = (await sql`
    SELECT
      etl.id,
      etl.contract_id,
      COALESCE(p.title, c.id::text) AS contract_title,
      etl.transaction_type,
      etl.amount,
      etl.currency,
      etl.status,
      etl.created_at,
      etl.transaction_hash
    FROM escrow_transaction_logs etl
    INNER JOIN contracts c ON c.id = etl.contract_id
    LEFT JOIN projects p ON p.id = etl.project_id
    WHERE c.freelancer_id = ${freelancerId}
      AND etl.transaction_type IN ('deposit', 'milestone_release', 'refund')
    ORDER BY etl.created_at DESC
    LIMIT 500
  `) as unknown as DbTxRow[]

  const completed = (await sql`
    SELECT id FROM contracts
    WHERE freelancer_id = ${freelancerId}
      AND status = 'completed'
  `) as unknown as DbContractRow[]

  const transactions: EarningsTransaction[] = txRows.map((row) => ({
    id: String(row.id),
    contractId: String(row.contract_id),
    contractTitle: row.contract_title || 'Contract',
    type: mapDbType(row.transaction_type),
    amount: Number(row.amount ?? 0),
    currency: row.currency || 'USDC',
    status: mapDbStatus(row.status),
    occurredAt: new Date(row.created_at).toISOString(),
    txHash: row.transaction_hash,
  }))

  return {
    transactions,
    completedContractIds: completed.map((r) => String(r.id)),
  }
}

export async function getFreelancerEarningsAnalytics(params: {
  freelancerId: string
  preset?: DateRangePreset
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
  allowDemoFallback?: boolean
}): Promise<EarningsAnalytics> {
  const cacheKey = [
    'freelancer-earnings',
    params.freelancerId,
    params.preset ?? '30d',
    params.from ?? '',
    params.to ?? '',
    String(params.page ?? 1),
    String(params.pageSize ?? 10),
  ].join(':')

  const cached = cacheGet<EarningsAnalytics>(cacheKey)
  if (cached) return cached

  let source: {
    transactions: EarningsTransaction[]
    completedContractIds: string[]
  }

  try {
    source = await fetchFreelancerEarningsFromDb(params.freelancerId)
  } catch {
    if (params.allowDemoFallback === false) {
      throw new Error('EARNINGS_FETCH_FAILED')
    }
    source = getDemoEarningsTransactions()
  }

  const analytics = buildEarningsAnalytics({
    ...source,
    preset: params.preset,
    from: params.from,
    to: params.to,
    page: params.page,
    pageSize: params.pageSize,
  })

  cacheSet(cacheKey, analytics, CACHE_TTL_MS)
  return analytics
}
