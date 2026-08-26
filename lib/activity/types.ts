export const activityActionTypes = [
  'contract_created',
  'milestone_created',
  'milestone_updated',
  'milestone_submitted',
  'milestone_approved',
  'milestone_rejected',
  'escrow_funded',
  'payment_released',
  'escrow_refunded',
  'dispute_created',
  'dispute_resolved',
  'dispute_evidence_uploaded',
  'dispute_evidence_viewed',
  'dispute_evidence_deleted',
  'contract_completed',
  'contract_cancelled',
] as const

export type ActivityActionType = (typeof activityActionTypes)[number]

export interface ActivityLog {
  id: string
  actorId: string
  contractId: string | null
  projectId: string | null
  milestoneId: string | null
  disputeId: string | null
  actionType: ActivityActionType
  description: string
  metadata: Record<string, unknown>
  createdAt: string
  actorUsername: string | null
  actorWalletAddress: string | null
  projectTitle: string | null
}

export interface ActivityLogPage {
  logs: ActivityLog[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

export interface CreateActivityLogInput {
  actorId: string
  contractId?: string
  projectId?: string
  milestoneId?: string
  disputeId?: string
  actionType: ActivityActionType
  description: string
  metadata?: Record<string, unknown>
}

export interface ListActivityLogsParams {
  walletAddress: string
  limitParam: string | null
  offsetParam: string | null
  contractId?: string | null
  projectId?: string | null
  actionType?: string | null
  actorId?: string | null
}