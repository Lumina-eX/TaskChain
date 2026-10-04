import { sql } from '@/lib/db'

export const SEARCH_LIMIT_DEFAULT = 20
export const SEARCH_LIMIT_MAX = 100

export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
export type ContractStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled' | 'disputed'
export type SortField = 'relevance' | 'budget' | 'created_at' | 'deadline' | 'completed_at' | 'status'
export type SortOrder = 'asc' | 'desc'

export interface SearchFilters {
  q?: string
  type?: 'project' | 'contract' | 'all'
  status?: ProjectStatus | ContractStatus | string
  minBudget?: number
  maxBudget?: number
  currency?: string
  createdAfter?: string
  createdBefore?: string
  deadlineAfter?: string
  deadlineBefore?: string
  completedAfter?: string
  completedBefore?: string
  sort?: `${SortField}:${SortOrder}`
  page?: number
  limit?: number
}

export interface ProjectResult {
  type: 'project'
  id: string
  clientId: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  budgetMin: number | null
  budgetMax: number | null
  currency: string
  deadline: string | null
  startedAt: string | null
  completedAt: string | null
  status: ProjectStatus
  chainId: number | null
  contractAddress: string | null
  txHash: string | null
  isPublic: boolean
  maxApplicants: number | null
  createdAt: string
  updatedAt: string
}

export interface ContractResult {
  type: 'contract'
  id: string
  projectId: string
  clientId: string
  freelancerId: string
  terms: string | null
  termsIpfsCid: string | null
  agreedAt: string | null
  totalAmount: number
  currency: string
  escrowAddress: string | null
  escrowStatus: string
  fundedAt: string | null
  fundingTxHash: string | null
  status: ContractStatus
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  chainId: number | null
  contractTxHash: string | null
  activeDisputeId: string | null
  createdAt: string
  updatedAt: string
}

export interface FreelancerResult {
  type: 'freelancer'
  id: string
  username: string
  bio: string
  skills: string[]
  rating: number
}

export interface ClientResult {
  type: 'client'
  id: string
  username: string
  walletAddress: string
}

export type SearchResult = ProjectResult | ContractResult | FreelancerResult | ClientResult

