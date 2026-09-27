import { describe, it, expect, vi, beforeEach } from 'vitest'

import { GET as discoverProjects } from '@/app/api/projects/discover/route'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

import { sql } from '@/lib/db'
import {
  mapProjectRowToListing,
  parseDiscoveryParams,
  ProjectDiscoveryError,
  PROJECT_SORTABLE_FIELDS,
  PROJECT_MAX_LIMIT,
  PROJECT_DEFAULT_LIMIT,
  PROJECT_STATUSES,
} from '@/lib/projectDiscovery'
import { NextRequest } from 'next/server'

type SqlMock = ReturnType<typeof vi.fn>

function buildProjectRow(
  overrides: Record<string, unknown> = {},
): Array<Record<string, unknown>> {
  return [
    {
      id: 'proj-1',
      client_id: 'client-1',
      title: 'Build a dashboard',
      description: 'React dashboard with charts',
      budget_usdc: '1000.5',
      status: 'open',
      skills: ['React', 'TypeScript'],
      category: 'Frontend',
      deadline: new Date('2026-12-01T00:00:00Z'),
      created_at: new Date('2026-01-01T00:00:00Z'),
      total_count: '3',
      ...overrides,
    },
  ]
}

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

function makeRequest(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseDiscoveryParams', () => {
  it('applies defaults when no params are provided', () => {
    const params = parseDiscoveryParams(new URLSearchParams())
    expect(params).toEqual({
      query: '',
      statuses: [],
      skills: [],
      minBudget: null,
      maxBudget: null,
      sort: 'created_at',
      order: 'desc',
      limit: PROJECT_DEFAULT_LIMIT,
      page: 1,
    })
  })

  it('dedupes skills and statuses across repeating and comma-separated values', () => {
    const params = parseDiscoveryParams(
      new URLSearchParams(
        'skills=react&skills=react,nodejs&status=open,in_progress&status=open',
      ),
    )
    expect(params.skills).toEqual(['react', 'nodejs'])
    expect(params.statuses).toEqual(['open', 'in_progress'])
  })

  it('rejects unknown statuses', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('status=archived')))
      .toThrowError(ProjectDiscoveryError)
  })

  it('rejects unknown sort fields', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('sort=password')))
      .toThrowError(ProjectDiscoveryError)
  })

  it('accepts every whitelisted sort field', () => {
    for (const field of PROJECT_SORTABLE_FIELDS) {
      const params = parseDiscoveryParams(new URLSearchParams(`sort=${field}`))
      expect(params.sort).toBe(field)
    }
  })

  it('rejects bogus order values', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('order=ascending')))
      .toThrowError(ProjectDiscoveryError)
  })

  it('parses a budget range', () => {
    const params = parseDiscoveryParams(new URLSearchParams('minBudget=100&maxBudget=2500'))
    expect(params.minBudget).toBe(100)
    expect(params.maxBudget).toBe(2500)
  })

  it('rejects a negative budget', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('minBudget=-5')))
      .toThrowError(ProjectDiscoveryError)
  })

  it('rejects minBudget greater than maxBudget', () => {
    expect(() =>
      parseDiscoveryParams(new URLSearchParams('minBudget=500&maxBudget=100')),
    ).toThrowError(ProjectDiscoveryError)
  })

  it('clamps limit above the maximum', () => {
    const params = parseDiscoveryParams(
      new URLSearchParams(`limit=${PROJECT_MAX_LIMIT * 10}`),
    )
    expect(params.limit).toBe(PROJECT_MAX_LIMIT)
  })

  it('rejects zero or negative page', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('page=0')))
      .toThrowError(ProjectDiscoveryError)
    expect(() => parseDiscoveryParams(new URLSearchParams('page=-1')))
      .toThrowError(ProjectDiscoveryError)
  })

  it('trims the search query', () => {
    const params = parseDiscoveryParams(new URLSearchParams('q=%20%20hello%20%20'))
    expect(params.query).toBe('hello')
  })
})

describe('mapProjectRowToListing', () => {
  it('maps snake_case DB fields and normalises optional values', () => {
    const listing = mapProjectRowToListing({
      id: 'proj-1',
      client_id: 'client-1',
      title: 'Landing page',
      description: null,
      budget_usdc: '250.25',
      status: 'open',
      skills: null,
      category: null,
      deadline: null,
      created_at: new Date('2026-05-01T00:00:00Z'),
    })

    expect(listing).toMatchObject({
      id: 'proj-1',
      clientId: 'client-1',
      description: null,
      budgetUsdc: 250.25,
      skills: [],
      category: null,
      deadline: null,
      createdAt: '2026-05-01T00:00:00.000Z',
    })
  })
})

describe('GET /api/projects/discover', () => {
  it('returns the discovery payload with pagination metadata', async () => {
    // Path: WHERE fragment → ORDER BY fragment → main list → skills query.
    queueSql([
      [], // WHERE fragment
      [], // ORDER BY fragment
      buildProjectRow(), // main list (1 row → no fallback COUNT)
      [{ skill: 'React' }, { skill: 'Node.js' }], // available skills
    ])

    const request = makeRequest(
      'http://localhost/api/projects/discover?q=dashboard&status=open&sort=budget&order=asc&limit=2',
    )
    const response = await discoverProjects(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.projects).toHaveLength(1)
    expect(body.projects[0].title).toBe('Build a dashboard')
    expect(body.skills).toEqual(['React', 'Node.js'])
    expect(body.statuses).toEqual([...PROJECT_STATUSES])
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 3,
      totalPages: 2,
    })
  })

  it('returns an accurate total when the requested page is past the end', async () => {
    // WHERE → ORDER BY → main (empty) → WHERE → COUNT → skills.
    queueSql([
      [], // WHERE fragment (list)
      [], // ORDER BY fragment
      [], // main list (empty)
      [], // WHERE fragment (count)
      [{ count: '3' }], // COUNT(*)
      [], // skills
    ])

    const request = makeRequest('http://localhost/api/projects/discover?page=99&limit=10')
    const response = await discoverProjects(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.projects).toEqual([])
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 0,
      totalItems: 3,
      totalPages: 1,
    })
  })

  it('returns 400 with a structured error on an invalid sort field', async () => {
    const request = makeRequest(
      'http://localhost/api/projects/discover?sort=payout_total',
    )
    const response = await discoverProjects(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_SORT_FIELD')
  })

  it('returns 503 when the DB query fails', async () => {
    queueSql([[]]) // WHERE fragment resolves
    queueSqlReject(new Error('connection reset')) // ORDER BY fragment rejects

    const request = makeRequest('http://localhost/api/projects/discover')
    const response = await discoverProjects(request)

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      error: 'Unable to load projects',
      code: 'PROJECT_LIST_FAILED',
    })
  })
})
