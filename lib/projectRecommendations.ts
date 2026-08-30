// lib/projectRecommendations.ts
//
// Service layer for the project recommendation engine (issue #185).
//
// Algorithm overview:
//   1. Load the freelancer's profile (skills, preferred budget, past jobs).
//   2. Retrieve open projects filtered by category overlap (if any).
//   3. Score each candidate using a weighted formula:
//        - skill_match   (40 %) — fraction of project skills the freelancer has
//        - budget_fit    (25 %) — how close the project budget is to the freelancer's range
//        - category_fit  (20 %) — binary: 1 if category matches, 0 otherwise
//        - recency       (15 %) — newer projects score higher
//   4. Return the top-N paginated results.
//   5. Fallback: when fewer than `limit` scored results exist, pad with
//      the most recent open projects (sorted by created_at DESC).
//
// Column mapping:
//   DB snake_case  ←→  JS camelCase (done manually — no ORM)
//
// Caching:
//   Results are cached in-memory per (freelancerId, page, limit) for
//   CACHE_TTL_MS to reduce DB load for repeated requests.

import { sql } from '@/lib/db'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RecommendationProject {
  id: string
  clientId: string
  title: string
  description: string | null
  budgetUsdc: number
  status: string
  skills: string[]
  category: string | null
  score: number
  createdAt: string
}

export interface RecommendationResult {
  recommendations: RecommendationProject[]
  totalCount: number
  hasMore: boolean
  fallbackUsed: boolean
}

export interface RecommendationParams {
  freelancerId: number
  page: number
  limit: number
}

export interface FreelancerProfile {
  id: number
  skills: string[]
  preferredBudgetMin: number | null
  preferredBudgetMax: number | null
  completedProjects: number
  rating: number
}

