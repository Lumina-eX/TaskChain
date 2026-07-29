/**
 * Escrow Lifecycle Service — Soroban Blockchain Adapter
 *
 * Encapsulates every on-chain interaction behind the IEscrowBlockchainAdapter
 * interface. The service layer only ever calls this adapter — it never imports
 * the Soroban SDK directly. This makes it trivial to:
 *   • Swap in a stub for unit tests
 *   • Replace the Stellar/Soroban implementation with another chain later
 *   • Add retry logic, circuit-breakers, or observability in one place
 *
 * TODO: Replace the stub bodies with real @stellar/stellar-sdk calls once the
 * compiled escrow WASM is available. Each function documents the real steps.
 */

import { SorobanRpc, TransactionBuilder, nativeToScVal, Keypair } from '@stellar/stellar-sdk'
import type { IEscrowBlockchainAdapter } from './types'
import { EscrowBlockchainError } from './errors'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a deterministic-looking mock address from a seed string. */
function mockAddress(seed: string): string {
  const hash = Array.from(seed).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
    0
  )
  return `C${hash.toString(16).padStart(7, '0').toUpperCase()}${'A'.repeat(48)}`
}

/** Derive a deterministic-looking mock tx hash. */
function mockTxHash(seed: string): string {
  const hash = Array.from(seed).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
    0
  )
  return `${Date.now().toString(16)}${hash.toString(16).padStart(16, '0')}`
}

// ---------------------------------------------------------------------------
// Soroban adapter implementation
// ---------------------------------------------------------------------------

/**
 * Production-ready Soroban adapter.
 *
 * All methods currently use stubs that return deterministic mock values so the
 * full service stack can be exercised end-to-end before the on-chain work is
 * complete. Each stub is annotated with the real implementation steps.
 */
export class SorobanEscrowAdapter implements IEscrowBlockchainAdapter {
  private readonly networkPassphrase: string

  constructor() {
    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015'
  }

  // -------------------------------------------------------------------------
  // deployContract
  // -------------------------------------------------------------------------

  async deployContract(params: {
    clientAddress: string
    freelancerAddress: string
    totalAmount: string
    currency: string
  }): Promise<{ contractAddress: string; txHash: string; networkPassphrase: string }> {
    try {
      /**
       * Real implementation steps:
       *  1. Load compiled escrow WASM from build artifacts.
       *  2. Build a SorobanRpc.Server instance pointing at STELLAR_RPC_URL.
       *  3. Upload WASM: server.uploadContractWasm(wasmBuffer, sourceKeypair).
       *  4. Invoke constructor via installContractCode + createContractId,
       *     passing clientAddress, freelancerAddress, totalAmount, currency.
       *  5. Submit transaction: server.sendTransaction(tx).
       *  6. Poll server.getTransaction(hash) until status !== 'NOT_FOUND'.
       *  7. Extract contract ID from transaction result meta XDR.
       *  8. Return { contractAddress: contractId, txHash, networkPassphrase }.
       */
      const seed = `${params.clientAddress}:${params.freelancerAddress}:${params.totalAmount}`
      return {
        contractAddress: mockAddress(seed),
        txHash: mockTxHash(seed),
        networkPassphrase: this.networkPassphrase,
      }
    } catch (err) {
      throw new EscrowBlockchainError('Failed to deploy escrow contract on-chain', err)
    }
  }

  // -------------------------------------------------------------------------
  // verifyFunding
  // -------------------------------------------------------------------------

  async verifyFunding(params: {
    contractAddress: string
    txHash: string
    expectedAmount: string
    currency: string
  }): Promise<{ verified: boolean; onChainAmount: string }> {
    try {
      /**
       * Real implementation steps:
       *  1. Build SorobanRpc.Server instance.
       *  2. Fetch transaction: server.getTransaction(params.txHash).
       *  3. Parse the result XDR to extract the transferred amount and
       *     destination contract address.
       *  4. Verify destination === params.contractAddress.
       *  5. Verify amount >= params.expectedAmount (allow minor rounding).
       *  6. Return { verified: true, onChainAmount: parsedAmount }.
       */
      return {
        verified: true,
        onChainAmount: params.expectedAmount,
      }
    } catch (err) {
      throw new EscrowBlockchainError('Failed to verify funding transaction on-chain', err)
    }
  }

