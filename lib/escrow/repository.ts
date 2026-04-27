/**
 * Escrow Lifecycle Service — Database Repository
 *
 * Implements IEscrowRepository against the Neon/PostgreSQL database.
 * All SQL lives here — the service layer never touches `sql` directly.
 * This keeps the service pure and makes it straightforward to swap the
 * persistence layer (e.g. for a different DB or an in-memory stub in tests).
 */

import { sql } from '@/lib/db'
import type {
  EscrowContract,
  EscrowDispute,
  EscrowMilestone,
  EscrowStatus,
  MilestoneStatus,
  MilestoneInput,
  DisputeRaisedBy,
  DisputeEvidence,
  IEscrowRepository,
} from './types'

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToContract(row: any): EscrowContract {
  return {
    id: row.id,
    projectId: row.project_id,
    clientId: row.client_id,
    freelancerId: row.freelancer_id,
    totalAmount: row.total_amount,
    currency: row.currency,
    terms: row.terms ?? null,
    termsIpfsCid: row.terms_ipfs_cid ?? null,
    agreedAt: row.agreed_at ?? null,
    escrowAddress: row.escrow_address ?? null,
    escrowStatus: row.escrow_status,
    fundedAt: row.funded_at ?? null,
    fundingTxHash: row.funding_tx_hash ?? null,
    status: row.status,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    chainId: row.chain_id ?? null,
    contractTxHash: row.contract_tx_hash ?? null,
    activeDisputeId: row.active_dispute_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMilestone(row: any): EscrowMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    contractId: row.contract_id ?? null,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 0,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.due_date ?? null,
    submittedAt: row.submitted_at ?? null,
    approvedAt: row.approved_at ?? null,
    paidAt: row.paid_at ?? null,
    status: row.status,
    escrowTxHash: row.escrow_tx_hash ?? null,
    releaseTxHash: row.release_tx_hash ?? null,
    deliverables: row.deliverables ?? [],
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDispute(row: any): EscrowDispute {
  return {
    id: row.id,
    contractId: row.contract_id,
    milestoneId: row.milestone_id ?? null,
    raisedBy: row.raised_by,
    raisedByUserId: row.raised_by_user_id,
    reason: row.reason,
    desiredOutcome: row.desired_outcome ?? null,
    evidence: row.evidence ?? [],
    status: row.status,
    resolverId: row.resolver_id ?? null,
    resolutionNotes: row.resolution_notes ?? null,
    resolvedAt: row.resolved_at ?? null,
    clientRefundAmount: row.client_refund_amount ?? null,
    freelancerPayoutAmount: row.freelancer_payout_amount ?? null,
    responseDeadline: row.response_deadline ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

export class EscrowRepository implements IEscrowRepository {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getContractById(contractId: string): Promise<EscrowContract | null> {
    const rows = await sql`
      SELECT * FROM contracts WHERE id = ${contractId} LIMIT 1
    `
    return rows[0] ? rowToContract(rows[0]) : null
  }

  async getContractByProjectId(projectId: string): Promise<EscrowContract | null> {
    const rows = await sql`
      SELECT * FROM contracts WHERE project_id = ${projectId} LIMIT 1
    `
    return rows[0] ? rowToContract(rows[0]) : null
  }

  async getMilestoneById(milestoneId: string): Promise<EscrowMilestone | null> {
    const rows = await sql`
      SELECT * FROM milestones WHERE id = ${milestoneId} LIMIT 1
    `
    return rows[0] ? rowToMilestone(rows[0]) : null
  }

  async getMilestonesByContractId(contractId: string): Promise<EscrowMilestone[]> {
    const rows = await sql`
      SELECT * FROM milestones
       WHERE contract_id = ${contractId}
       ORDER BY sort_order ASC, created_at ASC
    `
    return rows.map(rowToMilestone)
  }

  async getDisputeById(disputeId: string): Promise<EscrowDispute | null> {
    const rows = await sql`
      SELECT * FROM disputes WHERE id = ${disputeId} LIMIT 1
    `
    return rows[0] ? rowToDispute(rows[0]) : null
  }

  async getActiveDisputeByContractId(contractId: string): Promise<EscrowDispute | null> {
    const rows = await sql`
      SELECT * FROM disputes
       WHERE contract_id = ${contractId}
         AND status NOT IN ('resolved_client', 'resolved_freelancer', 'resolved_split', 'withdrawn')
       ORDER BY created_at DESC
       LIMIT 1
    `
    return rows[0] ? rowToDispute(rows[0]) : null
  }

  async getUserWalletAddress(userId: string): Promise<string | null> {
    const rows = await sql`
      SELECT wallet_address FROM users WHERE id = ${userId} LIMIT 1
    `
    return (rows[0]?.wallet_address as string) ?? null
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async createContract(params: {
    projectId: string
    clientId: string
    freelancerId: string
    totalAmount: string
    currency: string
    terms?: string
    escrowAddress: string
    contractTxHash: string
  }): Promise<EscrowContract> {
    const rows = await sql`
      INSERT INTO contracts (
        project_id,
        client_id,
        freelancer_id,
        total_amount,
        currency,
        terms,
        escrow_address,
        contract_tx_hash,
        escrow_status,
        status
      )
      VALUES (
        ${params.projectId},
        ${params.clientId},
        ${params.freelancerId},
        ${params.totalAmount},
        ${params.currency},
        ${params.terms ?? null},
        ${params.escrowAddress},
        ${params.contractTxHash},
        'unfunded',
        'pending'
      )
      RETURNING *
    `
    return rowToContract(rows[0])
  }

  async createMilestones(
    contractId: string,
    projectId: string,
    milestones: MilestoneInput[]
  ): Promise<void> {
    for (const [index, m] of milestones.entries()) {
      await sql`
        INSERT INTO milestones (
          project_id,
          contract_id,
          title,
          description,
          amount,
          currency,
          due_date,
          sort_order,
          status
        )
        VALUES (
          ${projectId},
          ${contractId},
          ${m.title},
          ${m.description ?? null},
          ${m.amount},
          'USDC',
          ${m.dueDate ?? null},
          ${m.sortOrder ?? index},
          'pending'
        )
      `
    }
  }

  async updateContractEscrowStatus(
    contractId: string,
    escrowStatus: EscrowStatus,
    extra?: Partial<
      Pick<
        EscrowContract,
        | 'fundedAt'
        | 'fundingTxHash'
        | 'status'
        | 'startedAt'
        | 'completedAt'
        | 'cancelledAt'
        | 'cancellationReason'
        | 'activeDisputeId'
      >
    >
  ): Promise<EscrowContract> {
    const rows = await sql`
      UPDATE contracts
         SET escrow_status        = ${escrowStatus},
             status               = COALESCE(${extra?.status ?? null}::contract_status, status),
             funded_at            = COALESCE(${extra?.fundedAt ?? null}::timestamptz, funded_at),
             funding_tx_hash      = COALESCE(${extra?.fundingTxHash ?? null}, funding_tx_hash),
             started_at           = COALESCE(${extra?.startedAt ?? null}::timestamptz, started_at),
             completed_at         = COALESCE(${extra?.completedAt ?? null}::timestamptz, completed_at),
             cancelled_at         = COALESCE(${extra?.cancelledAt ?? null}::timestamptz, cancelled_at),
             cancellation_reason  = COALESCE(${extra?.cancellationReason ?? null}, cancellation_reason),
             active_dispute_id    = COALESCE(${extra?.activeDisputeId ?? null}::uuid, active_dispute_id),
             updated_at           = NOW()
       WHERE id = ${contractId}
       RETURNING *
    `
    return rowToContract(rows[0])
  }

  async updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus,
    extra?: Partial<
      Pick<EscrowMilestone, 'releaseTxHash' | 'paidAt' | 'rejectionReason'>
    >
  ): Promise<EscrowMilestone> {
    const rows = await sql`
      UPDATE milestones
         SET status           = ${status}::milestone_status,
             release_tx_hash  = COALESCE(${extra?.releaseTxHash ?? null}, release_tx_hash),
             paid_at          = COALESCE(${extra?.paidAt ?? null}::timestamptz, paid_at),
             rejection_reason = COALESCE(${extra?.rejectionReason ?? null}, rejection_reason),
             updated_at       = NOW()
       WHERE id = ${milestoneId}
       RETURNING *
    `
    return rowToMilestone(rows[0])
  }

  async createDispute(params: {
    contractId: string
    milestoneId?: string
    raisedBy: DisputeRaisedBy
    raisedByUserId: string
    reason: string
    desiredOutcome?: string
    evidence?: DisputeEvidence[]
    responseDeadline?: string
  }): Promise<EscrowDispute> {
    const rows = await sql`
      INSERT INTO disputes (
        contract_id,
        milestone_id,
        raised_by,
        raised_by_user_id,
        reason,
        desired_outcome,
        evidence,
        response_deadline,
        status
      )
      VALUES (
        ${params.contractId},
        ${params.milestoneId ?? null},
        ${params.raisedBy}::dispute_raised_by,
        ${params.raisedByUserId},
        ${params.reason},
        ${params.desiredOutcome ?? null},
        ${JSON.stringify(params.evidence ?? [])}::jsonb,
        ${params.responseDeadline ?? null}::timestamptz,
        'open'
      )
      RETURNING *
    `
    return rowToDispute(rows[0])
  }

  async updateDispute(
    disputeId: string,
    params: Partial<
      Pick<
        EscrowDispute,
        | 'status'
        | 'resolverId'
        | 'resolutionNotes'
        | 'resolvedAt'
        | 'clientRefundAmount'
        | 'freelancerPayoutAmount'
      >
    >
  ): Promise<EscrowDispute> {
    const rows = await sql`
      UPDATE disputes
         SET status                    = COALESCE(${params.status ?? null}::dispute_status, status),
             resolver_id               = COALESCE(${params.resolverId ?? null}::uuid, resolver_id),
             resolution_notes          = COALESCE(${params.resolutionNotes ?? null}, resolution_notes),
             resolved_at               = COALESCE(${params.resolvedAt ?? null}::timestamptz, resolved_at),
             client_refund_amount      = COALESCE(${params.clientRefundAmount ?? null}::numeric, client_refund_amount),
             freelancer_payout_amount  = COALESCE(${params.freelancerPayoutAmount ?? null}::numeric, freelancer_payout_amount),
             updated_at                = NOW()
       WHERE id = ${disputeId}
       RETURNING *
    `
    return rowToDispute(rows[0])
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const escrowRepository = new EscrowRepository()
