/**
 * Proposal Acceptance & Contract Creation Service
 *
 * Orchestrates client acceptance of a freelancer proposal into a contract:
 *   1. Authorize — only the job's client may accept
 *   2. Validate — proposal pending, job open/active, no existing accepted proposal/contract
 *   3. Commit atomically — accept → contract → milestones → escrow pending funding
 *
 * Controllers call this service; they never touch SQL directly.
 */

import type {
  AcceptProposalInput,
  AcceptProposalResult,
  AcceptedContractStatus,
  IProposalAcceptanceRepository,
  ProposalMilestoneBreakdown,
} from './acceptance-types'
import {
  ProposalAlreadyAcceptedError,
  ContractAlreadyExistsError,
  JobNotAcceptingError,
  JobNotFoundError,
  ProposalForbiddenError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  ProposalValidationError,
} from './errors'
import { proposalAcceptanceRepository } from './repository'

const ACCEPTABLE_JOB_STATUSES = new Set(['open'])

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/

export class ProposalAcceptanceService {
  constructor(
    private readonly repo: IProposalAcceptanceRepository = proposalAcceptanceRepository
  ) {}

  /**
   * Accept a proposal and create the linked contract + milestones + escrow init.
   * All persistence happens inside a single DB transaction (see repository).
   */
  async acceptProposal(input: AcceptProposalInput): Promise<AcceptProposalResult> {
    this.assertValidInput(input)

    const proposal = await this.repo.getProposalById(input.proposalId)
    if (!proposal) {
      throw new ProposalNotFoundError(input.proposalId)
    }
    if (proposal.status !== 'pending') {
      throw new ProposalNotPendingError(proposal.id, proposal.status)
    }

    const job = await this.repo.getJobById(proposal.jobId)
    if (!job) {
      throw new JobNotFoundError(proposal.jobId)
    }
    if (!ACCEPTABLE_JOB_STATUSES.has(job.status)) {
      throw new JobNotAcceptingError(job.id, job.status)
    }

    // Authorization: only the client who owns the job may accept.
    if (job.clientId !== input.actorUserId) {
      throw new ProposalForbiddenError(
        'Only the project client can accept proposals and create contracts'
      )
    }

    // Freelancers cannot trigger contract creation even if they somehow pass clientId.
    const userType = await this.repo.getUserType(input.actorUserId)
    if (userType === 'freelancer') {
      throw new ProposalForbiddenError(
        'Freelancers cannot accept proposals or create contracts'
      )
    }

    const existingAccepted = await this.repo.getAcceptedProposalForJob(job.id)
    if (existingAccepted) {
      throw new ProposalAlreadyAcceptedError(job.id, existingAccepted.id)
    }

    const existingContract = await this.repo.getContractByJobId(job.id)
    if (existingContract) {
      throw new ContractAlreadyExistsError(job.id, existingContract.id)
    }

    const milestones = this.resolveMilestones(input.milestones, proposal.milestoneBreakdown, proposal.proposedBudget)
    this.assertMilestonesMatchBudget(milestones, proposal.proposedBudget)

    const contractStatus: AcceptedContractStatus = 'pending'

    return this.repo.commitAcceptance({
      proposal,
      job,
      actorUserId: input.actorUserId,
      terms: input.terms?.trim() || proposal.coverLetter || null,
      milestones,
      contractStatus,
    })
  }

  private assertValidInput(input: AcceptProposalInput): void {
    if (!Number.isInteger(input.proposalId) || input.proposalId <= 0) {
      throw new ProposalValidationError('proposalId must be a positive integer')
    }
    if (!Number.isInteger(input.actorUserId) || input.actorUserId <= 0) {
      throw new ProposalValidationError('actorUserId must be a positive integer')
    }
  }

  private resolveMilestones(
    override: ProposalMilestoneBreakdown[] | undefined,
    fromProposal: ProposalMilestoneBreakdown[],
    proposedBudget: string
  ): ProposalMilestoneBreakdown[] {
    if (override && override.length > 0) {
      return override.map((m) => this.normalizeMilestone(m))
    }
    if (fromProposal && fromProposal.length > 0) {
      return fromProposal.map((m) => this.normalizeMilestone(m))
    }
    // Default: single milestone covering the full proposed budget
    return [
      {
        title: 'Project delivery',
        description: 'Initial milestone created from accepted proposal',
        amount: proposedBudget,
      },
    ]
  }

  private normalizeMilestone(m: ProposalMilestoneBreakdown): ProposalMilestoneBreakdown {
    if (!m.title?.trim()) {
      throw new ProposalValidationError('Each milestone requires a non-empty title')
    }
    if (!AMOUNT_RE.test(m.amount) || Number(m.amount) <= 0) {
      throw new ProposalValidationError(
        `Milestone "${m.title}" has an invalid amount: ${m.amount}`
      )
    }
    return {
      title: m.title.trim(),
      description: m.description?.trim() || undefined,
      amount: m.amount,
      dueDate: m.dueDate,
    }
  }

  private assertMilestonesMatchBudget(
    milestones: ProposalMilestoneBreakdown[],
    proposedBudget: string
  ): void {
    const sum = milestones.reduce((acc, m) => acc + Number(m.amount), 0)
    const budget = Number(proposedBudget)
    // Allow 0.000001 tolerance for decimal string math
    if (Math.abs(sum - budget) > 0.000001) {
      throw new ProposalValidationError(
        `Milestone amounts (${sum}) must equal the proposed budget (${budget})`
      )
    }
  }
}

export const proposalAcceptanceService = new ProposalAcceptanceService()
