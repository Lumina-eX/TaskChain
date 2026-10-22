export type TxStatus = 'pending' | 'confirmed' | 'failed'
export type Outcome = 'release_to_freelancer' | 'refund_to_client' | 'split'

export interface EscrowChain {
  submitResolution(args: {
    escrowContractId: string
    disputeId: string
    outcome: Outcome
    splitBps?: number
  }): Promise<{ txHash: string }>
  getTxStatus(txHash: string): Promise<TxStatus>
}

// REPLACE: wire both methods to the existing Soroban/Stellar helpers
// (see docs/soroban-escrow-deployment.md). The contract itself must enforce who may
// resolve, so the backend check below can never bypass the contract's own rules.
export const escrowChain: EscrowChain = {
  async submitResolution() {
    throw new Error('escrow_not_configured')
  },
  async getTxStatus() {
    throw new Error('escrow_not_configured')
  },
}