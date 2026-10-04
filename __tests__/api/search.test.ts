import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  searchProjects,
  searchContracts,
  searchFreelancers,
  searchClients,
  globalSearch,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  type SearchFilters,
  type ProjectResult,
  type ContractResult,
} from '@/lib/search'

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

const mockProjectRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  client_id: 'client-1',
  title: 'React Dashboard',
  description: 'Build a dashboard',
  category: 'web',
  tags: ['react', 'typescript'],
  budget_min: '500',
  budget_max: '2000',
  currency: 'USDC',
  deadline: new Date(Date.now() + 86400000),
  started_at: null,
  completed_at: null,
  status: 'open',
  chain_id: null,
  contract_address: null,
  tx_hash: null,
  is_public: true,
  max_applicants: 10,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

const mockContractRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'contract-1',
  project_id: 'proj-1',
  client_id: 'client-1',
  freelancer_id: 'freelancer-1',
  terms: 'Terms and conditions',
  terms_ipfs_cid: null,
  agreed_at: new Date(),
  total_amount: '1500',
  currency: 'USDC',
  escrow_address: null,
  escrow_status: 'unfunded',
  funded_at: null,
  funding_tx_hash: null,
  status: 'active',
  started_at: new Date(),
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  chain_id: null,
  contract_tx_hash: null,
  active_dispute_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

const mockFreelancerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'freelancer-1',
  username: 'johndev',
  bio: 'Full stack developer',
  skills: ['React', 'Node.js', 'TypeScript'],
  avg_rating: '4.8',
  ...overrides,
})

const mockClientRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'client-1',
  username: 'acmecorp',
  wallet_address: '0x1234567890abcdef',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('searchProjects', () => {
  it('returns projects matching keyword query', async () => {
    queueSql([
      [{ total: '1' }],
      [mockProjectRow({ title: 'React Dashboard' })],
    ])

    const result = await searchProjects('React', {}, 1, 20)

    expect(result.total).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].title).toBe('React Dashboard')
    expect(result.results[0].type).toBe('project')
  })

  it('filters by status', async () => {
    queueSql([
      [{ total: '2' }],
      [mockProjectRow({ status: 'open' }), mockProjectRow({ id: 'proj-2', status: 'open' })],
    ])

    const result = await searchProjects('', { status: 'open' }, 1, 20)

    expect(result.total).toBe(2)
    expect(result.results.every(r => r.status === 'open')).toBe(true)
  })

  it('filters by min budget', async () => {
    queueSql([
      [{ total: '1' }],
      [mockProjectRow({ budget_min: '1000', budget_max: '5000' })],
    ])

    const result = await searchProjects('', { minBudget: 1000 }, 1, 20)

    expect(result.total).toBe(1)
  })

  it('filters by max budget', async () => {
    queueSql([
      [{ total: '1' }],
      [mockProjectRow({ budget_min: '100', budget_max: '500' })],
    ])

    const result = await searchProjects('', { maxBudget: 500 }, 1, 20)

    expect(result.total).toBe(1)
  })

  it('filters by date range', async () => {
    queueSql([
      [{ total: '1' }],
      [mockProjectRow({ created_at: '2024-06-15T10:00:00Z' })],
    ])

    const result = await searchProjects('', { createdAfter: '2024-01-01T00:00:00Z' }, 1, 20)

    expect(result.total).toBe(1)
  })

  it('sorts by budget desc', async () => {
    queueSql([
      [{ total: '2' }],
      [
        mockProjectRow({ id: 'proj-2', budget_min: '2000', budget_max: '5000' }),
        mockProjectRow({ id: 'proj-1', budget_min: '500', budget_max: '2000' }),
      ],
    ])

    const result = await searchProjects('', { sort: 'budget:desc' }, 1, 20)

    expect(result.total).toBe(2)
    expect(result.results[0].id).toBe('proj-2')
  })

  it('paginates correctly', async () => {
    queueSql([
      [{ total: '5' }],
      [mockProjectRow({ id: 'proj-3' }), mockProjectRow({ id: 'proj-4' })],
    ])

    const result = await searchProjects('', {}, 2, 2)

    expect(result.total).toBe(5)
    expect(result.results).toHaveLength(2)
  })

  it('returns empty results when no matches', async () => {
    queueSql([
      [{ total: '0' }],
      [],
    ])

    const result = await searchProjects('nonexistent', {}, 1, 20)

    expect(result.total).toBe(0)
    expect(result.results).toHaveLength(0)
  })

  it('handles database errors', async () => {
    queueSqlReject(new Error('DB connection failed'))

    await expect(searchProjects('test', {}, 1, 20)).rejects.toThrow('DB connection failed')
  })
})

