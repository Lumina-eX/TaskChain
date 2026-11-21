/**
 * Dispute Resolution Workflow — Repository
 *
 * SQL access for the workflow. The interface is deliberately narrow so the
 * service can be unit-tested with an in-memory fake (see __tests__/disputes).
 *
 * Concurrency / atomicity notes:
 *   • createDisputeAtomic performs the dispute INSERT, the contract transition
 *     and the audit append in ONE statement, guarded by the partial unique
 *     indexes from migration 012. A concurrent duplicate returns null instead
 *     of creating a second dispute.
 *   • confirmResolution flips the attempt, the dispute and the contract in one
 *     statement, guarded by `disputes.status IN (active…)`, so only the first
 *     concurrent confirmation wins. A loser receives null.
 */

import { sql } from '@/lib/db'
import {
  ACTIVE_DISPUTE_STATUSES,
  DisputeConflictError,
  type AuditEventRecord,
  type ContractRecord,
  type DisputeActor,
  type DisputeAuditAction,
  type DisputeOutcome,
  type DisputeRecord,
  type DisputeStatus,
  type EvidenceRecord,
  type EvidenceType,
  type MilestoneRecord,
  type ResolutionAttemptRecord,
} from './types'

type Row = Record<string, unknown>

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function json(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function toActor(row: Row): DisputeActor {
  return {
    userId: str(row.id),
    walletAddress: str(row.wallet_address),
    role: str(row.role),
  }
}

export function mapContract(row: Row): ContractRecord {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    freelancerId: str(row.freelancer_id),
    status: str(row.status) as ContractRecord['status'],
    escrowStatus: str(row.escrow_status) as ContractRecord['escrowStatus'],
    escrowAddress: strOrNull(row.escrow_address),
    arbiterAddress: strOrNull(row.arbiter_address),
    designatedResolverId: strOrNull(row.designated_resolver_id),
    activeDisputeId: strOrNull(row.active_dispute_id),
    totalAmount: str(row.total_amount),
    currency: str(row.currency),
  }
}

