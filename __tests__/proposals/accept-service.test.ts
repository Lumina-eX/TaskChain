import { describe, it, expect, beforeEach } from 'vitest'
import { ProposalAcceptanceService } from '@/lib/proposals/acceptance-service'
import type {
  AcceptProposalResult,
  ContractRecord,
  IProposalAcceptanceRepository,
  JobRecord,
  ProposalMilestoneBreakdown,
  ProposalRecord,
} from '@/lib/proposals/acceptance-types'
import {
  ProposalAlreadyAcceptedError,
  ContractAlreadyExistsError,
  JobNotAcceptingError,
  ProposalForbiddenError,
  ProposalNotPendingError,
  ProposalValidationError,
  ProposalTransactionError,
} from '@/lib/proposals/errors'

function makeProposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    id: 10,
    jobId: 1,
    freelancerId: 200,
    coverLetter: 'I can deliver this well',
    proposedBudget: '100.00',
    estimatedDuration: '2 weeks',
    status: 'pending',
    milestoneBreakdown: [
      { title: 'Design', amount: '40.00' },
      { title: 'Build', amount: '60.00' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 1,
    clientId: 100,
    freelancerId: null,
    title: 'Build TaskChain feature',
    status: 'open',
    budget: '100.00',
    currency: 'XLM',
    escrowContractId: null,
    escrowStatus: null,
    ...overrides,
  }
}

class FakeRepo implements IProposalAcceptanceRepository {
  proposal: ProposalRecord | null = makeProposal()
  job: JobRecord | null = makeJob()
  accepted: ProposalRecord | null = null
  contract: ContractRecord | null = null
  userType: string | null = 'client'
  failCommit = false
  lastCommitMilestones: ProposalMilestoneBreakdown[] | null = null

  async getProposalById(id: number) {
    return this.proposal && this.proposal.id === id ? this.proposal : null
  }
  async getJobById(id: number) {
    return this.job && this.job.id === id ? this.job : null
  }
  async getAcceptedProposalForJob(_jobId: number) {
    return this.accepted
  }
  async getContractByJobId(_jobId: number) {
    return this.contract
  }
  async getUserType(_userId: number) {
    return this.userType
  }
  async commitAcceptance(params: {
    proposal: ProposalRecord
    job: JobRecord
    actorUserId: number
    terms: string | null
    milestones: ProposalMilestoneBreakdown[]
    contractStatus: 'pending' | 'draft' | 'pending_funding'
  }): Promise<AcceptProposalResult> {
    if (this.failCommit) {
      throw new ProposalTransactionError('simulated rollback')
    }
    this.lastCommitMilestones = params.milestones
    const now = new Date().toISOString()
    const contract: ContractRecord = {
      id: 55,
      jobId: params.job.id,
      proposalId: params.proposal.id,
      clientId: params.job.clientId,
      freelancerId: params.proposal.freelancerId,
      totalAmount: params.proposal.proposedBudget,
      currency: params.job.currency,
      terms: params.terms,
      status: params.contractStatus,
      createdAt: now,
      updatedAt: now,
    }
    return {
      proposal: { ...params.proposal, status: 'accepted', updatedAt: now },
      job: {
        ...params.job,
        freelancerId: params.proposal.freelancerId,
        status: 'assigned',
        escrowStatus: 'pending',
      },
      contract,
      milestones: params.milestones.map((m, i) => ({
        id: i + 1,
        jobId: params.job.id,
        contractId: contract.id,
        title: m.title,
        description: m.description ?? null,
        amount: m.amount,
        status: 'pending',
        dueDate: m.dueDate ?? null,
      })),
      escrowStatus: 'pending',
      auditEvents: [
        {
          event: 'proposal_accepted',
          actorUserId: params.actorUserId,
          proposalId: params.proposal.id,
          jobId: params.job.id,
          contractId: contract.id,
          createdAt: now,
        },
        {
          event: 'contract_created',
          actorUserId: params.actorUserId,
          proposalId: params.proposal.id,
          jobId: params.job.id,
          contractId: contract.id,
          createdAt: now,
        },
        {
          event: 'milestones_created',
          actorUserId: params.actorUserId,
          proposalId: params.proposal.id,
          jobId: params.job.id,
          contractId: contract.id,
          metadata: { count: params.milestones.length },
          createdAt: now,
        },
        {
          event: 'escrow_initialized',
          actorUserId: params.actorUserId,
          proposalId: params.proposal.id,
          jobId: params.job.id,
          contractId: contract.id,
          metadata: { escrowStatus: 'pending' },
          createdAt: now,
        },
      ],
    }
  }
}

describe('ProposalAcceptanceService', () => {
  let repo: FakeRepo
  let service: ProposalAcceptanceService

  beforeEach(() => {
    repo = new FakeRepo()
    service = new ProposalAcceptanceService(repo)
  })

  it('accepts a pending proposal and creates contract + milestones + escrow init', async () => {
    const result = await service.acceptProposal({ proposalId: 10, actorUserId: 100 })

    expect(result.proposal.status).toBe('accepted')
    expect(result.contract.proposalId).toBe(10)
    expect(result.contract.status).toBe('pending')
    expect(result.job.status).toBe('assigned')
    expect(result.job.escrowStatus).toBe('pending')
    expect(result.milestones).toHaveLength(2)
    expect(result.auditEvents.map((e) => e.event)).toEqual([
      'proposal_accepted',
      'contract_created',
      'milestones_created',
      'escrow_initialized',
    ])
  })

  it('rejects freelancers from accepting proposals', async () => {
    repo.userType = 'freelancer'
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(ProposalForbiddenError)
  })

  it('rejects non-client actors who do not own the job', async () => {
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 999 })
    ).rejects.toBeInstanceOf(ProposalForbiddenError)
  })

  it('prevents accepting a non-pending proposal', async () => {
    repo.proposal = makeProposal({ status: 'rejected' })
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(ProposalNotPendingError)
  })

  it('prevents acceptance when the job is not open', async () => {
    repo.job = makeJob({ status: 'completed' })
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(JobNotAcceptingError)
  })

  it('enforces one accepted proposal per project/job', async () => {
    repo.accepted = makeProposal({ id: 99, status: 'accepted' })
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(ProposalAlreadyAcceptedError)
  })

  it('enforces one contract per job', async () => {
    repo.contract = {
      id: 7,
      jobId: 1,
      proposalId: 3,
      clientId: 100,
      freelancerId: 200,
      totalAmount: '50',
      currency: 'XLM',
      terms: null,
      status: 'pending',
      createdAt: '',
      updatedAt: '',
    }
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(ContractAlreadyExistsError)
  })

  it('validates milestone amounts equal the proposed budget', async () => {
    await expect(
      service.acceptProposal({
        proposalId: 10,
        actorUserId: 100,
        milestones: [{ title: 'Only', amount: '10.00' }],
      })
    ).rejects.toBeInstanceOf(ProposalValidationError)
  })

  it('defaults to a single full-budget milestone when none are provided', async () => {
    repo.proposal = makeProposal({ milestoneBreakdown: [] })
    const result = await service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    expect(result.milestones).toHaveLength(1)
    expect(result.milestones[0].amount).toBe('100.00')
    expect(repo.lastCommitMilestones?.[0].title).toBe('Project delivery')
  })

  it('surfaces transaction failures so callers know the state was rolled back', async () => {
    repo.failCommit = true
    await expect(
      service.acceptProposal({ proposalId: 10, actorUserId: 100 })
    ).rejects.toBeInstanceOf(ProposalTransactionError)
  })
})
