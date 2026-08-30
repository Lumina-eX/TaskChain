import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  computeSkillScore,
  computeBudgetScore,
  computeCategoryScore,
  computeRecencyScore,
  scoreProject,
  getRecommendations,
  parseRecommendationParams,
  clearRecommendationCache,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  WEIGHT_SKILL,
  WEIGHT_BUDGET,
  WEIGHT_CATEGORY,
  WEIGHT_RECENCY,
  type FreelancerProfile,
  type ProjectCandidate,
} from '@/lib/projectRecommendations'

// ─── Mock DB ───────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/db'

type SqlMock = ReturnType<typeof vi.fn>

function queueSql(responses: unknown[]) {
  const mock = sql as unknown as SqlMock
  for (const response of responses) {
    mock.mockResolvedValueOnce(response)
  }
}

function queueSqlReject(error: unknown) {
  const mock = sql as unknown as SqlMock
  mock.mockRejectedValueOnce(error)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearRecommendationCache()
})

// ─── Scoring unit tests ────────────────────────────────────────────────────

describe('computeSkillScore', () => {
  it('returns 1.0 when the freelancer has all project skills', () => {
    expect(computeSkillScore(['React', 'Node.js'], ['React', 'Node.js'])).toBe(1.0)
  })

  it('returns 0.5 when the project has no skills defined', () => {
    expect(computeSkillScore(['React'], [])).toBe(0.5)
  })

  it('returns 0 when there is no overlap', () => {
    expect(computeSkillScore(['Python', 'Django'], ['React', 'Node.js'])).toBe(0)
  })

  it('handles case-insensitive matching', () => {
    expect(computeSkillScore(['react', 'Node.JS'], ['React', 'Node.js'])).toBe(1.0)
  })

  it('returns partial score for partial match', () => {
    expect(computeSkillScore(['React'], ['React', 'Node.js', 'TypeScript'])).toBeCloseTo(1 / 3)
  })
})

describe('computeBudgetScore', () => {
  it('returns 1.0 when no budget preference is set', () => {
    expect(computeBudgetScore(500, null, null)).toBe(1.0)
  })

  it('returns 1.0 when budget is within range', () => {
    expect(computeBudgetScore(500, 200, 1000)).toBe(1.0)
  })

  it('returns 1.0 when budget matches min exactly', () => {
    expect(computeBudgetScore(200, 200, 1000)).toBe(1.0)
  })

  it('returns 1.0 when budget matches max exactly', () => {
    expect(computeBudgetScore(1000, 200, 1000)).toBe(1.0)
  })

  it('penalises budget below min', () => {
    const score = computeBudgetScore(100, 200, 1000)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1.0)
  })

  it('penalises budget above max', () => {
    const score = computeBudgetScore(1500, 200, 1000)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1.0)
  })

  it('handles only min preference set', () => {
    expect(computeBudgetScore(500, 200, null)).toBe(1.0)
    expect(computeBudgetScore(100, 200, null)).toBeGreaterThan(0)
  })

  it('handles only max preference set', () => {
    expect(computeBudgetScore(500, null, 1000)).toBe(1.0)
    expect(computeBudgetScore(1500, null, 1000)).toBeGreaterThan(0)
  })
})

describe('computeCategoryScore', () => {
  it('returns 1.0 when a skill matches the category', () => {
    expect(computeCategoryScore(['React', 'Node.js'], 'React')).toBe(1.0)
  })

  it('returns 0.5 when no category is defined', () => {
    expect(computeCategoryScore(['React'], null)).toBe(0.5)
  })

  it('returns 0 when no skill matches the category', () => {
    expect(computeCategoryScore(['Python', 'Django'], 'React')).toBe(0)
  })

  it('handles multi-word categories', () => {
    expect(computeCategoryScore(['web', 'design'], 'web design')).toBe(1.0)
  })
})

describe('computeRecencyScore', () => {
  it('returns 1.0 for a project created right now', () => {
    const score = computeRecencyScore(new Date())
    expect(score).toBeCloseTo(1.0, 1)
  })

  it('returns ~0 for a project created 30+ days ago', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    expect(computeRecencyScore(thirtyOneDaysAgo)).toBe(0)
  })

  it('returns a value between 0 and 1 for a project created 15 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    const score = computeRecencyScore(fifteenDaysAgo)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1.0)
  })
})

