export const txActionTypes = [
  'escrow_fund', 'milestone_submit', 'milestone_approve', 'payment_release',
  'refund', 'dispute_raise', 'dispute_resolve', 'contract_deploy',
] as const

export type TxActionType = (typeof txActionTypes)[number]
export type TxRecoveryStatus = 'pending' | 'success' | 'failed' | 'expired'
export type TxNetwork = 'stellar' | 'soroban'

export interface SubmitTransactionParams {
  txHash: string
  actionType: TxActionType
  network: TxNetwork
  contractId?: string
  milestoneId?: string
  userId: string
  metadata?: Record<string, unknown>
  maxRetries?: number
}

export interface TrackedTransaction {
  id: string
  txHash: string
  network: TxNetwork
  contractId: string | null
  milestoneId: string | null
  userId: string
  actionType: TxActionType
  status: TxRecoveryStatus
  retryCount: number
  maxRetries: number
  lastPolledAt: string | null
  nextPollAt: string
  confirmedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface TransactionStatusResponse {
  hash: string
  network: TxNetwork
  actionType: TxActionType
  contractId: string | null
  milestoneId: string | null
  status: TxRecoveryStatus
  retryCount: number
  maxRetries: number
  explorerUrl: string
  errorCode: string | null
  errorMessage: string | null
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PollBatchResult {
  processed: number
  succeeded: number
  failed: number
  expired: number
  stillPending: number
  errors: string[]
}

export class TxRecoveryError extends Error {
  constructor(public readonly code: string, message: string, public readonly httpStatus: number) {
    super(message)
    this.name = 'TxRecoveryError'
  }
}
