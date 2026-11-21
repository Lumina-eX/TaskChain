/**
 * In-memory DisputeRepository used by the dispute workflow tests.
 *
 * It mirrors the database guarantees that matter for correctness:
 *   • one active dispute per contract
 *   • one pending / one confirmed resolution attempt per dispute
 *   • duplicate evidence references are not inserted twice
 *   • audit rows are append-only
 */

import {
  DisputeConflictError,
  type AuditEventRecord,
  type ContractRecord,
  type DisputeActor,
  type DisputeAuditAction,
  type DisputeRecord,
  type EvidenceRecord,
  type EvidenceType,
  type MilestoneRecord,
  type ResolutionAttemptRecord,
} from '@/lib/disputes/types'
import type {
  ConfirmResolutionRow,
  ConfirmResolutionResult,
  CreateAttemptRow,
  CreateDisputeRow,
  DisputeRepository,
} from '@/lib/disputes/repository'

let seq = 0
function id(prefix: string): string {
  seq += 1
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

const ACTIVE = ['open', 'under_review', 'escalated']

export class FakeDisputeRepository implements DisputeRepository {
  users = new Map<string, DisputeActor>()
  contracts = new Map<string, ContractRecord>()
  milestones = new Map<string, MilestoneRecord>()
  disputes = new Map<string, DisputeRecord>()
  evidence: EvidenceRecord[] = []
  attempts = new Map<string, ResolutionAttemptRecord>()
  audits: AuditEventRecord[] = []
  available = true

  seedUser(actor: DisputeActor): DisputeActor {
    this.users.set(actor.walletAddress.toLowerCase(), actor)
    return actor
  }

  seedContract(contract: ContractRecord): ContractRecord {
    this.contracts.set(contract.id, contract)
    return contract
  }

  seedMilestone(milestone: MilestoneRecord): MilestoneRecord {
    this.milestones.set(milestone.id, milestone)
    return milestone
  }

  seedDispute(dispute: Partial<DisputeRecord> & { id: string; contractId: string }): DisputeRecord {
    const now = new Date().toISOString()
    const record: DisputeRecord = {
      milestoneId: null,
      raisedBy: 'client',
      raisedByUserId: 'user-client',
      reason: 'Seeded dispute reason',
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
      createdAt: now,
      updatedAt: now,
      ...dispute,
    }
    this.disputes.set(record.id, record)
    return record
  }

  isAvailable(): boolean {
    return this.available
  }

  async findUserByWallet(walletAddress: string): Promise<DisputeActor | null> {
    return this.users.get(walletAddress.toLowerCase()) ?? null
  }

  async getContract(contractId: string): Promise<ContractRecord | null> {
    return this.contracts.get(contractId) ?? null
  }

  async getMilestone(milestoneId: string): Promise<MilestoneRecord | null> {
    return this.milestones.get(milestoneId) ?? null
  }

  async getDispute(disputeId: string): Promise<DisputeRecord | null> {
    return this.disputes.get(disputeId) ?? null
  }

  async getDisputeByCreationKey(contractId: string, key: string) {
    for (const dispute of this.disputes.values()) {
      if (dispute.contractId === contractId && dispute.creationIdempotencyKey === key) {
        return dispute
      }
    }
    return null
  }

  async getActiveDisputeForContract(contractId: string) {
    for (const dispute of this.disputes.values()) {
      if (dispute.contractId === contractId && ACTIVE.includes(dispute.status)) {
        return dispute
      }
    }
    return null
  }

  async createDisputeAtomic(input: CreateDisputeRow) {
    const contract = this.contracts.get(input.contractId)
    if (!contract) return null
    if (await this.getActiveDisputeForContract(input.contractId)) return null

    const now = new Date().toISOString()
    const dispute: DisputeRecord = {
      id: id('dispute'),
      contractId: input.contractId,
      milestoneId: input.milestoneId,
      raisedBy: input.raisedBy,
      raisedByUserId: input.raisedByUserId,
      reason: input.reason,
      desiredOutcome: input.desiredOutcome,
      status: 'open',
      resolverId: null,
      resolutionNotes: null,
      resolutionMetadata: {},
      clientRefundAmount: null,
      freelancerPayoutAmount: null,
      resolvedAt: null,
      creationIdempotencyKey: input.idempotencyKey,
      lastResolutionAttemptId: null,
      createdAt: now,
      updatedAt: now,
    }
    this.disputes.set(dispute.id, dispute)
    this.contracts.set(contract.id, {
      ...contract,
      status: 'disputed',
      activeDisputeId: dispute.id,
    })
    this.audits.push({
      id: id('audit'),
      disputeId: dispute.id,
      contractId: contract.id,
      actorUserId: input.raisedByUserId,
      actorWallet: input.actorWallet,
      action: 'dispute_created',
      metadata: {},
      createdAt: now,
    })
    return { dispute, contractStatus: 'disputed' as const }
  }

  async listEvidence(disputeId: string): Promise<EvidenceRecord[]> {
    return this.evidence.filter((item) => item.disputeId === disputeId)
  }

  async getEvidenceByHash(disputeId: string, contentHash: string) {
    return (
      this.evidence.find(
        (item) => item.disputeId === disputeId && item.contentHash === contentHash
      ) ?? null
    )
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
    const exists = await this.getEvidenceByHash(input.disputeId, input.contentHash)
    if (exists) return null

    const now = new Date().toISOString()
    const record: EvidenceRecord = {
      id: id('evidence'),
      disputeId: input.disputeId,
      milestoneId: input.milestoneId,
      submittedByUserId: input.submittedByUserId,
      evidenceType: input.evidenceType,
      referenceUrl: input.referenceUrl,
      label: input.label,
      description: input.description,
      contentHash: input.contentHash,
      createdAt: now,
    }
    this.evidence.push(record)
    this.audits.push({
      id: id('audit'),
      disputeId: input.disputeId,
      contractId: input.contractId,
      actorUserId: input.submittedByUserId,
      actorWallet: input.actorWallet,
      action: 'evidence_submitted',
      metadata: { reference: input.referenceUrl },
      createdAt: now,
    })
    return record
  }

  async getAttempt(attemptId: string) {
    return this.attempts.get(attemptId) ?? null
  }

  async getAttemptByKey(disputeId: string, key: string) {
    for (const attempt of this.attempts.values()) {
      if (attempt.disputeId === disputeId && attempt.idempotencyKey === key) {
        return attempt
      }
    }
    return null
  }

  async getPendingAttempt(disputeId: string) {
    for (const attempt of this.attempts.values()) {
      if (attempt.disputeId === disputeId && attempt.status === 'pending') return attempt
    }
    return null
  }

  async getLatestAttempt(disputeId: string) {
    const list = await this.listAttempts(disputeId)
    return list[0] ?? null
  }

  async listAttempts(disputeId: string) {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.disputeId === disputeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async createAttempt(input: CreateAttemptRow): Promise<ResolutionAttemptRecord> {
    // Synchronous checks (no await before the insert) mirror the unique
    // indexes in migration 012: exactly one pending attempt can exist.
    for (const attempt of this.attempts.values()) {
      if (
        attempt.disputeId === input.disputeId &&
        attempt.idempotencyKey === input.idempotencyKey
      ) {
        throw new DisputeConflictError(
          'Duplicate attempt key',
          'IDEMPOTENCY_KEY_REUSED'
        )
      }
      if (attempt.disputeId === input.disputeId && attempt.status === 'pending') {
        throw new DisputeConflictError(
          'Another resolution attempt is already in progress',
          'RESOLUTION_IN_PROGRESS'
        )
      }
    }

    const now = new Date().toISOString()
    const attempt: ResolutionAttemptRecord = {
      id: id('attempt'),
      disputeId: input.disputeId,
      requestedByUserId: input.requestedByUserId,
      outcome: input.outcome,
      reasons: input.reasons,
      metadata: input.metadata,
      status: 'pending',
      onchain: input.onchain,
      txHash: null,
      ledger: null,
      errorCode: null,
      errorMessage: null,
      retryOf: input.retryOf,
      idempotencyKey: input.idempotencyKey,
      submittedAt: now,
      confirmedAt: null,
      failedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.attempts.set(attempt.id, attempt)
    return attempt
  }

  async updateAttempt(
    attemptId: string,
    patch: Partial<ResolutionAttemptRecord>
  ): Promise<ResolutionAttemptRecord | null> {
    const existing = this.attempts.get(attemptId)
    if (!existing) return null
    const updated: ResolutionAttemptRecord = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ),
      updatedAt: new Date().toISOString(),
    }
    this.attempts.set(attemptId, updated)
    return updated
  }

  async confirmResolution(
    input: ConfirmResolutionRow
  ): Promise<ConfirmResolutionResult | null> {
    const dispute = this.disputes.get(input.disputeId)
    const attempt = this.attempts.get(input.attemptId)
    if (!dispute || !attempt) return null
    if (!ACTIVE.includes(dispute.status)) return null
    if (attempt.status !== 'pending') return null

    const now = new Date().toISOString()
    const updatedDispute: DisputeRecord = {
      ...dispute,
      status: input.outcome,
      resolverId: input.resolverId,
      resolutionNotes: input.reasons,
      resolutionMetadata: input.metadata,
      clientRefundAmount: input.clientRefundAmount,
      freelancerPayoutAmount: input.freelancerPayoutAmount,
      resolvedAt: now,
      lastResolutionAttemptId: input.attemptId,
      updatedAt: now,
    }
    const updatedAttempt: ResolutionAttemptRecord = {
      ...attempt,
      status: 'confirmed',
      txHash: input.txHash ?? attempt.txHash,
      ledger: input.ledger ?? attempt.ledger,
      confirmedAt: now,
      updatedAt: now,
    }
    this.disputes.set(dispute.id, updatedDispute)
    this.attempts.set(attempt.id, updatedAttempt)

    const contract = this.contracts.get(input.contractId)
    if (contract) {
      this.contracts.set(contract.id, {
        ...contract,
        status: input.contractStatus,
        activeDisputeId: null,
      })
    }

    const audit: AuditEventRecord = {
      id: id('audit'),
      disputeId: dispute.id,
      contractId: input.contractId,
      actorUserId: input.resolverId,
      actorWallet: input.actorWallet,
      action: 'resolution_confirmed',
      metadata: { attemptId: attempt.id, txHash: input.txHash },
      createdAt: now,
    }
    this.audits.push(audit)

    return {
      attempt: updatedAttempt,
      dispute: updatedDispute,
      contractStatus: input.contractStatus,
      audit,
    }
  }

  async appendAudit(input: {
    disputeId: string | null
    contractId: string
    actorUserId: string | null
    actorWallet: string | null
    action: DisputeAuditAction
    metadata?: Record<string, unknown>
  }): Promise<AuditEventRecord> {
    const audit: AuditEventRecord = {
      id: id('audit'),
      disputeId: input.disputeId ?? '',
      contractId: input.contractId,
      actorUserId: input.actorUserId,
      actorWallet: input.actorWallet,
      action: input.action,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    }
    this.audits.push(audit)
    return audit
  }

  async listAudit(disputeId: string, limit: number): Promise<AuditEventRecord[]> {
    return this.audits.filter((audit) => audit.disputeId === disputeId).slice(0, limit)
  }

  async linkAttemptToDispute(disputeId: string, attemptId: string): Promise<void> {
    const dispute = this.disputes.get(disputeId)
    if (dispute) {
      this.disputes.set(disputeId, { ...dispute, lastResolutionAttemptId: attemptId })
    }
  }
}