describe('scoreProject', () => {
  const freelancer: FreelancerProfile = {
    id: 1,
    skills: ['React', 'TypeScript'],
    preferredBudgetMin: 500,
    preferredBudgetMax: 2000,
    completedProjects: 10,
    rating: 4.5,
  }

  const project: ProjectCandidate = {
    id: 'proj-1',
    client_id: 'client-1',
    title: 'React Dashboard',
    description: 'Build a dashboard',
    budget_usdc: 1000,
    status: 'open',
    skills: ['React', 'TypeScript'],
    category: 'React',
    created_at: new Date().toISOString(),
  }

  it('returns a score between 0 and 1', () => {
    const score = scoreProject(freelancer, project)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('weights all components correctly', () => {
    const skillScore = computeSkillScore(freelancer.skills, project.skills)
    const budgetScore = computeBudgetScore(project.budget_usdc, freelancer.preferredBudgetMin, freelancer.preferredBudgetMax)
    const categoryScore = computeCategoryScore(freelancer.skills, project.category)
    const recencyScore = computeRecencyScore(project.created_at)

    const expected =
      WEIGHT_SKILL * skillScore +
      WEIGHT_BUDGET * budgetScore +
      WEIGHT_CATEGORY * categoryScore +
      WEIGHT_RECENCY * recencyScore

    expect(scoreProject(freelancer, project)).toBeCloseTo(expected)
  })

  it('returns higher score for better-matched projects', () => {
    const goodProject: ProjectCandidate = {
      ...project,
      skills: ['React'],
      category: 'React',
      budget_usdc: 1000,
    }
    const poorProject: ProjectCandidate = {
      ...project,
      skills: ['Python'],
      category: 'Machine Learning',
      budget_usdc: 10000,
    }

    expect(scoreProject(freelancer, goodProject)).toBeGreaterThan(
      scoreProject(freelancer, poorProject),
    )
  })
})

// ─── parseRecommendationParams ─────────────────────────────────────────────

describe('parseRecommendationParams', () => {
  it('applies defaults when no params provided', () => {
    const params = parseRecommendationParams(new URLSearchParams(), 42)
    expect(params).toEqual({ freelancerId: 42, page: DEFAULT_PAGE, limit: DEFAULT_LIMIT })
  })

  it('parses valid page and limit', () => {
    const params = parseRecommendationParams(
      new URLSearchParams('page=2&limit=20'),
      1,
    )
    expect(params.page).toBe(2)
    expect(params.limit).toBe(20)
  })

  it('clamps limit above MAX_LIMIT', () => {
    const params = parseRecommendationParams(
      new URLSearchParams(`limit=${MAX_LIMIT * 10}`),
      1,
    )
    expect(params.limit).toBe(MAX_LIMIT)
  })

  it('rejects page=0', () => {
    expect(() =>
      parseRecommendationParams(new URLSearchParams('page=0'), 1),
    ).toThrow('page must be >= 1')
  })

  it('rejects negative limit', () => {
    expect(() =>
      parseRecommendationParams(new URLSearchParams('limit=-5'), 1),
    ).toThrow('limit must be >= 1')
  })

  it('handles empty string values gracefully', () => {
    const params = parseRecommendationParams(
      new URLSearchParams('page=&limit='),
      1,
    )
    expect(params.page).toBe(DEFAULT_PAGE)
    expect(params.limit).toBe(DEFAULT_LIMIT)
  })

  it('rejects non-numeric page values', () => {
    expect(() =>
      parseRecommendationParams(new URLSearchParams('page=abc'), 1),
    ).toThrow('page must be >= 1')
  })

  it('rejects non-numeric limit values', () => {
    expect(() =>
      parseRecommendationParams(new URLSearchParams('limit=xyz'), 1),
    ).toThrow('limit must be >= 1')
  })
})

// ─── getRecommendations integration ────────────────────────────────────────

describe('getRecommendations', () => {
  const mockProfile = [
    {
      id: 1,
      skills: ['React', 'TypeScript'],
      preferred_budget_min: 500,
      preferred_budget_max: 2000,
      total_jobs_completed: 10,
      rating: 4.5,
    },
  ]

  function mockCandidateRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'proj-1',
      client_id: 'client-1',
      title: 'React Dashboard',
      description: 'Build a dashboard',
      budget_usdc: 1000,
      status: 'open',
      skills: ['React', 'TypeScript'],
      category: 'React',
      created_at: new Date().toISOString(),
      ...overrides,
    }
  }

  it('returns scored recommendations for a valid freelancer', async () => {
    queueSql([
      mockProfile,          // getFreelancerProfile
      [mockCandidateRow()], // getCandidateProjects
      [],                   // getFallbackProjects (may be called if pageResults.length < limit)
    ])

    const result = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })

    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].score).toBeGreaterThan(0)
    expect(result.recommendations[0].title).toBe('React Dashboard')
  })

  it('returns fallback results when freelancer is not found', async () => {
    queueSql([
      [],                   // getFreelancerProfile (no rows)
      [mockCandidateRow()], // getFallbackProjects
    ])

    const result = await getRecommendations({ freelancerId: 999, page: 1, limit: 10 })

    expect(result.recommendations).toHaveLength(1)
    expect(result.fallbackUsed).toBe(true)
  })

  it('returns empty results when there are no open projects', async () => {
    queueSql([
      mockProfile, // getFreelancerProfile
      [],          // getCandidateProjects (empty)
      [],          // getFallbackProjects (also empty)
    ])

    const result = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })

    expect(result.recommendations).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })

  it('paginates results correctly', async () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      mockCandidateRow({ id: `proj-${i + 1}`, title: `Project ${i + 1}` }),
    )

    queueSql([
      mockProfile, // getFreelancerProfile
      candidates,  // getCandidateProjects
    ])

    const page1 = await getRecommendations({ freelancerId: 1, page: 1, limit: 2 })
    expect(page1.recommendations).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
  })

  it('uses cache for repeated identical requests', async () => {
    queueSql([
      mockProfile,
      [mockCandidateRow()],
      [],              // getFallbackProjects
    ])

    const result1 = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })
    // Second call should use cache — no additional SQL calls
    const result2 = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })

    expect(result1).toEqual(result2)
    // Verify only 3 SQL calls were made (no extra calls for second request)
    expect(sql).toHaveBeenCalledTimes(3)
  })

  it('clears cache correctly', async () => {
    queueSql([
      mockProfile,
      [mockCandidateRow()],
      [], // getFallbackProjects
    ])

    await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })
    clearRecommendationCache()

    queueSql([
      mockProfile,
      [mockCandidateRow()],
      [], // getFallbackProjects
    ])

    // Should make fresh SQL calls after cache clear
    await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })
    expect(sql).toHaveBeenCalledTimes(6) // 3 + 3
  })

  it('sorts results by score descending', async () => {
    const candidates = [
      mockCandidateRow({
        id: 'poor',
        skills: ['Python'],
        category: 'Machine Learning',
        budget_usdc: 10000,
      }),
      mockCandidateRow({
        id: 'good',
        skills: ['React', 'TypeScript'],
        category: 'React',
        budget_usdc: 1000,
      }),
    ]

    queueSql([
      mockProfile,
      candidates,
      [], // getFallbackProjects
    ])

    const result = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })

    expect(result.recommendations[0].id).toBe('good')
    expect(result.recommendations[1].id).toBe('poor')
    expect(result.recommendations[0].score).toBeGreaterThan(
      result.recommendations[1].score,
    )
  })

  it('includes totalCount and hasMore metadata', async () => {
    queueSql([
      mockProfile,
      [mockCandidateRow()],
      [], // getFallbackProjects
    ])

    const result = await getRecommendations({ freelancerId: 1, page: 1, limit: 10 })

    expect(result.totalCount).toBeGreaterThanOrEqual(1)
    expect(typeof result.hasMore).toBe('boolean')
  })

  it('returns fallback results when no scored candidates match and fewer than limit', async () => {
    // Freelancer with no skills — everything scores 0.5 neutral
    const noSkillProfile = [
      {
        id: 2,
        skills: null,
        preferred_budget_min: null,
        preferred_budget_max: null,
        total_jobs_completed: 0,
        rating: 0,
      },
    ]

    const fallbackProjects = [
      mockCandidateRow({ id: 'fallback-1', title: 'Fallback Project' }),
    ]

    queueSql([
      noSkillProfile,     // getFreelancerProfile
      [],                 // getCandidateProjects (empty)
      fallbackProjects,   // getFallbackProjects
    ])

    const result = await getRecommendations({ freelancerId: 2, page: 1, limit: 10 })

    expect(result.recommendations).toHaveLength(1)
    expect(result.fallbackUsed).toBe(true)
  })
})
