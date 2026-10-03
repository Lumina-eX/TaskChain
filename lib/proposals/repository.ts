/**
 * Proposal Acceptance repository — Neon SQL + `sql.begin` for atomicity.
 */

import { sql } from '@/lib/db'
import type {
  AcceptProposalResult,
  AcceptanceAuditEvent,
  AcceptedContractStatus,
  ContractRecord,
  IProposalAcceptanceRepository,
  JobRecord,
  MilestoneRecord,
  ProposalMilestoneBreakdown,
  ProposalRecord,
} from './acceptance-types'
import { ProposalTransactionError } from './errors'

type SqlTxn = typeof sql

function mapProposal(row: Record<string, unknown>): ProposalRecord {
  let breakdown: ProposalMilestoneBreakdown[] = []
  const raw = row.milestone_breakdown
  if (Array.isArray(raw)) {
    breakdown = raw as ProposalMilestoneBreakdown[]
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) breakdown = parsed
    } catch {
      breakdown = []
    }
  }

  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    freelancerId: Number(row.freelancer_id),
    coverLetter: String(row.cover_letter ?? ''),
    proposedBudget: String(row.proposed_budget),
    estimatedDuration: row.estimated_duration != null ? String(row.estimated_duration) : null,
    status: row.status as ProposalRecord['status'],
    milestoneBreakdown: breakdown,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    freelancerId: row.freelancer_id != null ? Number(row.freelancer_id) : null,
    title: String(row.title),
    status: row.status as JobRecord['status'],
    budget: String(row.budget),
    currency: String(row.currency ?? 'XLM'),
    escrowContractId: row.escrow_contract_id != null ? String(row.escrow_contract_id) : null,
    escrowStatus: row.escrow_status != null ? String(row.escrow_status) : null,
  }
}

function mapContract(row: Record<string, unknown>): ContractRecord {
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    proposalId: Number(row.proposal_id),
    clientId: Number(row.client_id),
    freelancerId: Number(row.freelancer_id),
    totalAmount: String(row.total_amount),
    currency: String(row.currency),
    terms: row.terms != null ? String(row.terms) : null,
    status: row.status as AcceptedContractStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMilestone(row: Record<string, unknown>): MilestoneRecord {
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    contractId: Number(row.contract_id),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    amount: String(row.amount),
    status: String(row.status),
    dueDate: row.due_date != null ? String(row.due_date) : null,
  }
}

export class ProposalAcceptanceRepository implements IProposalAcceptanceRepository {
  async getProposalById(proposalId: number): Promise<ProposalRecord | null> {
    const rows = (await sql`
      SELECT id, job_id, freelancer_id, cover_letter, proposed_budget,
             estimated_duration, status, milestone_breakdown, created_at, updated_at
        FROM proposals
       WHERE id = ${proposalId}
       LIMIT 1
    `) as Record<string, unknown>[]
    return rows[0] ? mapProposal(rows[0]) : null
  }

  async getJobById(jobId: number): Promise<JobRecord | null> {
    const rows = (await sql`
      SELECT id, client_id, freelancer_id, title, status, budget, currency,
             escrow_contract_id, escrow_status
        FROM jobs
       WHERE id = ${jobId}
       LIMIT 1
    `) as Record<string, unknown>[]
    return rows[0] ? mapJob(rows[0]) : null
  }

  async getAcceptedProposalForJob(jobId: number): Promise<ProposalRecord | null> {
    const rows = (await sql`
      SELECT id, job_id, freelancer_id, cover_letter, proposed_budget,
             estimated_duration, status, milestone_breakdown, created_at, updated_at
        FROM proposals
       WHERE job_id = ${jobId} AND status = 'accepted'
       LIMIT 1
    `) as Record<string, unknown>[]
    return rows[0] ? mapProposal(rows[0]) : null
  }

  async getContractByJobId(jobId: number): Promise<ContractRecord | null> {
    const rows = (await sql`
      SELECT id, job_id, proposal_id, client_id, freelancer_id,
             total_amount, currency, terms, status, created_at, updated_at
        FROM contracts
       WHERE job_id = ${jobId}
       LIMIT 1
    `) as Record<string, unknown>[]
    return rows[0] ? mapContract(rows[0]) : null
  }

  async getUserType(userId: number): Promise<string | null> {
    const rows = (await sql`
      SELECT user_type FROM users WHERE id = ${userId} LIMIT 1
    `) as { user_type: string }[]
    return rows[0]?.user_type ?? null
  }