  // -------------------------------------------------------------------------
  // releaseMilestoneFunds
  // -------------------------------------------------------------------------

  async releaseMilestoneFunds(params: {
    contractAddress: string
    milestoneId: string
    recipientAddress: string
    amount: string
    currency: string
  }): Promise<{ txHash: string }> {
    try {
      const rpcUrl =
        process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org'
      const server = new SorobanRpc.Server(rpcUrl)

      const adminSecret = process.env.ESCROW_ADMIN_SECRET_KEY
      if (!adminSecret) {
        throw new Error('ESCROW_ADMIN_SECRET_KEY is not set')
      }
      const adminKeypair = Keypair.fromSecret(adminSecret)
      const adminPublicKey = adminKeypair.publicKey()

      const account = await server.getAccount(adminPublicKey)

      const contract = new SorobanRpc.Contract(params.contractAddress)
      const tx = contract.call(
        'release',
        nativeToScVal(params.milestoneId, { type: 'symbol' }),
        nativeToScVal(params.recipientAddress, { type: 'address' }),
        nativeToScVal(params.amount, { type: 'i128' }),
      )

      const transaction = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(tx)
        .setTimeout(30)
        .build()

      const simulated = await server.simulateTransaction(transaction)
      if (SorobanRpc.isSimulationError(simulated)) {
        throw new Error(
          `Simulation failed: ${simulated.error ?? 'Unknown error'}`,
        )
      }

      const prepared = SorobanRpc.assembleTransaction(transaction, simulated)
      prepared.sign(adminKeypair)

      const sendResponse = await server.sendTransaction(prepared)

      if (sendResponse.status === 'PENDING' || sendResponse.status === 'DUPLICATE') {
        let getTxResponse
        const maxAttempts = 30

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          getTxResponse = await server.getTransaction(sendResponse.hash)

          if (getTxResponse.status === 'SUCCESS') {
            return { txHash: sendResponse.hash }
          }

          if (getTxResponse.status === 'FAILED') {
            throw new Error(`Transaction failed on chain for milestone ${params.milestoneId}`)
          }
        }

        throw new Error(
          `Transaction timed out while waiting for confirmation: ${sendResponse.hash}`,
        )
      }

      throw new Error(
        `Transaction submission failed: ${sendResponse.errorResult?.result?.switch()?.name ?? 'Unknown error'}`,
      )
    } catch (err) {
      throw new EscrowBlockchainError(
        `Failed to release funds for milestone ${params.milestoneId}`,
        err,
      )
    }
  }

  // -------------------------------------------------------------------------
  // refundEscrow
  // -------------------------------------------------------------------------

  async refundEscrow(params: {
    contractAddress: string
    clientAddress: string
    amount: string
    currency: string
  }): Promise<{ txHash: string }> {
    try {
      /**
       * Real implementation steps:
       *  1. Build SorobanRpc.Server + load admin/client keypair.
       *  2. Invoke the escrow contract's `refund` function with
       *     (clientAddress, amount).
       *  3. Simulate → sign → submit → poll until confirmed.
       *  4. Return the tx hash.
       */
      const seed = `refund:${params.contractAddress}:${params.clientAddress}`
      return { txHash: mockTxHash(seed) }
    } catch (err) {
      throw new EscrowBlockchainError('Failed to refund escrow on-chain', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export — controllers import this directly
// ---------------------------------------------------------------------------

/**
 * Default adapter instance.
 * Override in tests by passing a custom adapter to EscrowService.
 */
export const sorobanEscrowAdapter = new SorobanEscrowAdapter()
