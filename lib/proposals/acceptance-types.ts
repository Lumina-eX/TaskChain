/**
 * Proposal Acceptance & Contract Creation — shared types.
 *
 * Models the flow: accept proposal → validate project/job → create contract →
 * seed milestones → initialize escrow as Pending Funding, atomically.
 */

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export type JobStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled'
  | 'disputed'

/** Contract lifecycle after acceptance (Draft / Pending Funding). */
export type AcceptedContractStatus = 'pending' | 'draft' | 'pending_funding'

export type EscrowInitStatus = 'pending'

export interface ProposalMilestoneBreakdown {
  title: string
  description?: string
  amount: string
  dueDate?: string
}

export interface ProposalRecord {
  id: number
  jobId: number
  freelancerId: number
  coverLetter: string
  proposedBudget: string
  estimatedDuration: string | null
  status: ProposalStatus
  /** Optional milestone plan supplied with the proposal. */
  milestoneBreakdown: ProposalMilestoneBreakdown[]
  createdAt: string
  updatedAt: string
}

export interface JobRecord {
  id: number
  clientId: number
  freelancerId: number | null
  title: string
  status: JobStatus
  budget: string
  currency: string
  escrowContractId: string | null
  escrowStatus: string | null
}

export interface ContractRecord {
  id: number
  jobId: number
  proposalId: number
  clientId: number
  freelancerId: number
  totalAmount: string
  currency: string
  terms: string | null
  status: AcceptedContractStatus
  createdAt: string
  updatedAt: string
}

export interface MilestoneRecord {
  id: number
  jobId: number
  contractId: number
  title: string
  description: string | null
  amount: string
  status: string
  dueDate: string | null
}

export interface AcceptanceAuditEvent {
  event:
    | 'proposal_accepted'
    | 'contract_created'
    | 'milestones_created'
    | 'escrow_initialized'
  actorUserId: number
  proposalId: number
  jobId: number
  contractId?: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AcceptProposalInput {
  proposalId: number
  /** Authenticated client user id (must own the job). */
  actorUserId: number
  /** Optional override terms stored on the contract. */
  terms?: string
  /**
   * Optional milestone plan. When omitted, uses `proposal.milestoneBreakdown`
   * if present; otherwise a single milestone for the full proposed budget.
   */
  milestones?: ProposalMilestoneBreakdown[]
}

export interface AcceptProposalResult {
  proposal: ProposalRecord
  job: JobRecord
  contract: ContractRecord
  milestones: MilestoneRecord[]
  escrowStatus: EscrowInitStatus
  auditEvents: AcceptanceAuditEvent[]
}

/** Repository surface — swap with an in-memory fake in unit tests. */
export interface IProposalAcceptanceRepository {
  getProposalById(proposalId: number): Promise<ProposalRecord | null>
  getJobById(jobId: number): Promise<JobRecord | null>
  getAcceptedProposalForJob(jobId: number): Promise<ProposalRecord | null>
  getContractByJobId(jobId: number): Promise<ContractRecord | null>
  getUserType(userId: number): Promise<string | null>
  /**
   * Atomically: accept proposal, reject siblings, create contract + milestones,
   * assign job, init escrow, write audit events. Must roll back on any failure.
   */
  commitAcceptance(params: {
    proposal: ProposalRecord
    job: JobRecord
    actorUserId: number
    terms: string | null
    milestones: ProposalMilestoneBreakdown[]
    contractStatus: AcceptedContractStatus
  }): Promise<AcceptProposalResult>
}
