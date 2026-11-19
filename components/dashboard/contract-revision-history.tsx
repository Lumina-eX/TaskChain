'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEventTimestamp } from '@/components/ActivityTimeline'

type ChangeField = 'budget' | 'deadline' | 'scope' | 'status' | 'currency'

interface FieldChange {
  field: ChangeField
  from: string | null
  to: string | null
}

interface MilestoneChange {
  id: string
  title: string
  kind: 'added' | 'removed' | 'changed'
  changes: FieldChange[]
}

interface RevisionSnapshot {
  contract: { total_amount: string; currency: string; terms: string | null }
  milestones: Array<{
    id: string
    title: string
    description: string | null
    amount: string
    currency: string
    due_date: string | null
    status: string
    sort_order: number
  }>
}

interface ContractRevision {
  id: string
  revision_number: number
  change_type: 'baseline' | 'update'
  created_at: string
  author: {
    display_name: string | null
    username: string | null
    wallet_address: string | null
  } | null
  snapshot: RevisionSnapshot
  changes: {
    contract: FieldChange[]
    milestones: MilestoneChange[]
  } | null
}

interface ContractRevisionHistoryProps {
  contractId: string
  className?: string
}

const fieldConfig: Record<ChangeField, { label: string; className: string }> = {
  budget: { label: 'Budget', className: 'border-amber-500/40 bg-amber-500/10 text-amber-600' },
  deadline: { label: 'Deadline', className: 'border-blue-500/40 bg-blue-500/10 text-blue-600' },
  scope: { label: 'Scope', className: 'border-purple-500/40 bg-purple-500/10 text-purple-600' },
  status: { label: 'Status', className: 'border-border bg-muted/40 text-muted-foreground' },
  currency: { label: 'Currency', className: 'border-border bg-muted/40 text-muted-foreground' },
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('tc_dev_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatValue(field: ChangeField, value: string | null): string {
  if (value === null || value === '') return '—'
  if (field === 'budget') {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount.toLocaleString() : value
  }
  if (field === 'deadline') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
  }
  return value
}

function FieldChangeRow({ change }: { change: FieldChange }) {
  const config = fieldConfig[change.field] ?? fieldConfig.status
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <Badge variant="outline" className={cn('w-fit text-[10px]', config.className)}>
        {config.label}
      </Badge>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground line-through break-all">
          {formatValue(change.field, change.from)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium break-all">{formatValue(change.field, change.to)}</span>
      </div>
    </div>
  )
}

export function ContractRevisionHistory({
  contractId,
  className,
}: ContractRevisionHistoryProps) {
  const [revisions, setRevisions] = useState<ContractRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/revisions`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      })
      if (!res.ok) {
        setError('Failed to load revision history.')
        return
      }
      const data = (await res.json()) as { revisions?: ContractRevision[] }
      const list = data.revisions ?? []
      setRevisions(list)
      setExpandedId(list.length > 0 ? list[list.length - 1].id : null)
    } catch {
      setError('Failed to load revision history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!contractId) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  // Newest first, like a change log.
  const ordered = [...revisions].reverse()

  return (
    <section
      className={cn(
        'rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-4 sm:p-6',
        className,
      )}
      aria-label="Contract revision history"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5 text-accent" />
            Revision History
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only record of every change, who made it, and when.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh revision history"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {loading && revisions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading revisions…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <History className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No revisions yet. Changes to milestones will appear here.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-4">
          {ordered.map((revision) => {
            const isOpen = expandedId === revision.id
            const author =
              revision.author?.display_name ||
              revision.author?.username ||
              revision.author?.wallet_address ||
              'Unknown'
            const changeCount =
              (revision.changes?.contract.length ?? 0) + (revision.changes?.milestones.length ?? 0)

            return (
              <li
                key={revision.id}
                className="rounded-xl border border-border/40 bg-background/40"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                  onClick={() => setExpandedId(isOpen ? null : revision.id)}
                  aria-expanded={isOpen}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs font-medium">
                      {revision.change_type === 'baseline'
                        ? 'Initial snapshot'
                        : `Revision v${revision.revision_number}`}
                    </Badge>
                    {revision.change_type === 'update' && (
                      <span className="text-xs text-muted-foreground">
                        {changeCount} {changeCount === 1 ? 'change' : 'changes'}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{author}</span>
                    <time dateTime={revision.created_at} title={revision.created_at}>
                      {formatEventTimestamp(revision.created_at)}
                    </time>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-border/40 p-4">
                    {revision.changes && changeCount > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Changes in this revision</h4>
                        {revision.changes.contract.map((change, index) => (
                          <FieldChangeRow
                            key={`contract-${change.field}-${index}`}
                            change={change}
                          />
                        ))}
                        {revision.changes.milestones.map((milestone) => (
                          <div
                            key={`${milestone.id}-${milestone.kind}`}
                            className="rounded-lg border border-border/40 p-3"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{milestone.title}</span>
                              {milestone.kind !== 'changed' && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px]',
                                    milestone.kind === 'added'
                                      ? 'border-green-500/40 bg-green-500/10 text-green-600'
                                      : 'border-red-500/40 bg-red-500/10 text-red-600',
                                  )}
                                >
                                  {milestone.kind === 'added' ? 'Milestone added' : 'Milestone removed'}
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-2">
                              {milestone.changes.map((change, index) => (
                                <FieldChangeRow
                                  key={`${milestone.id}-${change.field}-${index}`}
                                  change={change}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {revision.changes && changeCount === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No tracked changes between this revision and the previous one.
                      </p>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">
                        Milestones at v{revision.revision_number}
                      </h4>
                      {revision.snapshot.milestones.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No milestones in this snapshot.</p>
                      ) : (
                        <ul className="space-y-2">
                          {revision.snapshot.milestones.map((milestone) => (
                            <li
                              key={milestone.id}
                              className="flex flex-col gap-1 rounded-lg border border-border/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                            >
                              <span className="font-medium break-words">{milestone.title}</span>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {formatValue('budget', milestone.amount)} {milestone.currency}
                                </span>
                                <span>·</span>
                                <span>Due {formatValue('deadline', milestone.due_date)}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {milestone.status}
                                </Badge>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default ContractRevisionHistory
