'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Banknote, BriefcaseBusiness, ShieldCheck } from 'lucide-react'
import {
  getFreelancerDashboardData,
  type ContractItem,
  type EscrowEntry,
  type FreelancerDashboardData,
} from '@/lib/freelancer-dashboard'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function Card({
  title,
  icon,
  value,
  helper,
}: {
  title: string
  icon: ReactNode
  value: string
  helper: string
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

function ContractRow({
  contract,
  completed = false,
}: {
  contract: ContractItem
  completed?: boolean
}) {
  return (
    <li className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{contract.title}</p>
        <span className="rounded-full bg-secondary/30 px-3 py-1 text-xs text-secondary-foreground">
          {formatCurrency(contract.amountUsd)}
        </span>
      </div>
      <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
        <p>Client: {contract.clientName}</p>
        <p>Deadline: {formatDate(contract.deadline)}</p>
        <p>Terms: {contract.paymentTerms}</p>
      </div>
      {completed ? (
        <p className="mt-3 text-xs text-emerald-300">
          Status: {contract.payoutConfirmed ? 'Payout Confirmed' : 'Awaiting Payout Confirmation'}
        </p>
      ) : null}
    </li>
  )
}

function EscrowRow({ escrow }: { escrow: EscrowEntry }) {
  const statusClass =
    escrow.status === 'released'
      ? 'bg-emerald-500/20 text-emerald-300'
      : escrow.status === 'releasing'
        ? 'bg-amber-500/20 text-amber-300'
        : 'bg-sky-500/20 text-sky-300'

  return (
    <li className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{escrow.contractTitle}</p>
        <span className="text-sm font-medium text-foreground">{formatCurrency(escrow.amountUsd)}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{escrow.releaseCondition}</p>
      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs ${statusClass}`}>
        {escrow.status}
      </span>
    </li>
  )
}

export function FreelancerDashboard() {
  const [data, setData] = useState<FreelancerDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const response = await getFreelancerDashboardData()
      setData(response)
      setError(null)
    } catch {
      setError('Unable to load freelancer dashboard data at this time.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()

    const interval = setInterval(() => {
      void loadData()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadData])

  const totalEscrow = useMemo(() => {
    if (!data) return 0
    return data.escrow.reduce((sum, entry) => sum + entry.amountUsd, 0)
  }, [data])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading dashboard...
      </div>
    )
  }

  if (!data || error) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4" />
          <p>{error ?? 'No dashboard data available.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground">Freelancer Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {formatDate(data.updatedAt)}. Data refreshes every 30 seconds.
        </p>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="Total Earnings"
          icon={<Banknote className="size-4" />}
          value={formatCurrency(data.earnings.totalEarningsUsd)}
          helper="Confirmed lifetime payouts"
        />
        <Card
          title="Pending Payments"
          icon={<BriefcaseBusiness className="size-4" />}
          value={formatCurrency(data.earnings.pendingPaymentsUsd)}
          helper="Awaiting release from milestones"
        />
        <Card
          title="Withdrawals"
          icon={<Banknote className="size-4" />}
          value={formatCurrency(data.earnings.withdrawalsUsd)}
          helper="Transferred to wallet or bank"
        />
        <Card
          title="In Escrow"
          icon={<ShieldCheck className="size-4" />}
          value={formatCurrency(totalEscrow)}
          helper="Protected until release conditions are met"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-5">
          <h2 className="text-lg font-semibold text-foreground">Active Contracts</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Ongoing work with deadlines and payment terms.
          </p>
          <ul className="space-y-3">
            {data.activeContracts.length > 0 ? (
              data.activeContracts.map((contract) => (
                <ContractRow key={contract.id} contract={contract} />
              ))
            ) : (
              <li className="rounded-xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                No active contracts right now.
              </li>
            )}
          </ul>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-5">
          <h2 className="text-lg font-semibold text-foreground">Completed Contracts</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Finished contracts and payout confirmations.
          </p>
          <ul className="space-y-3">
            {data.completedContracts.length > 0 ? (
              data.completedContracts.map((contract) => (
                <ContractRow key={contract.id} contract={contract} completed />
              ))
            ) : (
              <li className="rounded-xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                No completed contracts available yet.
              </li>
            )}
          </ul>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/50 p-5">
        <h2 className="text-lg font-semibold text-foreground">Escrow Status</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Funds currently held and their release conditions.
        </p>
        <ul className="space-y-3">
          {data.escrow.length > 0 ? (
            data.escrow.map((entry) => <EscrowRow key={entry.id} escrow={entry} />)
          ) : (
            <li className="rounded-xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              No funds are currently in escrow.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