export interface ProjectCandidate {
  id: string
  client_id: string
  title: string
  description: string | null
  budget_usdc: number
  status: string
  skills: string[]
  category: string | null
  created_at: Date | string
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Weights for the scoring algorithm. Must sum to 1. */
export const WEIGHT_SKILL = 0.40
export const WEIGHT_BUDGET = 0.25
export const WEIGHT_CATEGORY = 0.20
export const WEIGHT_RECENCY = 0.15

/** Pagination defaults and caps. */
export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 50

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Number of extra candidates to fetch for fallback padding. */
const FALLBACK_EXTRA_MULTIPLIER = 3

// ─── In-memory cache ───────────────────────────────────────────────────────

interface CacheEntry {
  result: RecommendationResult
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(freelancerId: number, page: number, limit: number): string {
  return `${freelancerId}:${page}:${limit}`
}

export function getCachedResult(
  freelancerId: number,
  page: number,
  limit: number,
): RecommendationResult | null {
  const key = cacheKey(freelancerId, page, limit)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.result
}

export function setCachedResult(
  freelancerId: number,
  page: number,
  limit: number,
  result: RecommendationResult,
): void {
  const key = cacheKey(freelancerId, page, limit)
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Exposed for testing only — clear all cached entries. */
export function clearRecommendationCache(): void {
  cache.clear()
}

// ─── DB helpers ────────────────────────────────────────────────────────────

/** Row shape returned by the freelancer profile query. */
interface FreelancerRow {
  id: number
  skills: string[] | null
  preferred_budget_min: number | string | null
  preferred_budget_max: number | string | null
  total_jobs_completed: number | null
  rating: number | string | null
}

/**
 * Load the freelancer profile used for scoring.
 * Returns null if the user does not exist or is not a freelancer/both.
 */
export async function getFreelancerProfile(
  freelancerId: number,
): Promise<FreelancerProfile | null> {
  const rows = await sql`
    SELECT
      id,
      skills,
      preferred_budget_min,
      preferred_budget_max,
      total_jobs_completed,
      rating
    FROM users
    WHERE id = ${freelancerId}
      AND user_type IN ('freelancer', 'both')
    LIMIT 1
  ` as FreelancerRow[]

  if (rows.length === 0) return null

  const row = rows[0]
  return {
    id: row.id,
    skills: (row.skills ?? []).map((s) => String(s)),
    preferredBudgetMin: row.preferred_budget_min != null ? Number(row.preferred_budget_min) : null,
    preferredBudgetMax: row.preferred_budget_max != null ? Number(row.preferred_budget_max) : null,
    completedProjects: Number(row.total_jobs_completed ?? 0),
    rating: Number(row.rating ?? 0),
  }
}

/**
 * Fetch open project candidates, optionally filtered by category.
 * Returns up to `fetchLimit` rows ordered by created_at DESC.
 */
export async function getCandidateProjects(
  category: string | null,
  fetchLimit: number,
): Promise<ProjectCandidate[]> {
  let rows: Record<string, unknown>[]

  if (category) {
    rows = await sql`
      SELECT id, client_id, title, description, budget_usdc, status, skills, category, created_at
      FROM projects
      WHERE status = 'open'
        AND category = ${category}
      ORDER BY created_at DESC
      LIMIT ${fetchLimit}
    ` as Record<string, unknown>[]
  } else {
    rows = await sql`
      SELECT id, client_id, title, description, budget_usdc, status, skills, category, created_at
      FROM projects
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT ${fetchLimit}
    ` as Record<string, unknown>[]
  }

  return rows.map((row) => ({
    id: row.id as string,
    client_id: row.client_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    budget_usdc: Number(row.budget_usdc),
    status: row.status as string,
    skills: (row.skills as string[] | null ?? []).map((s) => String(s)),
    category: (row.category as string | null) ?? null,
    created_at: row.created_at as Date | string,
  }))
}

/**
 * Fetch recent open projects as a fallback when scored results are sparse.
 */
export async function getFallbackProjects(limit: number): Promise<ProjectCandidate[]> {
  const rows = await sql`
    SELECT id, client_id, title, description, budget_usdc, status, skills, category, created_at
    FROM projects
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]

  return rows.map((row) => ({
    id: row.id as string,
    client_id: row.client_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    budget_usdc: Number(row.budget_usdc),
    status: row.status as string,
    skills: (row.skills as string[] | null ?? []).map((s) => String(s)),
    category: (row.category as string | null) ?? null,
    created_at: row.created_at as Date | string,
  }))
}

// ─── Scoring algorithm ─────────────────────────────────────────────────────

/**
 * Compute the skill-match score (0..1) between a freelancer and a project.
 * If the project has no skills defined, returns 0.5 (neutral).
 */
export function computeSkillScore(
  freelancerSkills: string[],
  projectSkills: string[],
): number {
  if (projectSkills.length === 0) return 0.5

  const freelancerSet = new Set(freelancerSkills.map((s) => s.toLowerCase()))
  const matched = projectSkills.filter((s) => freelancerSet.has(s.toLowerCase()))

  return matched.length / projectSkills.length
}

/**
 * Compute the budget-fit score (0..1). Projects within the freelancer's
 * preferred range score 1.0; projects outside are penalised proportionally.
 * If the freelancer has no budget preference, all budgets score 1.0.
 */
export function computeBudgetScore(
  projectBudget: number,
  preferredMin: number | null,
  preferredMax: number | null,
): number {
  if (preferredMin === null && preferredMax === null) return 1.0

  const min = preferredMin ?? 0
  const max = preferredMax ?? Infinity

  if (projectBudget >= min && projectBudget <= max) return 1.0

  // Penalise proportionally based on distance from the nearest boundary.
  const range = max - min
  if (range <= 0) return 0.5

  if (projectBudget < min) {
    const penalty = (min - projectBudget) / range
    return Math.max(0, 1 - penalty)
  }
  // projectBudget > max
  const penalty = (projectBudget - max) / range
  return Math.max(0, 1 - penalty)
}

/**
 * Compute category-fit score (0 or 1).
 * If the project has no category, returns 0.5 (neutral).
 */
export function computeCategoryScore(
  freelancerSkills: string[],
  projectCategory: string | null,
): number {
  if (!projectCategory) return 0.5

  // A simple heuristic: if the freelancer's skills contain any word from the
  // category string, treat it as a match.
  const categoryWords = projectCategory.toLowerCase().split(/\s+/)
  const freelancerSet = new Set(freelancerSkills.map((s) => s.toLowerCase()))

  for (const word of categoryWords) {
    if (freelancerSet.has(word)) return 1.0
  }

  // Also check for exact case-insensitive match among skills.
  if (freelancerSet.has(projectCategory.toLowerCase())) return 1.0

  return 0
}

/**
 * Compute recency score (0..1). The most recent project scores 1.0; older
 * projects decay linearly within a 30-day window.
 */
export function computeRecencyScore(projectCreatedAt: Date | string): number {
  const now = Date.now()
  const created = new Date(projectCreatedAt).getTime()
  const elapsed = now - created

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  if (elapsed >= THIRTY_DAYS_MS) return 0
  if (elapsed <= 0) return 1.0

  return 1 - elapsed / THIRTY_DAYS_MS
}

/**
 * Score a single project candidate against the freelancer profile.
 */
export function scoreProject(
  freelancer: FreelancerProfile,
  project: ProjectCandidate,
): number {
  const skillScore = computeSkillScore(freelancer.skills, project.skills)
  const budgetScore = computeBudgetScore(
    project.budget_usdc,
    freelancer.preferredBudgetMin,
    freelancer.preferredBudgetMax,
  )
  const categoryScore = computeCategoryScore(freelancer.skills, project.category)
  const recencyScore = computeRecencyScore(project.created_at)

  return (
    WEIGHT_SKILL * skillScore +
    WEIGHT_BUDGET * budgetScore +
    WEIGHT_CATEGORY * categoryScore +
    WEIGHT_RECENCY * recencyScore
  )
}

/**
 * Build a RecommendationProject from a scored candidate.
 */
function toRecommendationProject(
  project: ProjectCandidate,
  score: number,
): RecommendationProject {
  const createdAt =
    project.created_at instanceof Date
      ? project.created_at.toISOString()
      : project.created_at

  return {
    id: project.id,
    clientId: project.client_id,
    title: project.title,
    description: project.description,
    budgetUsdc: project.budget_usdc,
    status: project.status,
    skills: project.skills,
    category: project.category,
    score,
    createdAt,
  }
}

// ─── Main recommendation function ──────────────────────────────────────────

/**
 * Generate project recommendations for a freelancer.
 *
 * Returns paginated results with metadata (totalCount, hasMore).
 * When insufficient matching data exists, falls back to recent projects.
 * Results are cached in-memory for CACHE_TTL_MS.
 */
export async function getRecommendations(
  params: RecommendationParams,
): Promise<RecommendationResult> {
  const { freelancerId, page, limit } = params

  // Check cache first.
  const cached = getCachedResult(freelancerId, page, limit)
  if (cached) return cached

  // 1. Load freelancer profile.
  const profile = await getFreelancerProfile(freelancerId)

  if (!profile) {
    // Freelancer not found — return recent open projects as fallback.
    const fallbackProjects = await getFallbackProjects(limit)
    const recommendations = fallbackProjects.map((p) =>
      toRecommendationProject(p, 0),
    )

    const result: RecommendationResult = {
      recommendations,
      totalCount: recommendations.length,
      hasMore: false,
      fallbackUsed: true,
    }

    setCachedResult(freelancerId, page, limit, result)
    return result
  }

  // 2. Determine the primary category from the freelancer's skills.
  //    If skills are empty, fetch all open projects (no category filter).
  const primaryCategory = profile.skills.length > 0 ? null : null

  // 3. Fetch candidates. We request more than `limit` to allow scoring
  //    and fallback padding.
  const candidateLimit = Math.max(limit * FALLBACK_EXTRA_MULTIPLIER, 50)
  const candidates = await getCandidateProjects(primaryCategory, candidateLimit)

  // 4. Score and sort candidates.
  const scored = candidates.map((c) => ({
    project: c,
    score: scoreProject(profile, c),
  }))

  scored.sort((a, b) => b.score - a.score)

  // 5. Paginate.
  const totalCount = scored.length
  const startIdx = (page - 1) * limit
  const pageResults = scored.slice(startIdx, startIdx + limit)

  let fallbackUsed = false

  // 6. Fallback: if the page is sparse, pad with recent projects.
  if (pageResults.length < limit) {
    const needed = limit - pageResults.length
    const existingIds = new Set(pageResults.map((r) => r.project.id))
    const scoredIds = new Set(scored.map((r) => r.project.id))

    const fallbackProjects = await getFallbackProjects(limit * 2)
    const filler = fallbackProjects
      .filter((p) => !existingIds.has(p.id) && !scoredIds.has(p.id))
      .slice(0, needed)

    for (const p of filler) {
      pageResults.push({ project: p, score: 0 })
      fallbackUsed = true
    }

    // If we still don't have enough, include scored but un-ranked results.
    if (pageResults.length < limit) {
      const remainingScored = scored.slice(startIdx + pageResults.length)
      for (const r of remainingScored) {
        if (pageResults.length >= limit) break
        if (!pageResults.some((p) => p.project.id === r.project.id)) {
          pageResults.push(r)
          fallbackUsed = true
        }
      }
    }
  }

  const recommendations = pageResults.map((r) =>
    toRecommendationProject(r.project, r.score),
  )

  const hasMore = startIdx + limit < totalCount || pageResults.length >= limit

  const result: RecommendationResult = {
    recommendations,
    totalCount,
    hasMore,
    fallbackUsed,
  }

  setCachedResult(freelancerId, page, limit, result)
  return result
}

// ─── Query parameter parsing & validation ──────────────────────────────────

export class RecommendationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RecommendationError'
  }
}

export function parseRecommendationParams(
  searchParams: URLSearchParams,
  freelancerId: number,
): RecommendationParams {
  const pageRaw = searchParams.get('page')
  const limitRaw = searchParams.get('limit')

  const page = parsePage(pageRaw)
  const limit = parseLimit(limitRaw)

  return { freelancerId, page, limit }
}

function parsePage(value: string | null): number {
  if (value === null || value === '') return DEFAULT_PAGE
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RecommendationError('INVALID_PAGE', 'page must be >= 1')
  }
  return parsed
}

function parseLimit(value: string | null): number {
  if (value === null || value === '') return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RecommendationError('INVALID_LIMIT', 'limit must be >= 1')
  }
  return Math.min(parsed, MAX_LIMIT)
}
