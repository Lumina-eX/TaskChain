import type { CanonicalSorobanContractEvent } from '@/lib/contract-sync/types'

/** On-chain milestone passed to `initialize`. Amounts are token base units. */
export interface Milestone {
  id: number
  amount: number
  deadline?: number
  description?: string
  status?: number
  clientApproved?: boolean
  freelancerApproved?: boolean
}

export type EscrowStateStatus = 'unfunded' | 'active' | 'disputed' | 'settled'

export interface EscrowState {
  client: string
  freelancer: string
  token: string
  funded: boolean
  allocated: string
  released: string
  remaining: string
  tokenBalance: string
  status: EscrowStateStatus
}

export interface EscrowMilestone extends Omit<Milestone, 'amount' | 'deadline'> {
  amount: string
  deadline: string
  released: string
  remaining: string
  status: number
  statusName: string
  completed: boolean
}

/** Addresses required by the escrow `initialize` method. */
export interface EscrowParties {
  admin: string
  client: string
  freelancer: string
  arbiter: string
  token: string
}

export interface SorobanSdkConfig {
  /** Deployed escrow contract invoked by `createEscrow`. */
  contractId: string
  /** Account that signs and is passed as `caller` where the contract requires it. */
  sourcePublicKey: string
  /** Wallet callback. Receives unsigned transaction XDR and returns signed XDR. */
  signTransaction?: (xdr: string) => Promise<string>
  rpcUrl?: string
  networkPassphrase?: string
  parties?: EscrowParties
  timeoutSeconds?: number
  confirmationAttempts?: number
  confirmationIntervalMs?: number
}

export interface ParsedContractEvent {
  name: CanonicalSorobanContractEvent
  contractId?: string
  topics: unknown[]
  data: unknown
  milestoneId?: number
  amount?: string
}

export interface TxError {
  message: string
  code?: string
  contractCode?: number
}

export interface TxResult {
  hash: string | null
  status: 'success' | 'failed'
  contractId: string
  method: string
  ledger?: number
  returnValue?: unknown
  events: ParsedContractEvent[]
  error?: TxError
  projectId?: string
}

export class SorobanSdkError extends Error {
  readonly code?: string
  readonly contractCode?: number

  constructor(message: string, options: { code?: string; contractCode?: number } = {}) {
    super(message)
    this.name = 'SorobanSdkError'
    this.code = options.code
    this.contractCode = options.contractCode
  }
}