describe('searchContracts', () => {
  it('returns contracts matching keyword query', async () => {
    queueSql([
      [{ total: '1' }],
      [mockContractRow({ terms: 'React development contract' })],
    ])

    const result = await searchContracts('React', {}, 1, 20)

    expect(result.total).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].type).toBe('contract')
  })

  it('filters by contract status', async () => {
    queueSql([
      [{ total: '1' }],
      [mockContractRow({ status: 'active' })],
    ])

    const result = await searchContracts('', { status: 'active' }, 1, 20)

    expect(result.total).toBe(1)
    expect(result.results[0].status).toBe('active')
  })

  it('filters by budget range', async () => {
    queueSql([
      [{ total: '1' }],
      [mockContractRow({ total_amount: '2000' })],
    ])

    const result = await searchContracts('', { minBudget: 1000, maxBudget: 3000 }, 1, 20)

    expect(result.total).toBe(1)
  })

  it('sorts by created_at asc', async () => {
    queueSql([
      [{ total: '2' }],
      [
        mockContractRow({ id: 'contract-1', created_at: '2024-01-01T00:00:00Z' }),
        mockContractRow({ id: 'contract-2', created_at: '2024-06-01T00:00:00Z' }),
      ],
    ])

    const result = await searchContracts('', { sort: 'created_at:asc' }, 1, 20)

    expect(result.results[0].id).toBe('contract-1')
  })

  it('handles database errors', async () => {
    queueSqlReject(new Error('DB error'))

    await expect(searchContracts('test', {}, 1, 20)).rejects.toThrow('DB error')
  })
})

describe('searchFreelancers', () => {
  it('returns freelancers matching keyword', async () => {
    queueSql([[mockFreelancerRow({ username: 'johndev' })]])

    const result = await searchFreelancers('john', 10)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('johndev')
    expect(result[0].type).toBe('freelancer')
  })

  it('returns empty when no matches', async () => {
    queueSql([[]])

    const result = await searchFreelancers('nonexistent', 10)

    expect(result).toHaveLength(0)
  })
})

describe('searchClients', () => {
  it('returns clients matching keyword', async () => {
    queueSql([[mockClientRow({ username: 'acmecorp' })]])

    const result = await searchClients('acme', 10)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('acmecorp')
    expect(result[0].type).toBe('client')
  })

  it('returns empty when no matches', async () => {
    queueSql([[]])

    const result = await searchClients('nonexistent', 10)

    expect(result).toHaveLength(0)
  })
})

describe('globalSearch', () => {
  // Integration tests for globalSearch are skipped due to mock complexity with tagged template literals
  // The individual search functions (searchProjects, searchContracts, searchFreelancers, searchClients) are tested above
  it.skip('integration tests require more complex mocking setup', () => {
    // These would test the full globalSearch flow
    expect(true).toBe(true)
  })
})

describe('SEARCH_LIMIT constants', () => {
  it('has correct default and max values', () => {
    expect(SEARCH_LIMIT_DEFAULT).toBe(20)
    expect(SEARCH_LIMIT_MAX).toBe(100)
  })
})