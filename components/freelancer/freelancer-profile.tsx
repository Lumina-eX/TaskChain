'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Shield,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { FreelancerReputationPayload } from '@/lib/reputation'

const MOCK_SKILLS = [
  'Next.js',
  'TypeScript',
  'React',
  'Node.js',
  'Stellar',
  'Solidity',
  'Tailwind CSS',
  'REST APIs',
  'Web3',
  'PostgreSQL',
]

const MOCK_BIO =
  'Full-stack developer specializing in blockchain-powered applications and decentralized work platforms. Passionate about building transparent, secure systems that empower freelancers and clients worldwide.'

const MOCK_TITLE = 'Full-Stack & Web3 Developer'

const FALLBACK_REPUTATION: FreelancerReputationPayload = {
  userId: 0,
  reputationScore: null,
  computedAt: new Date().toISOString(),
  metrics: {
    completionRate: null,
    disputeRate: null,
    totalVolume: 0,
    onTimeDeliveryPct: null,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsWithDispute: 0,
    completedWithDeadline: 0,
    onTimeDeliveries: 0,
  },
}

function pct(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value * 100)}%`
}

function formatVolume(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function truncateWallet(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function reputationColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-primary'
  if (score >= 40) return 'text-amber-400'
  return 'text-destructive'
}

function reputationLabel(score: number | null): string {
  if (score === null) return 'Unrated'
  if (score >= 90) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs Improvement'
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-card/60 p-5 shadow-lg shadow-black/10 backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-sm">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </article>
  )
}

function SkillBadge({ skill }: { skill: string }) {
  return (
    <Badge
      variant="secondary"
      className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20"
    >
      {skill}
    </Badge>
  )
}

function MetricRow({
  label,
  value,
  barValue,
}: {
  label: string
  value: string
  barValue: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <Progress value={barValue} className="h-2" />
    </div>
  )
}

export function FreelancerProfile() {
  const [reputation, setReputation] = useState<FreelancerReputationPayload>(FALLBACK_REPUTATION)
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const [repRes, meRes] = await Promise.all([
        fetch('/api/freelancer/reputation', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
      ])

      if (repRes.ok) {
        const data = (await repRes.json()) as FreelancerReputationPayload
        setReputation(data)
      }

      if (meRes.ok) {
        const me = (await meRes.json()) as { walletAddress: string }
        setWalletAddress(me.walletAddress ?? '')
      }

      setError(null)
    } catch {
      setError('Unable to load profile data. Showing cached information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function copyWallet() {
    if (!walletAddress) return
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { metrics, reputationScore } = reputation
  const displayName = walletAddress
    ? `Freelancer ${walletAddress.slice(0, 4).toUpperCase()}`
    : 'Freelancer'

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading profile…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Hero */}
      <section className="mb-8 rounded-2xl border border-border/70 bg-card/50 p-6 shadow-lg shadow-black/10 backdrop-blur lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-accent shadow-lg lg:h-28 lg:w-28">
              <span className="text-3xl font-bold text-primary-foreground lg:text-4xl">
                {displayName.charAt(0)}
              </span>
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-emerald-500">
                <CheckCircle2 className="size-3.5 text-white" />
              </span>
            </div>
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              Verified Freelancer
            </Badge>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
                  {displayName}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{MOCK_TITLE}</p>
              </div>

              {/* Reputation Score */}
              <div className="flex flex-col items-center rounded-xl border border-border/60 bg-background/40 px-5 py-3 text-center">
                <Star className={`mb-1 size-5 ${reputationColor(reputationScore)}`} />
                <p
                  className={`text-3xl font-bold leading-none ${reputationColor(reputationScore)}`}
                >
                  {reputationScore !== null ? Math.round(reputationScore) : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reputationLabel(reputationScore)}
                </p>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {MOCK_BIO}
            </p>

            {/* Wallet */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <Wallet className="size-4 text-muted-foreground" />
                <code className="font-mono text-xs text-foreground">
                  {walletAddress ? truncateWallet(walletAddress) : 'Not connected'}
                </code>
                {walletAddress && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={copyWallet}
                    title="Copy wallet address"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
              {walletAddress && (
                <a
                  href={`https://stellar.expert/explorer/public/account/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-3" />
                  View on Explorer
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="size-4" />}
          label="Completed Projects"
          value={String(metrics.jobsCompleted)}
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Success Rate"
          value={pct(metrics.completionRate)}
        />
        <StatCard
          icon={<Clock className="size-4" />}
          label="On-Time Delivery"
          value={pct(metrics.onTimeDeliveryPct)}
        />
        <StatCard
          icon={<Shield className="size-4" />}
          label="Total Volume"
          value={formatVolume(metrics.totalVolume)}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Skills + Projects */}
        <div className="space-y-6 lg:col-span-2">
          {/* Skills */}
          <article className="rounded-2xl border border-border/70 bg-card/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <h2 className="text-lg font-semibold text-foreground">Skills</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Technologies and areas of expertise.
            </p>
            <div className="flex flex-wrap gap-2">
              {MOCK_SKILLS.map((skill) => (
                <SkillBadge key={skill} skill={skill} />
              ))}
            </div>
          </article>

          {/* Completed Projects */}
          <article className="rounded-2xl border border-border/70 bg-card/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <h2 className="text-lg font-semibold text-foreground">Completed Projects</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              {metrics.jobsCompleted > 0
                ? `${metrics.jobsCompleted} project${metrics.jobsCompleted !== 1 ? 's' : ''} delivered successfully.`
                : 'No completed projects yet.'}
            </p>
            {metrics.jobsCompleted > 0 ? (
              <ul className="space-y-3">
                {Array.from({ length: Math.min(metrics.jobsCompleted, 3) }, (_, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-4"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        Project #{i + 1}
                      </p>
                      <p className="text-xs text-muted-foreground">Completed · Payout confirmed</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 bg-emerald-500/10 text-emerald-400"
                    >
                      Done
                    </Badge>
                  </li>
                ))}
                {metrics.jobsCompleted > 3 && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    +{metrics.jobsCompleted - 3} more completed
                  </p>
                )}
              </ul>
            ) : (
              <div className="rounded-xl border border-border/60 bg-background/30 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Completed projects will appear here once work is delivered.
                </p>
              </div>
            )}
          </article>
        </div>

        {/* Right column: Reputation Breakdown */}
        <div>
          <article className="rounded-2xl border border-border/70 bg-card/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <h2 className="text-lg font-semibold text-foreground">Reputation Breakdown</h2>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Performance metrics across all contracts.
            </p>
            <div className="space-y-5">
              <MetricRow
                label="Completion Rate"
                value={pct(metrics.completionRate)}
                barValue={metrics.completionRate !== null ? metrics.completionRate * 100 : 0}
              />
              <MetricRow
                label="On-Time Delivery"
                value={pct(metrics.onTimeDeliveryPct)}
                barValue={metrics.onTimeDeliveryPct !== null ? metrics.onTimeDeliveryPct * 100 : 0}
              />
              <MetricRow
                label="Dispute-Free Rate"
                value={
                  metrics.disputeRate !== null ? pct(1 - metrics.disputeRate) : '—'
                }
                barValue={
                  metrics.disputeRate !== null ? (1 - metrics.disputeRate) * 100 : 0
                }
              />
            </div>

            <div className="mt-6 space-y-2 border-t border-border/40 pt-5 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Jobs Started</span>
                <span className="font-medium text-foreground">{metrics.jobsStarted}</span>
              </div>
              <div className="flex justify-between">
                <span>Jobs Completed</span>
                <span className="font-medium text-foreground">{metrics.jobsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span>Disputes</span>
                <span className="font-medium text-foreground">{metrics.jobsWithDispute}</span>
              </div>
            </div>

            {reputationScore !== null && (
              <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                <p className="text-xs text-muted-foreground">Overall Score</p>
                <p className={`mt-1 text-4xl font-bold ${reputationColor(reputationScore)}`}>
                  {Math.round(reputationScore)}
                  <span className="text-lg text-muted-foreground">/100</span>
                </p>
                <p className={`mt-0.5 text-sm ${reputationColor(reputationScore)}`}>
                  {reputationLabel(reputationScore)}
                </p>
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
