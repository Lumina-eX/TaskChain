/**
 * Project Discovery API helper.
 *
 * Encapsulates the SQL query logic, pagination math, sort/filter validation,
 * and DB row → API response mapping used by GET /api/projects/discover.
 *
 * The data source is the `projects` table. Filters supported:
 *   - free-text query over title/description
 *   - one or more project statuses
 *   - required skills (a project must have *all* of them)
 *   - min / max budget (inclusive)
 *
 * Sorting is whitelisted through `PROJECT_SORTABLE_FIELDS` so caller-supplied
 * values never reach the SQL identifier position.
 */

import { sql } from '@/lib/db'

/** Fields that can be used as sort keys. Whitelisted to prevent SQL injection. */
export const PROJECT_SORTABLE_FIELDS = ['created_at', 'budget', 'deadline'] as const
export type ProjectSortField = (typeof PROJECT_SORTABLE_FIELDS)[number]

export const PROJECT_SORT_ORDERS = ['asc', 'desc'] as const
export type ProjectSortOrder = (typeof PROJECT_SORT_ORDERS)[number]

/** Statuses a project can be filtered by. Mirrors lib/projects.ts. */
export const PROJECT_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** Pagination bounds. `limit` is clamped to keep responses reasonable. */
export const PROJECT_DEFAULT_LIMIT = 9
export const PROJECT_MAX_LIMIT = 50
export const PROJECT_DEFAULT_PAGE = 1

export interface ProjectListing {
  id: string
  clientId: string
  title: string
  description: string | null
  budgetUsdc: number
  status: ProjectStatus
  skills: string[]
  category: string | null
  deadline: string | null
  createdAt: string
}

export interface ListProjectsParams {
  /** Free-text query matching title or description (case-insensitive). */
  query: string
  /** Selected statuses. Empty = no status filter. */
  statuses: string[]
  /** Required skills (a project must have *all* of them). Empty = no filter. */
  skills: string[]
  /** Inclusive minimum budget. Null = no lower bound. */
  minBudget: number | null
  /** Inclusive maximum budget. Null = no upper bound. */
  maxBudget: number | null
  /** Sort column. */
  sort: ProjectSortField
  /** Sort direction. */
  order: ProjectSortOrder
  /** 1-based page number. */
  page: number
  /** Items per page (1..PROJECT_MAX_LIMIT). */
  limit: number
}

export interface ListProjectsResult {
  projects: ProjectListing[]
  totalItems: number
}

export interface ProjectListResponse {
  projects: ProjectListing[]
  skills: string[]
  statuses: readonly string[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export class ProjectDiscoveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ProjectDiscoveryError'
  }
}

interface ProjectRow {
  id: string
  client_id: string
  title: string
  description: string | null
  budget_usdc: number | string
  status: string
  skills: string[] | null
  category: string | null
  deadline: Date | string | null
  created_at: Date | string
}

interface ProjectRowWithCount extends ProjectRow {
  total_count: string | number
}

interface SkillRow {
  skill: string | null
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : value
}

/** Convert a DB row to the API listing shape. */
export function mapProjectRowToListing(row: ProjectRow): ProjectListing {
  const budget =
    typeof row.budget_usdc === 'number' ? row.budget_usdc : Number(row.budget_usdc)

  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description ?? null,
    budgetUsdc: Number.isFinite(budget) ? budget : 0,
    status: row.status as ProjectStatus,
    skills: Array.isArray(row.skills) ? row.skills : [],
    category: row.category ?? null,
    deadline: toIso(row.deadline),
    createdAt: toIso(row.created_at) ?? '',
  }
}

/**
 * Normalize a query string so it is safe to embed inside a Postgres ILIKE
 * pattern (escape `\`, `%` and `_`).
 */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Build the WHERE fragment in a single sql`` call so every filter is
 * parameterised (no string interpolation) while keeping conditional semantics
 * via the standard `NULL = NULL OR <condition>` pattern.
 */