  async commitAcceptance(params: {
    proposal: ProposalRecord
    job: JobRecord
    actorUserId: number
    terms: string | null
    milestones: ProposalMilestoneBreakdown[]
    contractStatus: AcceptedContractStatus
  }): Promise<AcceptProposalResult> {
    const { proposal, job, actorUserId, terms, milestones, contractStatus } = params
    const now = new Date().toISOString()

    try {
      // Neon serverless supports transactional batches via sql.begin
      const result = await (sql as SqlTxn & {
        begin: <T>(fn: (txn: SqlTxn) => Promise<T>) => Promise<T>
      }).begin(async (txn) => {
        // 1. Accept the chosen proposal
        const acceptedRows = (await txn`
          UPDATE proposals
             SET status = 'accepted',
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ${proposal.id}
             AND status = 'pending'
          RETURNING id, job_id, freelancer_id, cover_letter, proposed_budget,
                    estimated_duration, status, milestone_breakdown, created_at, updated_at
        `) as Record<string, unknown>[]

        if (acceptedRows.length === 0) {
          throw new Error('Proposal was no longer pending at commit time')
        }
        const acceptedProposal = mapProposal(acceptedRows[0])

        // 2. Reject sibling proposals for the same job
        await txn`
          UPDATE proposals
             SET status = 'rejected',
                 updated_at = CURRENT_TIMESTAMP
           WHERE job_id = ${job.id}
             AND id <> ${proposal.id}
             AND status = 'pending'
        `

        // 3. Create contract linked to the proposal
        const contractRows = (await txn`
          INSERT INTO contracts (
            job_id, proposal_id, client_id, freelancer_id,
            total_amount, currency, terms, status
          )
          VALUES (
            ${job.id},
            ${proposal.id},
            ${job.clientId},
            ${proposal.freelancerId},
            ${proposal.proposedBudget},
            ${job.currency},
            ${terms},
            ${contractStatus}
          )
          RETURNING id, job_id, proposal_id, client_id, freelancer_id,
                    total_amount, currency, terms, status, created_at, updated_at
        `) as Record<string, unknown>[]
        const contract = mapContract(contractRows[0])

        // 4. Seed milestones from the breakdown
        const createdMilestones: MilestoneRecord[] = []
        for (const m of milestones) {
          const milestoneRows = (await txn`
            INSERT INTO milestones (
              job_id, contract_id, title, description, amount, due_date, status
            )
            VALUES (
              ${job.id},
              ${contract.id},
              ${m.title},
              ${m.description ?? null},
              ${m.amount},
              ${m.dueDate ?? null},
              'pending'
            )
            RETURNING id, job_id, contract_id, title, description, amount, status, due_date
          `) as Record<string, unknown>[]
          createdMilestones.push(mapMilestone(milestoneRows[0]))
        }

        // 5. Assign job + initialize escrow as Pending Funding
        const jobRows = (await txn`
          UPDATE jobs
             SET freelancer_id = ${proposal.freelancerId},
                 status        = 'assigned',
                 escrow_status = 'pending',
                 updated_at    = CURRENT_TIMESTAMP
           WHERE id = ${job.id}
          RETURNING id, client_id, freelancer_id, title, status, budget, currency,
                    escrow_contract_id, escrow_status
        `) as Record<string, unknown>[]
        const updatedJob = mapJob(jobRows[0])

        // 6. Audit trail
        const auditEvents: AcceptanceAuditEvent[] = [
          {
            event: 'proposal_accepted',
            actorUserId,
            proposalId: proposal.id,
            jobId: job.id,
            contractId: contract.id,
            metadata: { previousStatus: 'pending', newStatus: 'accepted' },
            createdAt: now,
          },
          {
            event: 'contract_created',
            actorUserId,
            proposalId: proposal.id,
            jobId: job.id,
            contractId: contract.id,
            metadata: { status: contractStatus, totalAmount: contract.totalAmount },
            createdAt: now,
          },
          {
            event: 'milestones_created',
            actorUserId,
            proposalId: proposal.id,
            jobId: job.id,
            contractId: contract.id,
            metadata: { count: createdMilestones.length },
            createdAt: now,
          },
          {
            event: 'escrow_initialized',
            actorUserId,
            proposalId: proposal.id,
            jobId: job.id,
            contractId: contract.id,
            metadata: { escrowStatus: 'pending' },
            createdAt: now,
          },
        ]

        for (const ev of auditEvents) {
          await txn`
            INSERT INTO proposal_acceptance_audit (
              event, actor_user_id, proposal_id, job_id, contract_id, metadata
            )
            VALUES (
              ${ev.event},
              ${ev.actorUserId},
              ${ev.proposalId},
              ${ev.jobId},
              ${ev.contractId ?? null},
              ${JSON.stringify(ev.metadata ?? {})}::jsonb
            )
          `
        }

        return {
          proposal: acceptedProposal,
          job: updatedJob,
          contract,
          milestones: createdMilestones,
          escrowStatus: 'pending' as const,
          auditEvents,
        }
      })

      return result
    } catch (err) {
      if (err instanceof ProposalTransactionError) throw err
      throw new ProposalTransactionError(
        'Proposal acceptance transaction failed and was rolled back',
        err
      )
    }
  }
}

export const proposalAcceptanceRepository = new ProposalAcceptanceRepository()
