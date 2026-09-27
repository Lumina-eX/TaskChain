'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ContractTimelineEventType =
  | 'contract_created'
  | 'milestone_created'
  | 'milestone_updated'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'escrow_funded'
  | 'payment_released'
  | 'escrow_refunded'
  | 'dispute_created'
  | 'dispute_resolved'
  | 'contract_completed'
  | 'contract_cancelled'
  | string

export interface ContractTimelineEvent {
  id: string
  actionType: ContractTimelineEventType
  description: string
  createdAt: string
  actorUsername?: string | null
  actorWalletAddress?: string | null
  metadata?: Record<string, unknown> | null
}

interface ActivityLogApiRow {
  id: string
  actionType: string
  description: string
  createdAt: string
  actorUsername: string | null
  actorWalletAddress: string | null
  metadata: Record<string, unknown>
}

interface ActivityLogPage {
  logs: ActivityLogApiRow[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

export interface ActivityTimelineProps {
  /** When set, events are fetched from `/api/activity?contractId=…`. */
  contractId?: string
  /** Optional controlled events (skips fetch when provided). */
  events?: ContractTimelineEvent[]
  /** Page size for API pagination / load-more. */
  pageSize?: number
  className?: string
  title?: string
  /** Force loading UI (useful for tests / parent-driven state). */
  loading?: boolean
}

const actionTypeConfig: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bgColor: string; accent: string }
> = {
  contract_created: {
    label: 'Contract Created',
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    accent: 'border-blue-500/40',
  },
  milestone_created: {
    label: 'Milestone Created',
    icon: FileText,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    accent: 'border-indigo-500/40',
  },
  milestone_updated: {
    label: 'Milestone Updated',
    icon: FileText,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    accent: 'border-purple-500/40',
  },
  milestone_submitted: {
    label: 'Milestone Submitted',
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    accent: 'border-amber-500/40',
  },
  milestone_approved: {
    label: 'Milestone Approved',
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    accent: 'border-green-500/40',
  },
  milestone_rejected: {
    label: 'Changes Requested',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    accent: 'border-red-500/40',
  },
  escrow_funded: {
    label: 'Escrow Funded',
    icon: Banknote,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    accent: 'border-emerald-500/40',
  },
  payment_released: {
    label: 'Payment Released',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    accent: 'border-green-600/40',
  },
  escrow_refunded: {
    label: 'Escrow Refunded',
    icon: Banknote,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    accent: 'border-orange-500/40',
  },
  dispute_created: {
    label: 'Dispute Raised',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    accent: 'border-red-500/40',
  },
  dispute_resolved: {
    label: 'Dispute Resolved',
    icon: CheckCircle2,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    accent: 'border-teal-500/40',
  },
  contract_completed: {
    label: 'Contract Completed',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    accent: 'border-green-600/40',
  },
  contract_cancelled: {
    label: 'Contract Cancelled',
    icon: XCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    accent: 'border-gray-500/40',
  },
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('tc_dev_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function extractTransactionHash(
  metadata?: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null
  const candidates = [
    metadata.transactionHash,
    metadata.txHash,
    metadata.tx_hash,
    metadata.hash,
    metadata.transaction_hash,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

export function formatEventTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Ascending chronological order (oldest first) for timeline display. */
export function sortEventsChronologically(
  events: ContractTimelineEvent[],
): ContractTimelineEvent[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    if (ta !== tb) return ta - tb
    return a.id.localeCompare(b.id)
  })
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6" data-testid="timeline-loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-3 w-full max-w-md rounded bg-muted/70" />
            <div className="h-3 w-40 rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyTimeline() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center gap-3"
      data-testid="timeline-empty"
    >
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Clock className="h-7 w-7 text-primary" />
      </div>
      <p className="font-medium">No activity yet</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Contract events such as escrow funding, milestone submissions, and payments will appear
        here once they occur.
      </p>
    </div>
  )
}

export function ActivityTimeline({
  contractId,
  events: controlledEvents,
  pageSize = 20,
  className,
  title = 'Contract Activity Timeline',
  loading: loadingProp,
}: ActivityTimelineProps) {
  const isControlled = controlledEvents !== undefined
  const [fetchedEvents, setFetchedEvents] = useState<ContractTimelineEvent[]>([])
  const [loading, setLoading] = useState(!isControlled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!contractId || isControlled) return
      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setError(null)
      }
      try {
        const params = new URLSearchParams()
        params.set('contractId', contractId)
        params.set('limit', String(pageSize))
        params.set('offset', String(offset))

        const res = await fetch(`/api/activity?${params.toString()}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        })
        if (!res.ok) {
          setError('Failed to load contract activity.')
          return
        }
        const data = (await res.json()) as ActivityLogPage
        const mapped: ContractTimelineEvent[] = (data.logs ?? []).map((log) => ({
          id: log.id,
          actionType: log.actionType,
          description: log.description,
          createdAt: log.createdAt,
          actorUsername: log.actorUsername,
          actorWalletAddress: log.actorWalletAddress,
          metadata: log.metadata ?? {},
        }))
        setFetchedEvents((prev) => {
          if (!append) return mapped
          const seen = new Set(prev.map((e) => e.id))
          return [...prev, ...mapped.filter((e) => !seen.has(e.id))]
        })
        setHasMore(Boolean(data.pagination?.hasMore))
        setNextOffset(data.pagination?.nextOffset ?? null)
      } catch {
        setError('Failed to load contract activity.')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [contractId, isControlled, pageSize],
  )

  useEffect(() => {
    if (isControlled || !contractId) {
      setLoading(false)
      return
    }
    fetchPage(0, false)
  }, [contractId, isControlled, fetchPage])

  const sourceEvents = isControlled ? controlledEvents : fetchedEvents
  const events = useMemo(() => sortEventsChronologically(sourceEvents), [sourceEvents])
  const showLoading = loadingProp ?? (loading && events.length === 0)

  return (
    <section
      className={cn(
        'rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-4 sm:p-6',
        className,
      )}
      aria-label={title}
      data-testid="contract-activity-timeline"
    >
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological audit trail of contract lifecycle events
          </p>
        </div>
        {!isControlled && contractId && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fetchPage(0, false)}
            disabled={showLoading || loadingMore}
            aria-label="Refresh activity timeline"
          >
            <RefreshCw className={cn('h-4 w-4', (showLoading || loadingMore) && 'animate-spin')} />
          </Button>
        )}
      </div>

      {showLoading ? (
        <TimelineSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => fetchPage(0, false)}>
            Try again
          </Button>
        </div>
      ) : events.length === 0 ? (
        <EmptyTimeline />
      ) : (
        <ol className="relative space-y-0">
          {events.map((event, index) => {
            const config = actionTypeConfig[event.actionType]
            const Icon = config?.icon ?? Clock
            const color = config?.color ?? 'text-muted-foreground'
            const bgColor = config?.bgColor ?? 'bg-muted/30'
            const accent = config?.accent ?? 'border-border'
            const txHash = extractTransactionHash(event.metadata)
            const actor =
              event.actorUsername ?? event.actorWalletAddress ?? 'Unknown actor'
            const isLast = index === events.length - 1

            return (
              <li key={event.id} className="relative flex gap-3 sm:gap-4 pb-8 last:pb-0">
                {!isLast && (
                  <span
                    className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-border/50"
                    aria-hidden
                  />
                )}
                <div
                  className={cn(
                    'relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border',
                    bgColor,
                    accent,
                  )}
                >
                  <Icon className={cn('h-5 w-5', color)} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs font-medium">
                      {config?.label ?? event.actionType.replace(/_/g, ' ')}
                    </Badge>
                    <time
                      dateTime={event.createdAt}
                      className="text-xs text-muted-foreground"
                      title={event.createdAt}
                    >
                      {formatEventTimestamp(event.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm break-words">{event.description}</p>
                  <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-3 text-xs text-muted-foreground">
                    <span>{actor}</span>
                    {txHash && (
                      <span
                        className="font-mono text-[11px] sm:text-xs break-all"
                        title={txHash}
                      >
                        tx: {txHash.length > 20 ? `${txHash.slice(0, 10)}…${txHash.slice(-8)}` : txHash}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!isControlled && hasMore && nextOffset != null && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => fetchPage(nextOffset, true)}
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more events'
            )}
          </Button>
        </div>
      )}
    </section>
  )
}

export default ActivityTimeline