function buildWhereFragment(params: ListProjectsParams): ReturnType<typeof sql> {
  const normalizedQuery = params.query.trim()
  const needle = normalizedQuery
    ? `%${escapeIlike(normalizedQuery.toLowerCase())}%`
    : null
  const statusArray = params.statuses.length > 0 ? params.statuses : []
  const skillArray = params.skills.length > 0 ? params.skills : []

  return sql`
    (
      ${needle}::text IS NULL
      OR LOWER(p.title) LIKE ${needle} ESCAPE '\\'
      OR LOWER(COALESCE(p.description, '')) LIKE ${needle} ESCAPE '\\'
    )
    AND (
      cardinality(${statusArray}::text[]) = 0
      OR p.status = ANY(${statusArray}::text[])
    )
    AND (
      cardinality(${skillArray}::text[]) = 0
      OR COALESCE(p.skills, ARRAY[]::text[]) @> ${skillArray}::text[]
    )
    AND (
      ${params.minBudget}::numeric IS NULL
      OR p.budget_usdc >= ${params.minBudget}::numeric
    )
    AND (
      ${params.maxBudget}::numeric IS NULL
      OR p.budget_usdc <= ${params.maxBudget}::numeric
    )
  `
}

/**
 * Build a fully-static ORDER BY fragment for the (sort, order) pair. `sort`
 * and `order` are pre-validated against a whitelist, so no caller-controlled
 * string is interpolated into the SQL identifier position.
 */
function buildOrderBy(
  sort: ProjectSortField,
  order: ProjectSortOrder,
): ReturnType<typeof sql> {
  switch (sort) {
    case 'budget':
      return order === 'asc'
        ? sql`p.budget_usdc ASC NULLS LAST, p.id ASC`
        : sql`p.budget_usdc DESC NULLS LAST, p.id ASC`
    case 'deadline':
      return order === 'asc'
        ? sql`p.deadline ASC NULLS LAST, p.id ASC`
        : sql`p.deadline DESC NULLS LAST, p.id ASC`
    case 'created_at':
      return order === 'asc'
        ? sql`p.created_at ASC NULLS LAST, p.id ASC`
        : sql`p.created_at DESC NULLS LAST, p.id ASC`
  }
}

/**
 * Lists projects using a single round-trip per page (data + COUNT(*) OVER()),
 * falling back to a dedicated COUNT query when the requested page is past the
 * end so pagination metadata stays accurate.
 */
export async function listProjects(
  params: ListProjectsParams,
): Promise<ListProjectsResult> {
  const where = buildWhereFragment(params)
  const orderBy = buildOrderBy(params.sort, params.order)
  const offset = (params.page - 1) * params.limit

  const rows = (await sql`
    SELECT
      p.id,
      p.client_id,
      p.title,
      p.description,
      p.budget_usdc,
      p.status,
      p.skills,
      p.category,
      p.deadline,
      p.created_at,
      COUNT(*) OVER() AS total_count
    FROM projects p
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${params.limit}
    OFFSET ${offset}
  `) as ProjectRowWithCount[]

  let totalItems: number
  if (rows.length > 0) {
    const raw = rows[0].total_count
    totalItems = typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0
  } else {
    totalItems = await countProjects(params)
  }

  const projects = rows.map((row) => {
    const { total_count: _ignored, ...rest } = row
    void _ignored
    return mapProjectRowToListing(rest as ProjectRow)
  })

  return { projects, totalItems }
}

async function countProjects(params: ListProjectsParams): Promise<number> {
  const where = buildWhereFragment(params)
  const rows = (await sql`
    SELECT COUNT(*) AS count FROM projects p WHERE ${where}
  `) as Array<{ count: string | number }>
  const value = rows[0]?.count ?? 0
  return typeof value === 'number' ? value : parseInt(String(value), 10) || 0
}