export interface SearchResponse {
  query: string
  filters: SearchFilters
  results: SearchResult[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
  counts: {
    projects: number
    contracts: number
    freelancers: number
    clients: number
  }
}

function buildSearchConditions(
  q: string | undefined,
  filters: SearchFilters,
  tableAlias: string
): { whereClause: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (q && q.trim()) {
    const needle = `%${q.trim()}%`
    if (tableAlias === 'p') {
      conditions.push(`(p.title ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE t ILIKE $${paramIndex}))`)
    } else if (tableAlias === 'c') {
      conditions.push(`(c.terms ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE t ILIKE $${paramIndex}))`)
    }
    params.push(needle)
    paramIndex++
  }

  if (filters.status) {
    conditions.push(`${tableAlias}.status = $${paramIndex}`)
    params.push(filters.status)
    paramIndex++
  }

  if (filters.minBudget !== undefined) {
    if (tableAlias === 'p') {
      conditions.push(`(p.budget_max IS NULL OR p.budget_max >= $${paramIndex})`)
    } else if (tableAlias === 'c') {
      conditions.push(`c.total_amount >= $${paramIndex}`)
    }
    params.push(filters.minBudget)
    paramIndex++
  }

  if (filters.maxBudget !== undefined) {
    if (tableAlias === 'p') {
      conditions.push(`(p.budget_min IS NULL OR p.budget_min <= $${paramIndex})`)
    } else if (tableAlias === 'c') {
      conditions.push(`c.total_amount <= $${paramIndex}`)
    }
    params.push(filters.maxBudget)
    paramIndex++
  }

  if (filters.currency) {
    conditions.push(`${tableAlias}.currency = $${paramIndex}`)
    params.push(filters.currency)
    paramIndex++
  }

  if (filters.createdAfter) {
    conditions.push(`${tableAlias}.created_at >= $${paramIndex}`)
    params.push(filters.createdAfter)
    paramIndex++
  }

  if (filters.createdBefore) {
    conditions.push(`${tableAlias}.created_at <= $${paramIndex}`)
    params.push(filters.createdBefore)
    paramIndex++
  }

  if (tableAlias === 'p') {
    if (filters.deadlineAfter) {
      conditions.push(`p.deadline >= $${paramIndex}`)
      params.push(filters.deadlineAfter)
      paramIndex++
    }
    if (filters.deadlineBefore) {
      conditions.push(`p.deadline <= $${paramIndex}`)
      params.push(filters.deadlineBefore)
      paramIndex++
    }
    if (filters.completedAfter) {
      conditions.push(`p.completed_at >= $${paramIndex}`)
      params.push(filters.completedAfter)
      paramIndex++
    }
    if (filters.completedBefore) {
      conditions.push(`p.completed_at <= $${paramIndex}`)
      params.push(filters.completedBefore)
      paramIndex++
    }
  } else if (tableAlias === 'c') {
    if (filters.completedAfter) {
      conditions.push(`c.completed_at >= $${paramIndex}`)
      params.push(filters.completedAfter)
      paramIndex++
    }
    if (filters.completedBefore) {
      conditions.push(`c.completed_at <= $${paramIndex}`)
      params.push(filters.completedBefore)
      paramIndex++
    }
  }

  if (tableAlias === 'p') {
    conditions.push(`p.is_public = true`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { whereClause, params }
}

function buildOrderBy(sort?: `${SortField}:${SortOrder}`, tableAlias: string = 'p'): string {
  if (!sort) {
    return `${tableAlias}.created_at DESC`
  }

  const [field, order] = sort.split(':')
  const sortOrder = (order === 'asc' || order === 'desc') ? order.toUpperCase() : 'DESC'

  const fieldMap: Record<SortField, string> = {
    relevance: `${tableAlias}.created_at`,
    budget: tableAlias === 'p' ? 'COALESCE(p.budget_max, p.budget_min)' : 'c.total_amount',
    created_at: `${tableAlias}.created_at`,
    deadline: tableAlias === 'p' ? 'p.deadline' : 'c.created_at',
    completed_at: `${tableAlias}.completed_at`,
    status: `${tableAlias}.status`,
  }

  const orderByField = fieldMap[field as SortField] || `${tableAlias}.created_at`
  return `${orderByField} ${sortOrder} NULLS LAST`
}

export async function searchProjects(
  q: string | undefined,
  filters: SearchFilters,
  page: number,
  limit: number
): Promise<{ results: ProjectResult[]; total: number }> {
  const offset = (page - 1) * limit
  const { whereClause, params } = buildSearchConditions(q, filters, 'p')
  const orderBy = buildOrderBy(filters.sort, 'p')

  const countQuery = `
    SELECT COUNT(*) as total
    FROM projects p
    ${whereClause}
  `

  const dataQuery = `
    SELECT p.*
    FROM projects p
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `

  const countParams = [...params]
  const dataParams = [...params, limit, offset]

  const [countResult, dataResult] = await Promise.all([
    sql(countQuery, countParams) as Promise<[{ total: string }]>,
    sql(dataQuery, dataParams) as Promise<Record<string, unknown>[]>
  ])

  const total = Number(countResult[0]?.total || 0)
  const results = dataResult.map(rowToProject)

  return { results, total }
}

export async function searchContracts(
  q: string | undefined,
  filters: SearchFilters,
  page: number,
  limit: number
): Promise<{ results: ContractResult[]; total: number }> {
  const offset = (page - 1) * limit
  const { whereClause, params } = buildSearchConditions(q, filters, 'c')
  const orderBy = buildOrderBy(filters.sort, 'c')

  const countQuery = `
    SELECT COUNT(*) as total
    FROM contracts c
    JOIN projects p ON p.id = c.project_id
    ${whereClause}
  `

  const dataQuery = `
    SELECT c.*
    FROM contracts c
    JOIN projects p ON p.id = c.project_id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `

  const countParams = [...params]
  const dataParams = [...params, limit, offset]

  const [countResult, dataResult] = await Promise.all([
    sql(countQuery, countParams) as Promise<[{ total: string }]>,
    sql(dataQuery, dataParams) as Promise<Record<string, unknown>[]>
  ])

  const total = Number(countResult[0]?.total || 0)
  const results = dataResult.map(rowToContract)

  return { results, total }
}

function toISOString(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function rowToProject(row: Record<string, unknown>): ProjectResult {
  return {
    type: 'project',
    id: row.id as string,
    clientId: row.client_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    tags: (row.tags as string[]) ?? [],
    budgetMin: row.budget_min !== null ? Number(row.budget_min) : null,
    budgetMax: row.budget_max !== null ? Number(row.budget_max) : null,
    currency: row.currency as string,
    deadline: toISOString(row.deadline),
    startedAt: toISOString(row.started_at),
    completedAt: toISOString(row.completed_at),
    status: row.status as ProjectStatus,
    chainId: (row.chain_id as number | null) ?? null,
    contractAddress: (row.contract_address as string | null) ?? null,
    txHash: (row.tx_hash as string | null) ?? null,
    isPublic: row.is_public as boolean,
    maxApplicants: (row.max_applicants as number | null) ?? null,
    createdAt: toISOString(row.created_at) ?? '',
    updatedAt: toISOString(row.updated_at) ?? '',
  }
}

function rowToContract(row: Record<string, unknown>): ContractResult {
  return {
    type: 'contract',
    id: row.id as string,
    projectId: row.project_id as string,
    clientId: row.client_id as string,
    freelancerId: row.freelancer_id as string,
    terms: (row.terms as string | null) ?? null,
    termsIpfsCid: (row.terms_ipfs_cid as string | null) ?? null,
    agreedAt: toISOString(row.agreed_at),
    totalAmount: Number(row.total_amount),
    currency: row.currency as string,
    escrowAddress: (row.escrow_address as string | null) ?? null,
    escrowStatus: row.escrow_status as string,
    fundedAt: toISOString(row.funded_at),
    fundingTxHash: (row.funding_tx_hash as string | null) ?? null,
    status: row.status as ContractStatus,
    startedAt: toISOString(row.started_at),
    completedAt: toISOString(row.completed_at),
    cancelledAt: toISOString(row.cancelled_at),
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
    chainId: (row.chain_id as number | null) ?? null,
    contractTxHash: (row.contract_tx_hash as string | null) ?? null,
    activeDisputeId: (row.active_dispute_id as string | null) ?? null,
    createdAt: toISOString(row.created_at) ?? '',
    updatedAt: toISOString(row.updated_at) ?? '',
  }
}

export async function searchFreelancers(q: string | undefined, limit: number): Promise<FreelancerResult[]> {
  const needle = q ? `%${q}%` : '%'
  const rows = await sql`
    SELECT id, username, bio, skills, avg_rating
    FROM users
    WHERE role = 'freelancer'
      AND is_active = true
      AND is_banned = false
      AND (
        username ILIKE ${needle}
        OR bio ILIKE ${needle}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(skills, ARRAY[]::text[])) s
          WHERE s ILIKE ${needle}
        )
      )
    ORDER BY avg_rating DESC NULLS LAST
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'freelancer',
    id: r.id as string,
    name: r.username as string,
    bio: (r.bio as string) ?? '',
    skills: (r.skills as string[]) ?? [],
    rating: Number(r.avg_rating ?? 0),
  }))
}

export async function searchClients(q: string | undefined, limit: number): Promise<ClientResult[]> {
  const needle = q ? `%${q}%` : '%'
  const rows = await sql`
    SELECT id, username, wallet_address
    FROM users
    WHERE role = 'client'
      AND is_active = true
      AND is_banned = false
      AND (username ILIKE ${needle} OR wallet_address ILIKE ${needle})
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    type: 'client',
    id: r.id as string,
    name: r.username as string,
    walletAddress: (r.wallet_address as string) ?? '',
  }))
}

export async function globalSearch(
  q: string | undefined,
  filters: SearchFilters,
  page: number = 1,
  limit: number = SEARCH_LIMIT_DEFAULT
): Promise<SearchResponse> {
  const safeLimit = Math.min(Math.max(1, limit), SEARCH_LIMIT_MAX)
  const safePage = Math.max(1, page)
  const typeFilter = filters.type || 'all'

  const searches: Promise<{ results: SearchResult[]; total: number }>[] = []

  if (typeFilter === 'all' || typeFilter === 'project') {
    searches.push(searchProjects(q, filters, safePage, safeLimit))
  }
  if (typeFilter === 'all' || typeFilter === 'contract') {
    searches.push(searchContracts(q, filters, safePage, safeLimit))
  }

  const [projectResult, contractResult] = await Promise.all([
    typeFilter === 'all' || typeFilter === 'project' ? searchProjects(q, filters, safePage, safeLimit) : Promise.resolve({ results: [], total: 0 }),
    typeFilter === 'all' || typeFilter === 'contract' ? searchContracts(q, filters, safePage, safeLimit) : Promise.resolve({ results: [], total: 0 }),
  ])

  const freelancerLimit = typeFilter === 'all' ? Math.ceil(safeLimit / 2) : 0
  const clientLimit = typeFilter === 'all' ? Math.ceil(safeLimit / 2) : 0

  const [freelancers, clients] = await Promise.all([
    freelancerLimit > 0 ? searchFreelancers(q, freelancerLimit) : Promise.resolve([]),
    clientLimit > 0 ? searchClients(q, clientLimit) : Promise.resolve([]),
  ])

  const allResults: SearchResult[] = [
    ...projectResult.results,
    ...contractResult.results,
    ...freelancers,
    ...clients,
  ]

  const total = projectResult.total + contractResult.total + freelancers.length + clients.length

  return {
    query: q ?? '',
    filters,
    results: allResults,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
      hasMore: safePage * safeLimit < total,
    },
    counts: {
      projects: projectResult.total,
      contracts: contractResult.total,
      freelancers: freelancers.length,
      clients: clients.length,
    },
  }
}