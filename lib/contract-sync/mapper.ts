import {
  normalizeSorobanEvent,
} from './types'
import type {
  CanonicalSorobanContractEvent,
  SorobanContractEvent,
  SorobanEventPayload,
} from './types'

export interface ContractStatusUpdate {
  escrowStatus?: string
  contractStatus?: string
  fundedAt?: string
  fundingTxHash?: string
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelledReason?: string
  activeDisputeId?: string | null
}

export interface MilestoneStatusUpdate {
  status?: string
  dueDate?: string
  isOverdue?: boolean
  overdueAt?: string | null
  reminderSentAt?: string | null
  submittedAt?: string
  approvedAt?: string
  paidAt?: string
  releaseTxHash?: string
  rejectionReason?: string | null
}

export interface DisputeResolutionMetadata {
  escrowId?: string
  outcome: 'release_to_freelancer' | 'refund_to_client'
  resolverAddress?: string
  ledger?: number
  timestamp: string
  authorizationSource: 'arbitrator' | 'governance' | 'unknown'
}

export interface SyncAction {
  kind: 'update_contract' | 'update_milestone' | 'update_both' | 'create_dispute' | 'noop'
  contractUpdate: ContractStatusUpdate | null
  milestoneUpdate: MilestoneStatusUpdate | null
  milestoneId: number | null
  disputeInfo: {
    milestoneId?: number
    reason?: string
  } | null
  resolutionMetadata?: DisputeResolutionMetadata | null
}

function nowISO(): string {
  return new Date().toISOString()
}

function resolveOutcome(data: SorobanEventPayload): 'release_to_freelancer' | 'refund_to_client' | null {
  if (typeof data.releaseToFreelancer === 'boolean') {
    return data.releaseToFreelancer ? 'release_to_freelancer' : 'refund_to_client'
  }
  if (data.outcome === 'release_to_freelancer' || data.outcome === 'refund_to_client') {
    return data.outcome
  }
  return null
}

function resolveAuthSource(data: SorobanEventPayload): 'arbitrator' | 'governance' | 'unknown' {
  if (data.authorizationSource === 'arbitrator' || data.authorizationSource === 'governance') {
    return data.authorizationSource
  }
  return 'unknown'
}

export function mapEventToAction(event: SorobanContractEvent, data: SorobanEventPayload): SyncAction {
  const normalizedEvent = normalizeSorobanEvent(String(event))

  switch (normalizedEvent as CanonicalSorobanContractEvent | null) {
    case 'escrow_created':
      return {
        kind: 'noop',
        contractUpdate: null,
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }

    case 'deadline_set':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          ...(data.deadline != null ? { dueDate: new Date(data.deadline * 1000).toISOString() } : {}),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'escrow_funded':
      return {
        kind: 'update_contract',
        contractUpdate: {
          escrowStatus: 'funded',
          contractStatus: 'active',
          fundedAt: nowISO(),
          startedAt: nowISO(),
        },
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }

    case 'milestone_submitted':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'submitted',
          submittedAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'milestone_approved':
    case 'milestone_confirmed':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'approved',
          approvedAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'payment_released':
      return {
        kind: 'update_both',
        contractUpdate: {
          escrowStatus: 'fully_released',
          contractStatus: 'completed',
          completedAt: nowISO(),
        },
        milestoneUpdate: {
          status: 'paid',
          paidAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'refund_issued':
      return {
        kind: 'update_both',
        contractUpdate: {
          escrowStatus: 'refunded',
          contractStatus: 'cancelled',
          cancelledAt: nowISO(),
          cancelledReason: 'Refunded on-chain',
        },
        milestoneUpdate: {
          status: 'refunded',
          rejectionReason: 'Refunded on-chain',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'dispute_raised':
      return {
        kind: 'update_both',
        contractUpdate: {
          contractStatus: 'disputed',
        },
        milestoneUpdate: {
          status: 'disputed',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: {
          milestoneId: data.milestoneId ?? undefined,
          reason: 'Dispute raised on-chain',
        },
      }

    case 'dispute_resolved': {
      const outcome = resolveOutcome(data)
      // Fail closed: an unrecognized or missing outcome must not move funds in the mirror.
      if (outcome === null) {
        return {
          kind: 'noop',
          contractUpdate: null,
          milestoneUpdate: null,
          milestoneId: null,
          disputeInfo: null,
          resolutionMetadata: null,
        }
      }

      const resolvedToFreelancer = outcome === 'release_to_freelancer'
      return {
        kind: 'update_both',
        contractUpdate: {
          escrowStatus: resolvedToFreelancer ? 'fully_released' : 'refunded',
          contractStatus: resolvedToFreelancer ? 'completed' : 'cancelled',
          activeDisputeId: null,
          ...(resolvedToFreelancer
            ? { completedAt: nowISO() }
            : { cancelledAt: nowISO(), cancelledReason: 'Dispute resolved in client favor' }),
        },
        milestoneUpdate: resolvedToFreelancer
          ? { status: 'paid', paidAt: nowISO() }
          : { status: 'refunded', rejectionReason: 'Dispute resolved in client favor' },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
        resolutionMetadata: {
          escrowId: data.escrowId !== undefined ? String(data.escrowId) : undefined,
          outcome,
          resolverAddress: data.resolver,
          ledger: data.ledger,
          timestamp: nowISO(),
          authorizationSource: resolveAuthSource(data),
        },
      }
    }

    case 'dispute_created':
    case 'vote_cast':
    case 'stake_claimed':
      return {
        kind: 'noop',
        contractUpdate: null,
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }

    case 'milestone_expired':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'auto_expired',
          rejectionReason: 'Milestone deadline exceeded',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'deadline_expired':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'expired',
          rejectionReason: 'Milestone deadline exceeded',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'deadline_extended':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          ...(data.wasExpired ? { status: 'extended' } : {}),
          ...(data.deadline != null ? { dueDate: new Date(data.deadline * 1000).toISOString() } : {}),
          isOverdue: false,
          overdueAt: null,
          reminderSentAt: null,
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    default:
      return {
        kind: 'noop',
        contractUpdate: null,
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }
  }
}