/** Returns the distinct skills currently attached to any project. */
export async function getAvailableSkills(): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT skill
    FROM projects p, unnest(COALESCE(p.skills, ARRAY[]::text[])) AS skill
    ORDER BY skill ASC
  `) as SkillRow[]

  return rows
    .map((row) => row.skill)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
}

// ---------- Query parameter parsing & validation ---------------------------

function parseInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

function parseOptionalBudget(value: string | null, label: string): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ProjectDiscoveryError(
      'INVALID_BUDGET',
      `${label} must be a non-negative number`,
    )
  }
  return parsed
}

function parseList(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of raw) {
    for (const item of chunk.split(',')) {
      const trimmed = item.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out
}

function parseStatuses(raw: string[]): string[] {
  const statuses = parseList(raw)
  for (const status of statuses) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
      throw new ProjectDiscoveryError(
        'INVALID_STATUS',
        `status must be one of: ${PROJECT_STATUSES.join(', ')}`,
      )
    }
  }
  return statuses
}

function parseSort(value: string | null): ProjectSortField {
  const candidate = value ?? 'created_at'
  if ((PROJECT_SORTABLE_FIELDS as readonly string[]).includes(candidate)) {
    return candidate as ProjectSortField
  }
  throw new ProjectDiscoveryError(
    'INVALID_SORT_FIELD',
    `sort must be one of: ${PROJECT_SORTABLE_FIELDS.join(', ')}`,
  )
}

function parseOrder(value: string | null): ProjectSortOrder {
  const candidate = (value ?? 'desc').toLowerCase()
  if ((PROJECT_SORT_ORDERS as readonly string[]).includes(candidate)) {
    return candidate as ProjectSortOrder
  }
  throw new ProjectDiscoveryError(
    'INVALID_SORT_ORDER',
    `order must be one of: ${PROJECT_SORT_ORDERS.join(', ')}`,
  )
}

function parseLimit(value: string | null): number {
  const parsed = parseInteger(value, PROJECT_DEFAULT_LIMIT)
  if (parsed < 1) {
    throw new ProjectDiscoveryError(
      'INVALID_LIMIT',
      'limit must be greater than or equal to 1',
    )
  }
  return Math.min(parsed, PROJECT_MAX_LIMIT)
}

function parsePage(value: string | null): number {
  const parsed = parseInteger(value, PROJECT_DEFAULT_PAGE)
  if (parsed < 1) {
    throw new ProjectDiscoveryError(
      'INVALID_PAGE',
      'page must be greater than or equal to 1',
    )
  }
  return parsed
}

/**
 * Parses and validates the search-parameters from the request URL. Accepts
 * `?status=` repeated or comma-separated, `?skills=` repeated or
 * comma-separated, and `?q=`/`?query=` for the free-text search.
 */
export function parseDiscoveryParams(
  searchParams: URLSearchParams,
): ListProjectsParams {
  const query = (searchParams.get('q') ?? searchParams.get('query') ?? '').trim()
  const statuses = parseStatuses(searchParams.getAll('status'))
  const skills = parseList(searchParams.getAll('skills'))
  const minBudget = parseOptionalBudget(searchParams.get('minBudget'), 'minBudget')
  const maxBudget = parseOptionalBudget(searchParams.get('maxBudget'), 'maxBudget')

  if (minBudget !== null && maxBudget !== null && minBudget > maxBudget) {
    throw new ProjectDiscoveryError(
      'INVALID_BUDGET_RANGE',
      'minBudget cannot be greater than maxBudget',
    )
  }

  const sort = parseSort(searchParams.get('sort'))
  const order = parseOrder(searchParams.get('order'))
  const limit = parseLimit(searchParams.get('limit'))
  const page = parsePage(searchParams.get('page'))

  return { query, statuses, skills, minBudget, maxBudget, sort, order, limit, page }
}

/**
 * Builds the JSON response shape for GET /api/projects/discover, including
 * pagination metadata and the list of available skills for the filter UI.
 */
export async function buildListResponse(
  params: ListProjectsParams,
): Promise<ProjectListResponse> {
  const result = await listProjects(params)
  const skills = await getAvailableSkills()

  const totalItems = result.totalItems
  const pageSize = result.projects.length
  const totalPages = Math.max(1, Math.ceil(totalItems / params.limit))
  const currentPage = Math.min(params.page, totalPages)

  return {
    projects: result.projects,
    skills,
    statuses: PROJECT_STATUSES,
    pagination: {
      page: currentPage === 0 ? 1 : currentPage,
      pageSize,
      totalItems,
      totalPages,
    },
  }
}
