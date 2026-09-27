'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarClock,
  CircleDollarSign,
  Filter,
  FolderKanban,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ProjectListing {
  id: string
  clientId: string
  title: string
  description: string | null
  budgetUsdc: number
  status: string
  skills: string[]
  category: string | null
  deadline: string | null
  createdAt: string
}

interface DiscoveryResponse {
  projects: ProjectListing[]
  skills: string[]
  statuses: string[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

const DEFAULT_RESPONSE: DiscoveryResponse = {
  projects: [],
  skills: [],
  statuses: ['open', 'in_progress', 'completed', 'cancelled'],
  pagination: { page: 1, pageSize: 0, totalItems: 0, totalPages: 1 },
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'budget_desc', label: 'Budget: high to low' },
  { value: 'budget_asc', label: 'Budget: low to high' },
  { value: 'deadline_asc', label: 'Deadline: soonest' },
  { value: 'deadline_desc', label: 'Deadline: latest' },
]

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  in_progress: 'bg-secondary/20 text-secondary',
  completed: 'bg-accent/20 text-accent',
  cancelled: 'bg-muted text-muted-foreground',
}

function sortToParams(value: string): { sort: string; order: string } {
  switch (value) {
    case 'budget_asc':
      return { sort: 'budget', order: 'asc' }
    case 'budget_desc':
      return { sort: 'budget', order: 'desc' }
    case 'deadline_asc':
      return { sort: 'deadline', order: 'asc' }
    case 'deadline_desc':
      return { sort: 'deadline', order: 'desc' }
    default:
      return { sort: 'created_at', order: 'desc' }
  }
}

function paramsToSort(sort: string | null, order: string | null): string {
  if (sort === 'budget') return order === 'asc' ? 'budget_asc' : 'budget_desc'
  if (sort === 'deadline') return order === 'asc' ? 'deadline_asc' : 'deadline_desc'
  return 'newest'
}

function parseUrlList(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    for (const part of value.split(',')) {
      const trimmed = part.trim()
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue
      seen.add(trimmed.toLowerCase())
      out.push(trimmed)
    }
  }
  return out
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
}

