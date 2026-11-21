import { describe, it, expect } from 'vitest'

import {
  canCreateDispute,
  canResolveDispute,
  canSubmitEvidence,
  canViewDispute,
  classifyActor,
  isIntegerId,
  isUuid,
} from '@/lib/disputes/authorization'
import type { ContractRecord, DisputeActor, DisputeRecord } from '@/lib/disputes/types'

const contract: ContractRecord = {
  id: 'contract-1',
  clientId: 'user-client',
  freelancerId: 'user-freelancer',
  status: 'disputed',
  escrowStatus: 'funded',
  escrowAddress: 'CESCROW',
  arbiterAddress: 'GArbiterWallet',
  designatedResolverId: 'user-designated',
  activeDisputeId: 'dispute-1',
  totalAmount: '100',
  currency: 'USDC',
}

const dispute: DisputeRecord = {
  id: 'dispute-1',
  contractId: contract.id,
  milestoneId: 'milestone-1',
  raisedBy: 'client',
  raisedByUserId: 'user-client',
  reason: 'reason',
  desiredOutcome: null,
  status: 'open',
  resolverId: null,
  resolutionNotes: null,
  resolutionMetadata: {},
  clientRefundAmount: null,
  freelancerPayoutAmount: null,
  resolvedAt: null,
  creationIdempotencyKey: null,
  lastResolutionAttemptId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function actor(overrides: Partial<DisputeActor> & { userId: string }): DisputeActor {
  return {
    walletAddress: 'GSomeoneElse',
    role: 'freelancer',
    ...overrides,
  }
}

const client = actor({ userId: 'user-client', walletAddress: 'GClient', role: 'client' })
const freelancer = actor({ userId: 'user-freelancer', walletAddress: 'GFreelancer' })
const outsider = actor({ userId: 'user-outsider', walletAddress: 'GOutsider' })
const arbiter = actor({ userId: 'user-arbiter', walletAddress: 'garbiterwallet', role: 'client' })
const designated = actor({ userId: 'user-designated', walletAddress: 'GDesignated' })
const admin = actor({ userId: 'user-admin', walletAddress: 'GAdmin', role: 'admin' })

describe('classifyActor', () => {
  it('identifies each role from database-backed data', () => {
    expect(classifyActor(client, contract)).toBe('participant')
    expect(classifyActor(freelancer, contract)).toBe('participant')
    expect(classifyActor(arbiter, contract)).toBe('arbiter')
    expect(classifyActor(designated, contract)).toBe('designated_resolver')
    expect(classifyActor(admin, contract)).toBe('admin')
    expect(classifyActor(outsider, contract)).toBe('unrelated')
  })

  it('never trusts a wallet that merely resembles an address', () => {
    expect(
      classifyActor(actor({ userId: 'x', walletAddress: 'GArbiterWallet2' }), contract)
    ).toBe('unrelated')
  })
})

describe('permissions', () => {
  it('allows participants, arbiters and designated resolvers to create disputes', () => {
    expect(canCreateDispute(client, contract)).toBe(true)
    expect(canCreateDispute(freelancer, contract)).toBe(true)
    expect(canCreateDispute(arbiter, contract)).toBe(true)
    expect(canCreateDispute(designated, contract)).toBe(true)
    expect(canCreateDispute(admin, contract)).toBe(true)
    expect(canCreateDispute(outsider, contract)).toBe(false)
  })

  it('only allows participants, arbiters, designated resolvers or admins to view', () => {
    expect(canViewDispute(client, contract, dispute)).toBe(true)
    expect(canViewDispute(arbiter, contract, dispute)).toBe(true)
    expect(canViewDispute(designated, contract, dispute)).toBe(true)
    expect(canViewDispute(admin, contract, dispute)).toBe(true)
    expect(canViewDispute(outsider, contract, dispute)).toBe(false)
  })

  it('allows the dispute raiser to read their own record even without a role', () => {
    expect(canViewDispute(outsider, contract, { ...dispute, raisedByUserId: 'user-outsider' })).toBe(true)
  })

  it('restricts resolution to arbiters, designated resolvers and admins', () => {
    expect(canResolveDispute(arbiter, contract)).toBe(true)
    expect(canResolveDispute(designated, contract)).toBe(true)
    expect(canResolveDispute(admin, contract)).toBe(true)
    expect(canResolveDispute(client, contract)).toBe(false)
    expect(canResolveDispute(freelancer, contract)).toBe(false)
    expect(canResolveDispute(outsider, contract)).toBe(false)
  })

  it('lets participants submit evidence but not unrelated users', () => {
    expect(canSubmitEvidence(client, contract)).toBe(true)
    expect(canSubmitEvidence(freelancer, contract)).toBe(true)
    expect(canSubmitEvidence(arbiter, contract)).toBe(true)
    expect(canSubmitEvidence(outsider, contract)).toBe(false)
  })

  it('does not treat an unconfigured arbiter as authorized', () => {
    const noArbiter = { ...contract, arbiterAddress: null }
    expect(canResolveDispute(arbiter, noArbiter)).toBe(false)
  })
})

describe('id helpers', () => {
  it('distinguishes canonical UUID disputes from legacy integer ids', () => {
    expect(isUuid('a1f2c3d4-2222-4222-8222-222222222222')).toBe(true)
    expect(isUuid('42')).toBe(false)
    expect(isIntegerId('42')).toBe(true)
    expect(isIntegerId('abc')).toBe(false)
  })
})
