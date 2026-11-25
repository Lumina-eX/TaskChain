'use client'

import * as React from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isPast,
  parseISO,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfDay,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  DollarSign,
  Loader2,
  Filter,
  X,
} from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'

export interface CalendarMilestone {
  id: string
  title: string
  description: string | null
  amount: string
  currency: string
  due_date: string
  status: MilestoneStatus
  contract_id: string | null
  contract_title: string | null
  project_id: string | null
  sort_order: number
}

interface ContractOption {
  id: string
  title: string
}

type CalendarView = 'monthly' | 'weekly'

// ─── Status Configuration ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  MilestoneStatus,
  {
    label: string
    dotColor: string
    badgeClass: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  }
> = {
  pending: {
    label: 'Pending',
    dotColor: 'bg-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-muted',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    dotColor: 'bg-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    icon: Clock,
  },
  submitted: {
    label: 'Submitted',
    dotColor: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    icon: CheckCircle2,
  },
  approved: {
    label: 'Approved',
    dotColor: 'bg-green-500',
    badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    dotColor: 'bg-destructive',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
    icon: XCircle,
  },
  paid: {
    label: 'Paid',
    dotColor: 'bg-primary',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    icon: DollarSign,
  },
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function getMilestoneCategory(
  milestone: CalendarMilestone
): 'overdue' | 'upcoming' | 'completed' {
  const due = parseISO(milestone.due_date)
  if (['approved', 'paid'].includes(milestone.status)) return 'completed'
  if (isPast(startOfDay(due)) && !['approved', 'paid'].includes(milestone.status))
    return 'overdue'
  return 'upcoming'
}

function getMilestonesForDay(
  milestones: CalendarMilestone[],
  day: Date
): CalendarMilestone[] {
  return milestones.filter((m) => isSameDay(parseISO(m.due_date), day))
}

// ─── Milestone Detail Dialog ─────────────────────────────────────────────────

function MilestoneDetailDialog({
  milestone,
  open,
  onOpenChange,
}: {
  milestone: CalendarMilestone | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!milestone) return null

  const cfg = STATUS_CONFIG[milestone.status]
  const Icon = cfg.icon
  const category = getMilestoneCategory(milestone)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Milestone Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title & Status */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-lg leading-tight">{milestone.title}</h3>
            <Badge
              variant="outline"
              className={cn('shrink-0 flex items-center gap-1 text-xs', cfg.badgeClass)}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>

          {/* Description */}
          {milestone.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {milestone.description}
            </p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Amount</p>
              <p className="font-semibold">
                ${parseFloat(milestone.amount).toLocaleString()} {milestone.currency}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Due Date</p>
              <p className="font-semibold">
                {format(parseISO(milestone.due_date), 'MMM d, yyyy')}
              </p>
            </div>
            {milestone.contract_title && (
              <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Contract</p>
                <p className="font-semibold truncate">{milestone.contract_title}</p>
              </div>
            )}
          </div>

          {/* Category banner */}
          {category === 'overdue' && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This milestone is overdue.
            </div>
          )}
          {category === 'completed' && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              This milestone has been completed.
            </div>
          )}

          {/* Action */}
          <div className="flex justify-end pt-1">
            <Button asChild size="sm">
              <Link href={`/dashboard/milestones/${milestone.id}`}>
                View Full Details
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Day Cell ────────────────────────────────────────────────────────────────

function DayCell({
  day,
  currentMonth,
  milestones,
  onMilestoneClick,
}: {
  day: Date
  currentMonth: Date
  milestones: CalendarMilestone[]
  onMilestoneClick: (m: CalendarMilestone) => void
}) {
  const isCurrentMonth = isSameMonth(day, currentMonth)
  const isCurrentDay = isToday(day)
  const dayMilestones = getMilestonesForDay(milestones, day)

  return (
    <div
      className={cn(
        'min-h-[80px] p-1.5 border-r border-b border-border/30 text-xs',
        !isCurrentMonth && 'opacity-40 bg-muted/20',
        isCurrentDay && 'bg-primary/5'
      )}
    >
      <div
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center font-medium mb-1',
          isCurrentDay
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground'
        )}
      >
        {format(day, 'd')}
      </div>

      <div className="space-y-0.5">
        {dayMilestones.slice(0, 3).map((m) => {
          const cfg = STATUS_CONFIG[m.status]
          const category = getMilestoneCategory(m)
          return (
            <button
              key={m.id}
              onClick={() => onMilestoneClick(m)}
              className={cn(
                'w-full text-left rounded px-1 py-0.5 flex items-center gap-1 hover:opacity-80 transition-opacity truncate',
                category === 'overdue' && 'bg-destructive/10 text-destructive',
                category === 'completed' && 'bg-green-500/10 text-green-700 dark:text-green-400',
                category === 'upcoming' && 'bg-primary/10 text-primary'
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dotColor)}
              />
              <span className="truncate">{m.title}</span>
            </button>
          )
        })}
        {dayMilestones.length > 3 && (
          <p className="text-muted-foreground pl-1">
            +{dayMilestones.length - 3} more
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Monthly View ────────────────────────────────────────────────────────────

function MonthlyView({
  currentDate,
  milestones,
  onMilestoneClick,
}: {
  currentDate: Date
  milestones: CalendarMilestone[]
  onMilestoneClick: (m: CalendarMilestone) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      {/* Week headers */}
      <div className="grid grid-cols-7 bg-muted/30 border-b border-border/30">
        {weekDays.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted-foreground border-r border-border/30 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            currentMonth={currentDate}
            milestones={milestones}
            onMilestoneClick={onMilestoneClick}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Weekly View ─────────────────────────────────────────────────────────────

function WeeklyView({
  currentDate,
  milestones,
  onMilestoneClick,
}: {
  currentDate: Date
  milestones: CalendarMilestone[]
  onMilestoneClick: (m: CalendarMilestone) => void
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const isCurrentDay = isToday(day)
          const dayMilestones = getMilestonesForDay(milestones, day)

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-r border-border/30 last:border-r-0',
                isCurrentDay && 'bg-primary/5'
              )}
            >
              {/* Day header */}
              <div
                className={cn(
                  'py-2 text-center border-b border-border/30 bg-muted/30',
                  isCurrentDay && 'bg-primary/10'
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {format(day, 'EEE')}
                </p>
                <div
                  className={cn(
                    'h-7 w-7 rounded-full mx-auto flex items-center justify-center font-semibold text-sm',
                    isCurrentDay
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground'
                  )}
                >
                  {format(day, 'd')}
                </div>
              </div>

              {/* Milestones */}
              <div className="p-1.5 space-y-1 min-h-[160px]">
                {dayMilestones.map((m) => {
                  const cfg = STATUS_CONFIG[m.status]
                  const Icon = cfg.icon
                  const category = getMilestoneCategory(m)
                  return (
                    <button
                      key={m.id}
                      onClick={() => onMilestoneClick(m)}
                      className={cn(
                        'w-full text-left rounded-md px-2 py-1.5 text-xs space-y-0.5 hover:opacity-80 transition-opacity',
                        category === 'overdue' && 'bg-destructive/10 border border-destructive/20',
                        category === 'completed' && 'bg-green-500/10 border border-green-500/20',
                        category === 'upcoming' && 'bg-primary/10 border border-primary/20'
                      )}
                    >
                      <div className="flex items-center gap-1 font-medium truncate">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            cfg.dotColor
                          )}
                        />
                        <span className="truncate">{m.title}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground pl-2.5">
                        <Icon className="h-3 w-3 shrink-0" />
                        <span>{cfg.label}</span>
                      </div>
                    </button>
                  )
                })}
                {dayMilestones.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center pt-6">
                    No milestones
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ContractMilestoneCalendar() {
  const [view, setView] = React.useState<CalendarView>('monthly')
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [milestones, setMilestones] = React.useState<CalendarMilestone[]>([])
  const [contracts, setContracts] = React.useState<ContractOption[]>([])
  const [filterContract, setFilterContract] = React.useState<string>('all')
  const [filterStatus, setFilterStatus] = React.useState<string>('all')
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedMilestone, setSelectedMilestone] =
    React.useState<CalendarMilestone | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const fetchMilestones = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('tc_dev_access_token')
          : null
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      const params = new URLSearchParams()
      if (filterContract && filterContract !== 'all')
        params.set('contract_id', filterContract)
      if (filterStatus && filterStatus !== 'all')
        params.set('status', filterStatus)

      const res = await fetch(`/api/milestones/calendar?${params.toString()}`, {
        headers,
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Failed to load calendar data')
      }

      const data = await res.json()
      setMilestones(data.milestones ?? [])
      setContracts(data.contracts ?? [])
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load calendar data'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [filterContract, filterStatus])

  React.useEffect(() => {
    fetchMilestones()
  }, [fetchMilestones])

  const handleMilestoneClick = (m: CalendarMilestone) => {
    setSelectedMilestone(m)
    setDetailOpen(true)
  }

  const navigatePrev = () => {
    if (view === 'monthly') setCurrentDate((d) => subMonths(d, 1))
    else setCurrentDate((d) => subWeeks(d, 1))
  }

  const navigateNext = () => {
    if (view === 'monthly') setCurrentDate((d) => addMonths(d, 1))
    else setCurrentDate((d) => addWeeks(d, 1))
  }

  const goToToday = () => setCurrentDate(new Date())

  const clearFilters = () => {
    setFilterContract('all')
    setFilterStatus('all')
  }

  const hasFilters = filterContract !== 'all' || filterStatus !== 'all'

  const headerLabel =
    view === 'monthly'
      ? format(currentDate, 'MMMM yyyy')
      : `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d, yyyy')}`

  // Summary counts
  const overdue = milestones.filter(
    (m) => getMilestoneCategory(m) === 'overdue'
  ).length
  const upcoming = milestones.filter(
    (m) => getMilestoneCategory(m) === 'upcoming'
  ).length
  const completed = milestones.filter(
    (m) => getMilestoneCategory(m) === 'completed'
  ).length

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Upcoming</p>
          <p className="text-2xl font-bold text-primary">{isLoading ? '–' : upcoming}</p>
        </Card>
        <Card className="p-4 bg-destructive/5 border-destructive/20">
          <p className="text-xs text-muted-foreground mb-1">Overdue</p>
          <p className="text-2xl font-bold text-destructive">{isLoading ? '–' : overdue}</p>
        </Card>
        <Card className="p-4 bg-green-500/5 border-green-500/20">
          <p className="text-xs text-muted-foreground mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-600">{isLoading ? '–' : completed}</p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold ml-2">{headerLabel}</span>
        </div>

        {/* View toggle */}
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as CalendarView)}
          className="shrink-0"
        >
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

        <Select value={filterContract} onValueChange={setFilterContract}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All Contracts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contracts</SelectItem>
            {contracts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as MilestoneStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Upcoming
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Overdue
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Completed
        </div>
      </div>

      {/* Calendar body */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[320px] text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading calendar…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchMilestones}>
            Retry
          </Button>
        </div>
      ) : milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[320px] gap-3 rounded-lg border border-dashed border-border/40">
          <Calendar className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {hasFilters
              ? 'No milestones match the current filters.'
              : 'No milestones with due dates found.'}
          </p>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : view === 'monthly' ? (
        <MonthlyView
          currentDate={currentDate}
          milestones={milestones}
          onMilestoneClick={handleMilestoneClick}
        />
      ) : (
        <WeeklyView
          currentDate={currentDate}
          milestones={milestones}
          onMilestoneClick={handleMilestoneClick}
        />
      )}

      {/* Milestone detail dialog */}
      <MilestoneDetailDialog
        milestone={selectedMilestone}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