export function mapDispute(row: Row): DisputeRecord {
  return {
    id: str(row.id),
    contractId: str(row.contract_id),
    milestoneId: strOrNull(row.milestone_id),
    raisedBy: str(row.raised_by) as DisputeRecord['raisedBy'],
    raisedByUserId: str(row.raised_by_user_id),
    reason: str(row.reason),
    desiredOutcome: strOrNull(row.desired_outcome),
    status: str(row.status) as DisputeStatus,
    resolverId: strOrNull(row.resolver_id),
    resolutionNotes: strOrNull(row.resolution_notes),
    resolutionMetadata: json(row.resolution_metadata),
    clientRefundAmount: strOrNull(row.client_refund_amount),
    freelancerPayoutAmount: strOrNull(row.freelancer_payout_amount),
    resolvedAt: strOrNull(row.resolved_at),
    creationIdempotencyKey: strOrNull(row.creation_idempotency_key),
    lastResolutionAttemptId: strOrNull(row.last_resolution_attempt_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

export function mapEvidence(row: Row): EvidenceRecord {
  return {
    id: str(row.id),
    disputeId: str(row.dispute_id),
    milestoneId: strOrNull(row.milestone_id),
    submittedByUserId: str(row.submitted_by_user_id),
    evidenceType: str(row.evidence_type) as EvidenceType,
    referenceUrl: str(row.reference_url),
    label: strOrNull(row.label),
    description: strOrNull(row.description),
    contentHash: str(row.content_hash),
    createdAt: str(row.created_at),
  }
}

export function mapAttempt(row: Row): ResolutionAttemptRecord {
  return {
    id: str(row.id),
    disputeId: str(row.dispute_id),
    requestedByUserId: str(row.requested_by_user_id),
    outcome: str(row.outcome) as DisputeOutcome,
    reasons: str(row.reasons),
    metadata: json(row.metadata),
    status: str(row.status) as ResolutionAttemptRecord['status'],
    onchain: row.onchain !== false,
    txHash: strOrNull(row.tx_hash),
    ledger: numOrNull(row.ledger),
    errorCode: strOrNull(row.error_code),
    errorMessage: strOrNull(row.error_message),
    retryOf: strOrNull(row.retry_of),
    idempotencyKey: str(row.idempotency_key),
    submittedAt: strOrNull(row.submitted_at),
    confirmedAt: strOrNull(row.confirmed_at),
    failedAt: strOrNull(row.failed_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

export function mapAudit(row: Row): AuditEventRecord {
  return {
    id: str(row.id),
    disputeId: str(row.dispute_id),
    contractId: str(row.contract_id),
    actorUserId: strOrNull(row.actor_user_id),
    actorWallet: strOrNull(row.actor_wallet),
    action: str(row.action) as DisputeAuditAction,
    metadata: json(row.metadata),
    createdAt: str(row.created_at),
  }
}

export interface CreateDisputeRow {
  contractId: string
  milestoneId: string | null
  raisedBy: 'client' | 'freelancer' | 'admin'
  raisedByUserId: string
  reason: string
  desiredOutcome: string | null
  idempotencyKey: string
  evidence: Array<Record<string, unknown>>
  actorWallet: string
}

export interface CreateAttemptRow {
  disputeId: string
  requestedByUserId: string
  outcome: DisputeOutcome
  reasons: string
  metadata: Record<string, unknown>
  onchain: boolean
  idempotencyKey: string
  retryOf: string | null
}

export interface ConfirmResolutionRow {
  disputeId: string
  contractId: string
  attemptId: string
  resolverId: string
  outcome: DisputeOutcome
  reasons: string
  metadata: Record<string, unknown>
  txHash: string | null
  ledger: number | null
  contractStatus: ContractRecord['status']
  clientRefundAmount: string | null
  freelancerPayoutAmount: string | null
  actorWallet: string
}

export interface ConfirmResolutionResult {
  attempt: ResolutionAttemptRecord
  dispute: DisputeRecord
  contractStatus: ContractRecord['status']
  audit: AuditEventRecord | null
}

export interface DisputeRepository {
  isAvailable(): boolean
  findUserByWallet(walletAddress: string): Promise<DisputeActor | null>
  getContract(contractId: string): Promise<ContractRecord | null>
  getMilestone(milestoneId: string): Promise<MilestoneRecord | null>
  getDispute(disputeId: string): Promise<DisputeRecord | null>
  getDisputeByCreationKey(contractId: string, key: string): Promise<DisputeRecord | null>
  getActiveDisputeForContract(contractId: string): Promise<DisputeRecord | null>
  createDisputeAtomic(input: CreateDisputeRow): Promise<{ dispute: DisputeRecord; contractStatus: ContractRecord['status'] } | null>
  listEvidence(disputeId: string): Promise<EvidenceRecord[]>
  insertEvidence(input: {
    disputeId: string
    milestoneId: string | null
    submittedByUserId: string
    evidenceType: EvidenceType
    referenceUrl: string
    label: string | null
    description: string | null
    contentHash: string
    actorWallet: string
    contractId: string
  }): Promise<EvidenceRecord | null>
  getEvidenceByHash(disputeId: string, contentHash: string): Promise<EvidenceRecord | null>
  getAttempt(attemptId: string): Promise<ResolutionAttemptRecord | null>
  getAttemptByKey(disputeId: string, key: string): Promise<ResolutionAttemptRecord | null>
  getPendingAttempt(disputeId: string): Promise<ResolutionAttemptRecord | null>
  getLatestAttempt(disputeId: string): Promise<ResolutionAttemptRecord | null>
  listAttempts(disputeId: string): Promise<ResolutionAttemptRecord[]>
  createAttempt(input: CreateAttemptRow): Promise<ResolutionAttemptRecord>
  updateAttempt(
    attemptId: string,
    patch: {
      status?: ResolutionAttemptRecord['status']
      txHash?: string | null
      ledger?: number | null
      errorCode?: string | null
      errorMessage?: string | null
      submittedAt?: string | null
      confirmedAt?: string | null
      failedAt?: string | null
    }
  ): Promise<ResolutionAttemptRecord | null>
  confirmResolution(input: ConfirmResolutionRow): Promise<ConfirmResolutionResult | null>
  appendAudit(input: {
    disputeId: string | null
    contractId: string
    actorUserId: string | null
    actorWallet: string | null
    action: DisputeAuditAction
    metadata?: Record<string, unknown>
  }): Promise<AuditEventRecord | null>
  listAudit(disputeId: string, limit: number): Promise<AuditEventRecord[]>
  linkAttemptToDispute(disputeId: string, attemptId: string): Promise<void>
}

export class SqlDisputeRepository implements DisputeRepository {
  isAvailable(): boolean {
    return Boolean(process.env.DATABASE_URL)
  }

  async findUserByWallet(walletAddress: string): Promise<DisputeActor | null> {
    const rows = (await sql`
      SELECT id, wallet_address, role::text AS role
      FROM users
      WHERE lower(wallet_address) = lower(${walletAddress})
      LIMIT 1
    `) as Row[]
    return rows[0] ? toActor(rows[0]) : null
  }

  async getContract(contractId: string): Promise<ContractRecord | null> {
    const rows = (await sql`
      SELECT id, client_id, freelancer_id, status, escrow_status, escrow_address,
             arbiter_address, designated_resolver_id, active_dispute_id,
             total_amount, currency
      FROM contracts
      WHERE id = ${contractId}
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapContract(rows[0]) : null
  }

  async getMilestone(milestoneId: string): Promise<MilestoneRecord | null> {
    const rows = (await sql`
      SELECT id, contract_id, status, amount
      FROM milestones
      WHERE id = ${milestoneId}
      LIMIT 1
    `) as Row[]
    const row = rows[0]
    if (!row) return null
    return {
      id: str(row.id),
      contractId: strOrNull(row.contract_id),
      status: str(row.status),
      amount: str(row.amount),
    }
  }

  async getDispute(disputeId: string): Promise<DisputeRecord | null> {
    const rows = (await sql`
      SELECT id, contract_id, milestone_id, raised_by, raised_by_user_id, reason,
             desired_outcome, status, resolver_id, resolution_notes,
             resolution_metadata, client_refund_amount, freelancer_payout_amount,
             resolved_at, creation_idempotency_key, last_resolution_attempt_id,
             created_at, updated_at
      FROM disputes
      WHERE id = ${disputeId}
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapDispute(rows[0]) : null
  }

  async getDisputeByCreationKey(
    contractId: string,
    key: string
  ): Promise<DisputeRecord | null> {
    const rows = (await sql`
      SELECT id, contract_id, milestone_id, raised_by, raised_by_user_id, reason,
             desired_outcome, status, resolver_id, resolution_notes,
             resolution_metadata, client_refund_amount, freelancer_payout_amount,
             resolved_at, creation_idempotency_key, last_resolution_attempt_id,
             created_at, updated_at
      FROM disputes
      WHERE contract_id = ${contractId} AND creation_idempotency_key = ${key}
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapDispute(rows[0]) : null
  }

  async getActiveDisputeForContract(contractId: string): Promise<DisputeRecord | null> {
    const rows = (await sql`
      SELECT id, contract_id, milestone_id, raised_by, raised_by_user_id, reason,
             desired_outcome, status, resolver_id, resolution_notes,
             resolution_metadata, client_refund_amount, freelancer_payout_amount,
             resolved_at, creation_idempotency_key, last_resolution_attempt_id,
             created_at, updated_at
      FROM disputes
      WHERE contract_id = ${contractId}
        AND status IN ('open', 'under_review', 'escalated')
      ORDER BY created_at DESC
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapDispute(rows[0]) : null
  }

  async createDisputeAtomic(
    input: CreateDisputeRow
  ): Promise<{ dispute: DisputeRecord; contractStatus: ContractRecord['status'] } | null> {
    const rows = (await sql`
      WITH inserted AS (
        INSERT INTO disputes (
          contract_id, milestone_id, raised_by, raised_by_user_id, reason,
          desired_outcome, evidence, status, creation_idempotency_key
        )
        SELECT
          ${input.contractId}::uuid,
          ${input.milestoneId}::uuid,
          ${input.raisedBy}::dispute_raised_by,
          ${input.raisedByUserId}::uuid,
          ${input.reason},
          ${input.desiredOutcome},
          ${JSON.stringify(input.evidence)}::jsonb,
          'open',
          ${input.idempotencyKey}
        WHERE NOT EXISTS (
          SELECT 1 FROM disputes d
          WHERE d.contract_id = ${input.contractId}::uuid
            AND d.status IN ('open', 'under_review', 'escalated')
        )
        RETURNING *
      ),
      updated_contract AS (
        UPDATE contracts c
        SET status = 'disputed',
            active_dispute_id = (SELECT id FROM inserted),
            updated_at = NOW()
        WHERE c.id = ${input.contractId}::uuid
          AND EXISTS (SELECT 1 FROM inserted)
        RETURNING c.status
      ),
      audit AS (
        INSERT INTO dispute_audit_events (
          dispute_id, contract_id, actor_user_id, actor_wallet, action, metadata
        )
        SELECT
          i.id,
          ${input.contractId}::uuid,
          ${input.raisedByUserId}::uuid,
          ${input.actorWallet},
          'dispute_created',
          ${JSON.stringify({
            reason: input.reason,
            milestoneId: input.milestoneId,
            desiredOutcome: input.desiredOutcome,
          })}::jsonb
        FROM inserted i
        RETURNING id
      )
      SELECT
        (SELECT to_jsonb(d) FROM inserted d) AS dispute,
        (SELECT to_jsonb(c) FROM updated_contract c) AS contract
    `) as Row[]

    const row = rows[0]
    const disputeRow = row?.dispute as Row | null | undefined
    if (!disputeRow) return null
    const contractRow = row?.contract as Row | null | undefined
    return {
      dispute: mapDispute(disputeRow),
      contractStatus: (contractRow?.status as ContractRecord['status']) ?? 'disputed',
    }
  }

  async listEvidence(disputeId: string): Promise<EvidenceRecord[]> {
    const rows = (await sql`
      SELECT id, dispute_id, milestone_id, submitted_by_user_id, evidence_type,
             reference_url, label, description, content_hash, created_at
      FROM dispute_evidence_items
      WHERE dispute_id = ${disputeId}
      ORDER BY created_at ASC
    `) as Row[]
    return rows.map(mapEvidence)
  }

  async getEvidenceByHash(
    disputeId: string,
    contentHash: string
  ): Promise<EvidenceRecord | null> {
    const rows = (await sql`
      SELECT id, dispute_id, milestone_id, submitted_by_user_id, evidence_type,
             reference_url, label, description, content_hash, created_at
      FROM dispute_evidence_items
      WHERE dispute_id = ${disputeId} AND content_hash = ${contentHash}
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapEvidence(rows[0]) : null
  }

  async insertEvidence(input: {
    disputeId: string
    milestoneId: string | null
    submittedByUserId: string
    evidenceType: EvidenceType
    referenceUrl: string
    label: string | null
    description: string | null
    contentHash: string
    actorWallet: string
    contractId: string
  }): Promise<EvidenceRecord | null> {
    const rows = (await sql`
      WITH inserted AS (
        INSERT INTO dispute_evidence_items (
          dispute_id, milestone_id, submitted_by_user_id, evidence_type,
          reference_url, label, description, content_hash
        )
        VALUES (
          ${input.disputeId}::uuid,
          ${input.milestoneId}::uuid,
          ${input.submittedByUserId}::uuid,
          ${input.evidenceType},
          ${input.referenceUrl},
          ${input.label},
          ${input.description},
          ${input.contentHash}
        )
        ON CONFLICT (dispute_id, content_hash) DO NOTHING
        RETURNING *
      ),
      audit AS (
        INSERT INTO dispute_audit_events (
          dispute_id, contract_id, actor_user_id, actor_wallet, action, metadata
        )
        SELECT
          i.dispute_id,
          ${input.contractId}::uuid,
          ${input.submittedByUserId}::uuid,
          ${input.actorWallet},
          'evidence_submitted',
          ${JSON.stringify({
            evidenceId: input.contentHash,
            evidenceType: input.evidenceType,
            reference: input.referenceUrl,
          })}::jsonb
        FROM inserted i
        RETURNING id
      )
      SELECT (SELECT to_jsonb(e) FROM inserted e) AS evidence
    `) as Row[]

    const evidenceRow = rows[0]?.evidence as Row | null | undefined
    return evidenceRow ? mapEvidence(evidenceRow) : null
  }

  async getAttempt(attemptId: string): Promise<ResolutionAttemptRecord | null> {
    const rows = (await sql`
      SELECT * FROM dispute_resolution_attempts WHERE id = ${attemptId} LIMIT 1
    `) as Row[]
    return rows[0] ? mapAttempt(rows[0]) : null
  }

  async getAttemptByKey(
    disputeId: string,
    key: string
  ): Promise<ResolutionAttemptRecord | null> {
    const rows = (await sql`
      SELECT * FROM dispute_resolution_attempts
      WHERE dispute_id = ${disputeId} AND idempotency_key = ${key}
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapAttempt(rows[0]) : null
  }

  async getPendingAttempt(disputeId: string): Promise<ResolutionAttemptRecord | null> {
    const rows = (await sql`
      SELECT * FROM dispute_resolution_attempts
      WHERE dispute_id = ${disputeId} AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapAttempt(rows[0]) : null
  }

  async getLatestAttempt(disputeId: string): Promise<ResolutionAttemptRecord | null> {
    const rows = (await sql`
      SELECT * FROM dispute_resolution_attempts
      WHERE dispute_id = ${disputeId}
      ORDER BY created_at DESC
      LIMIT 1
    `) as Row[]
    return rows[0] ? mapAttempt(rows[0]) : null
  }

  async listAttempts(disputeId: string): Promise<ResolutionAttemptRecord[]> {
    const rows = (await sql`
      SELECT * FROM dispute_resolution_attempts
      WHERE dispute_id = ${disputeId}
      ORDER BY created_at DESC
      LIMIT 25
    `) as Row[]
    return rows.map(mapAttempt)
  }

  async createAttempt(input: CreateAttemptRow): Promise<ResolutionAttemptRecord> {
    try {
      const rows = (await sql`
        INSERT INTO dispute_resolution_attempts (
          dispute_id, requested_by_user_id, outcome, reasons, metadata,
          onchain, idempotency_key, retry_of, submitted_at
        )
        VALUES (
          ${input.disputeId}::uuid,
          ${input.requestedByUserId}::uuid,
          ${input.outcome}::dispute_status,
          ${input.reasons},
          ${JSON.stringify(input.metadata)}::jsonb,
          ${input.onchain},
          ${input.idempotencyKey},
          ${input.retryOf}::uuid,
          NOW()
        )
        RETURNING *
      `) as Row[]
      return mapAttempt(rows[0])
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DisputeConflictError(
          'Another resolution attempt is already in progress for this dispute',
          'RESOLUTION_IN_PROGRESS'
        )
      }
      throw err
    }
  }

  async updateAttempt(
    attemptId: string,
    patch: {
      status?: ResolutionAttemptRecord['status']
      txHash?: string | null
      ledger?: number | null
      errorCode?: string | null
      errorMessage?: string | null
      submittedAt?: string | null
      confirmedAt?: string | null
      failedAt?: string | null
    }
  ): Promise<ResolutionAttemptRecord | null> {
    const rows = (await sql`
      UPDATE dispute_resolution_attempts
      SET status        = COALESCE(${patch.status ?? null}, status),
          tx_hash       = COALESCE(${patch.txHash ?? null}, tx_hash),
          ledger        = COALESCE(${patch.ledger ?? null}, ledger),
          error_code    = COALESCE(${patch.errorCode ?? null}, error_code),
          error_message = COALESCE(${patch.errorMessage ?? null}, error_message),
          submitted_at  = COALESCE(${patch.submittedAt ?? null}::timestamptz, submitted_at),
          confirmed_at  = COALESCE(${patch.confirmedAt ?? null}::timestamptz, confirmed_at),
          failed_at     = COALESCE(${patch.failedAt ?? null}::timestamptz, failed_at),
          updated_at    = NOW()
      WHERE id = ${attemptId}
      RETURNING *
    `) as Row[]
    return rows[0] ? mapAttempt(rows[0]) : null
  }

  async confirmResolution(
    input: ConfirmResolutionRow
  ): Promise<ConfirmResolutionResult | null> {
    const rows = (await sql`
      WITH resolved AS (
        UPDATE disputes d
        SET status = ${input.outcome}::dispute_status,
            resolver_id = ${input.resolverId}::uuid,
            resolution_notes = ${input.reasons},
            resolution_metadata = ${JSON.stringify(input.metadata)}::jsonb,
            client_refund_amount = ${input.clientRefundAmount},
            freelancer_payout_amount = ${input.freelancerPayoutAmount},
            resolved_at = NOW(),
            updated_at = NOW(),
            last_resolution_attempt_id = ${input.attemptId}::uuid
        WHERE d.id = ${input.disputeId}::uuid
          AND d.status IN ('open', 'under_review', 'escalated')
        RETURNING d.*
      ),
      confirmed_attempt AS (
        UPDATE dispute_resolution_attempts a
        SET status = 'confirmed',
            tx_hash = COALESCE(${input.txHash}, a.tx_hash),
            ledger = COALESCE(${input.ledger}, a.ledger),
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE a.id = ${input.attemptId}::uuid
          AND a.status = 'pending'
          AND EXISTS (SELECT 1 FROM resolved)
        RETURNING a.*
      ),
      updated_contract AS (
        UPDATE contracts c
        SET status = ${input.contractStatus}::contract_status,
            active_dispute_id = NULL,
            completed_at = CASE WHEN ${input.contractStatus} = 'completed' THEN NOW() ELSE c.completed_at END,
            cancelled_at = CASE WHEN ${input.contractStatus} = 'cancelled' THEN NOW() ELSE c.cancelled_at END,
            updated_at = NOW()
        WHERE c.id = ${input.contractId}::uuid
          AND EXISTS (SELECT 1 FROM resolved)
        RETURNING c.status
      ),
      audit AS (
        INSERT INTO dispute_audit_events (
          dispute_id, contract_id, actor_user_id, actor_wallet, action, metadata
        )
        SELECT
          ${input.disputeId}::uuid,
          ${input.contractId}::uuid,
          ${input.resolverId}::uuid,
          ${input.actorWallet},
          'resolution_confirmed',
          ${JSON.stringify({
            attemptId: input.attemptId,
            outcome: input.outcome,
            txHash: input.txHash,
            ledger: input.ledger,
            onchain: input.txHash !== null,
          })}::jsonb
        WHERE EXISTS (SELECT 1 FROM resolved)
        RETURNING *
      )
      SELECT
        (SELECT to_jsonb(a) FROM confirmed_attempt a) AS attempt,
        (SELECT to_jsonb(d) FROM resolved d) AS dispute,
        (SELECT to_jsonb(c) FROM updated_contract c) AS contract,
        (SELECT to_jsonb(au) FROM audit au) AS audit
    `) as Row[]

    const row = rows[0]
    const attemptRow = row?.attempt as Row | null | undefined
    const disputeRow = row?.dispute as Row | null | undefined
    if (!attemptRow || !disputeRow) return null

    const contractRow = row?.contract as Row | null | undefined
    const auditRow = row?.audit as Row | null | undefined

    return {
      attempt: mapAttempt(attemptRow),
      dispute: mapDispute(disputeRow),
      contractStatus: (contractRow?.status as ContractRecord['status']) ?? input.contractStatus,
      audit: auditRow ? mapAudit(auditRow) : null,
    }
  }

  async appendAudit(input: {
    disputeId: string | null
    contractId: string
    actorUserId: string | null
    actorWallet: string | null
    action: DisputeAuditAction
    metadata?: Record<string, unknown>
  }): Promise<AuditEventRecord | null> {
    const rows = (await sql`
      INSERT INTO dispute_audit_events (
        dispute_id, contract_id, actor_user_id, actor_wallet, action, metadata
      )
      VALUES (
        ${input.disputeId}::uuid,
        ${input.contractId}::uuid,
        ${input.actorUserId}::uuid,
        ${input.actorWallet},
        ${input.action},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      RETURNING *
    `) as Row[]
    return rows[0] ? mapAudit(rows[0]) : null
  }

  async listAudit(disputeId: string, limit: number): Promise<AuditEventRecord[]> {
    const rows = (await sql`
      SELECT * FROM dispute_audit_events
      WHERE dispute_id = ${disputeId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `) as Row[]
    return rows.map(mapAudit)
  }

  async linkAttemptToDispute(disputeId: string, attemptId: string): Promise<void> {
    await sql`
      UPDATE disputes
      SET last_resolution_attempt_id = ${attemptId}::uuid, updated_at = NOW()
      WHERE id = ${disputeId}::uuid
    `
  }
}

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; message?: string }
  return err?.code === '23505' || /duplicate key value/i.test(err?.message ?? '')
}

export const disputeRepository = new SqlDisputeRepository()

/** Exported for tests/documentation: the active-status list used in SQL. */
export const ACTIVE_STATUSES: readonly string[] = ACTIVE_DISPUTE_STATUSES
