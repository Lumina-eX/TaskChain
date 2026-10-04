import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { globalSearch, SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX, type SearchFilters } from '@/lib/search'

const ProjectStatus = ['draft', 'open', 'in_progress', 'completed', 'cancelled', 'disputed'] as const
const ContractStatus = ['pending', 'active', 'paused', 'completed', 'cancelled', 'disputed'] as const
const AllStatus = [...ProjectStatus, ...ContractStatus]
const SortFields = ['relevance', 'budget', 'created_at', 'deadline', 'completed_at', 'status'] as const
const SortOrders = ['asc', 'desc'] as const

const QuerySchema = z.object({
  q: z.string().max(200).trim().optional(),
  type: z.enum(['project', 'contract', 'all']).default('all'),
  status: z.enum(AllStatus).optional(),
  minBudget: z.coerce.number().nonnegative().optional(),
  maxBudget: z.coerce.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  deadlineAfter: z.string().datetime().optional(),
  deadlineBefore: z.string().datetime().optional(),
  completedAfter: z.string().datetime().optional(),
  completedBefore: z.string().datetime().optional(),
  sort: z.string().regex(/^(relevance|budget|created_at|deadline|completed_at|status):(asc|desc)$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
}).refine(data => {
  if (data.minBudget !== undefined && data.maxBudget !== undefined) {
    return data.minBudget <= data.maxBudget
  }
  return true
}, {
  message: 'minBudget cannot exceed maxBudget',
  path: ['minBudget'],
})

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl

  const parsed = QuerySchema.safeParse({
    q: searchParams.get('q') ?? undefined,
    type: searchParams.get('type') ?? 'all',
    status: searchParams.get('status') ?? undefined,
    minBudget: searchParams.get('minBudget') ?? undefined,
    maxBudget: searchParams.get('maxBudget') ?? undefined,
    currency: searchParams.get('currency') ?? undefined,
    createdAfter: searchParams.get('createdAfter') ?? undefined,
    createdBefore: searchParams.get('createdBefore') ?? undefined,
    deadlineAfter: searchParams.get('deadlineAfter') ?? undefined,
    deadlineBefore: searchParams.get('deadlineBefore') ?? undefined,
    completedAfter: searchParams.get('completedAfter') ?? undefined,
    completedBefore: searchParams.get('completedBefore') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const filters: SearchFilters = {
    q: parsed.data.q,
    type: parsed.data.type,
    status: parsed.data.status,
    minBudget: parsed.data.minBudget,
    maxBudget: parsed.data.maxBudget,
    currency: parsed.data.currency,
    createdAfter: parsed.data.createdAfter,
    createdBefore: parsed.data.createdBefore,
    deadlineAfter: parsed.data.deadlineAfter,
    deadlineBefore: parsed.data.deadlineBefore,
    completedAfter: parsed.data.completedAfter,
    completedBefore: parsed.data.completedBefore,
    sort: parsed.data.sort,
    page: parsed.data.page,
    limit: parsed.data.limit,
  }

  try {
    const payload = await globalSearch(parsed.data.q, filters, parsed.data.page, parsed.data.limit)
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[GET /api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
})