function formatBudget(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatDeadline(value: string | null): string {
  if (!value) return 'No deadline'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No deadline'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function LoadingCards() {
  return (
    <div
      className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-label="Loading projects"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} className="border-border/70 bg-card/70">
          <CardHeader className="gap-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-14 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-7 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface FilterPanelProps {
  search: string
  setSearch: (value: string) => void
  statuses: string[]
  setStatuses: (value: string[]) => void
  skills: string[]
  setSkills: (value: string[]) => void
  availableSkills: string[]
  minBudget: string
  setMinBudget: (value: string) => void
  maxBudget: string
  setMaxBudget: (value: string) => void
  hasActiveFilters: boolean
  clearFilters: () => void
}

function FilterPanel({
  search,
  setSearch,
  statuses,
  setStatuses,
  skills,
  setSkills,
  availableSkills,
  minBudget,
  setMinBudget,
  maxBudget,
  setMaxBudget,
  hasActiveFilters,
  clearFilters,
}: FilterPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <SlidersHorizontal className="size-4" /> Filters
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
            <RotateCcw className="size-3.5" /> Clear all
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-search">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="project-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title, description..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Status</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <Checkbox
                checked={statuses.includes(option.value)}
                onCheckedChange={() => setStatuses(toggleValue(statuses, option.value))}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Budget range (USDC)</p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="Min"
            aria-label="Minimum budget"
            value={minBudget}
            onChange={(event) => setMinBudget(event.target.value)}
          />
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="Max"
            aria-label="Maximum budget"
            value={maxBudget}
            onChange={(event) => setMaxBudget(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Required skills</p>
        {availableSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills available yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {availableSkills.map((skill) => (
              <label
                key={skill}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked={skills.includes(skill)}
                  onCheckedChange={() => setSkills(toggleValue(skills, skill))}
                />
                {skill}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ProjectDiscovery() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [statuses, setStatuses] = useState<string[]>(() =>
    parseUrlList(searchParams.getAll('status')),
  )
  const [skills, setSkills] = useState<string[]>(() =>
    parseUrlList(searchParams.getAll('skills')),
  )
  const [minBudget, setMinBudget] = useState(
    () => searchParams.get('minBudget') ?? '',
  )
  const [maxBudget, setMaxBudget] = useState(
    () => searchParams.get('maxBudget') ?? '',
  )
  const [sort, setSort] = useState(() =>
    paramsToSort(searchParams.get('sort'), searchParams.get('order')),
  )
  const [page, setPage] = useState(() => {
    const parsed = Number.parseInt(searchParams.get('page') ?? '1', 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
  })

  const [data, setData] = useState<DiscoveryResponse>(DEFAULT_RESPONSE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    for (const status of statuses) params.append('status', status)
    for (const skill of skills) params.append('skills', skill)
    if (minBudget.trim()) params.set('minBudget', minBudget.trim())
    if (maxBudget.trim()) params.set('maxBudget', maxBudget.trim())
    const { sort: sortField, order } = sortToParams(sort)
    params.set('sort', sortField)
    params.set('order', order)
    params.set('page', String(page))
    return params.toString()
  }, [search, statuses, skills, minBudget, maxBudget, sort, page])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/discover?${queryString}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Project search failed')
      const payload = (await response.json()) as DiscoveryResponse
      setData(payload)
      setError(null)
    } catch {
      setError('Unable to load projects. Please try again.')
      setData(DEFAULT_RESPONSE)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  // Debounced fetch: avoids a request per keystroke.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadProjects()
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [loadProjects])

  // Persist the active filters in the URL so refresh / shared links restore them.
  useEffect(() => {
    const target = queryString ? `${pathname}?${queryString}` : pathname
    const timeout = window.setTimeout(() => {
      router.replace(target, { scroll: false })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [queryString, pathname, router])

  const clearFilters = useCallback(() => {
    setSearch('')
    setStatuses([])
    setSkills([])
    setMinBudget('')
    setMaxBudget('')
    setSort('newest')
    setPage(1)
  }, [])

  const hasActiveFilters =
    search.trim().length > 0 ||
    statuses.length > 0 ||
    skills.length > 0 ||
    minBudget.trim().length > 0 ||
    maxBudget.trim().length > 0 ||
    sort !== 'newest'

  const filterPanelProps: FilterPanelProps = {
    search,
    setSearch: (value) => {
      setSearch(value)
      setPage(1)
    },
    statuses,
    setStatuses: (value) => {
      setStatuses(value)
      setPage(1)
    },
    skills,
    setSkills: (value) => {
      setSkills(value)
      setPage(1)
    },
    availableSkills: data.skills,
    minBudget,
    setMinBudget: (value) => {
      setMinBudget(value)
      setPage(1)
    },
    maxBudget,
    setMaxBudget: (value) => {
      setMaxBudget(value)
      setPage(1)
    },
    hasActiveFilters,
    clearFilters,
  }

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 via-background to-background pt-28">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              <FolderKanban className="mr-2 size-3.5" /> Project marketplace
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Discover your next TaskChain project
            </h1>
            <p className="text-lg text-muted-foreground">
              Filter by budget, status, and required skills, then sort by newest,
              budget, or deadline to find the right fit.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
        <aside className="hidden h-fit rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm lg:sticky lg:top-24 lg:block">
          <FilterPanel {...filterPanelProps} />
        </aside>

        <div className="space-y-5">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 lg:hidden">
                    <Filter className="size-4" />
                    Filters
                    {hasActiveFilters && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        on
                      </span>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-80 max-w-[85vw] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Filter projects</DialogTitle>
                  </DialogHeader>
                  <FilterPanel {...filterPanelProps} />
                  <div className="pt-2">
                    <Button className="w-full" onClick={() => setFiltersOpen(false)}>
                      Show {data.pagination.totalItems} result
                      {data.pagination.totalItems === 1 ? '' : 's'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div>
                <p className="text-sm text-muted-foreground">Showing</p>
                <p className="font-semibold text-foreground">
                  {data.pagination.totalItems} project
                  {data.pagination.totalItems === 1 ? '' : 's'} found
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full border-border/40 sm:w-56" aria-label="Sort projects">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <LoadingCards />
          ) : data.projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
              <FolderKanban className="mx-auto mb-4 size-10 text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">
                No projects match your filters
              </h2>
              <p className="mt-2 text-muted-foreground">
                Try widening the budget range, removing a skill, or clearing the
                search.
              </p>
              <Button className="mt-5" onClick={clearFilters}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((project) => (
                <Card
                  key={project.id}
                  className="flex flex-col border-border/70 bg-card/80 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg leading-tight">
                        {project.title}
                      </CardTitle>
                      <Badge
                        className={cn(
                          'shrink-0 border-0 capitalize',
                          STATUS_STYLES[project.status] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {project.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {project.category && (
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {project.category}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-4">
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {project.description || 'No description provided.'}
                    </p>

                    {project.skills.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {project.skills.slice(0, 4).map((skill) => (
                          <Badge
                            key={skill}
                            variant="secondary"
                            className="rounded-full"
                          >
                            {skill}
                          </Badge>
                        ))}
                        {project.skills.length > 4 && (
                          <Badge variant="outline" className="rounded-full">
                            +{project.skills.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CircleDollarSign className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Budget</p>
                          <p className="font-semibold text-foreground">
                            {formatBudget(project.budgetUsdc)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Deadline</p>
                          <p className="font-semibold text-foreground">
                            {formatDeadline(project.deadline)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full" variant="outline" asChild>
                      <Link href={`/dashboard/projects/${project.id}`}>
                        View project
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && data.projects.length > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/70 p-4">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
