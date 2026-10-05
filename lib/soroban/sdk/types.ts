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
  signTransaction: (xdr: string) => Promise<string>
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
  constructor(message: string) {
    super(message)
    this.name = 'SorobanSdkError'
  }
}
