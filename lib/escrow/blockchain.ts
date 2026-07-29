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

import {
  SorobanRpc,
  TransactionBuilder,
  Contract,
  Networks,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk'
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
 * Methods that are fully implemented use real @stellar/stellar-sdk Soroban RPC
 * calls. Methods marked as stubs return deterministic mock values so the full
 * service stack can be exercised end-to-end before the on-chain WASM is deployed.
 */
export class SorobanEscrowAdapter implements IEscrowBlockchainAdapter {
  private readonly networkPassphrase: string
  private readonly rpcUrl: string

  constructor() {
    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015'
    this.rpcUrl =
      process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org'
  }

  /** Lazily-initialised Soroban RPC server instance. */
  private get server(): SorobanRpc.Server {
    return new SorobanRpc.Server(this.rpcUrl)
  }

  /** Get the Stellar network passphrase enum. */
  private get network(): typeof Networks.TESTNET | typeof Networks.PUBLIC {
    return this.networkPassphrase === Networks.PUBLIC
      ? Networks.PUBLIC
      : Networks.TESTNET
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
      /**
       * Real implementation steps:
       *  1. Build SorobanRpc.Server + load client keypair from env/KMS.
       *  2. Invoke the escrow contract's `release_milestone` function with
       *     (milestoneId, recipientAddress, amount).
       *  3. Simulate the transaction to get the footprint.
       *  4. Sign and submit: server.sendTransaction(signedTx).
       *  5. Poll until confirmed, then return the tx hash.
       */
      const seed = `release:${params.contractAddress}:${params.milestoneId}`
      return { txHash: mockTxHash(seed) }
    } catch (err) {
      throw new EscrowBlockchainError(
        `Failed to release funds for milestone ${params.milestoneId}`,
        err
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

  // -------------------------------------------------------------------------
  // buildApproveTransaction
  // -------------------------------------------------------------------------

  async buildApproveTransaction(params: {
    contractAddress: string
    milestoneId: string
    clientAddress: string
  }): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
    try {
      const contract = new Contract(params.contractAddress)

      const rawTx = await this.server.getAccount(params.clientAddress)

      const tx = new TransactionBuilder(rawTx, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('approve', xdr.ScVal.scvU32(Number(params.milestoneId))))
        .setTimeout(300)
        .build()

      const simulated = await this.server.prepareTransaction(tx)

      return {
        unsignedXdr: simulated.toXDR(),
        networkPassphrase: this.networkPassphrase,
      }
    } catch (err) {
      throw new EscrowBlockchainError(
        `Failed to build approval transaction for milestone ${params.milestoneId}`,
        err
      )
    }
  }

  // -------------------------------------------------------------------------
  // submitApprovalTransaction
  // -------------------------------------------------------------------------

  async submitApprovalTransaction(params: {
    signedXdr: string
  }): Promise<{ txHash: string; status: 'pending' | 'confirmed' | 'failed' }> {
    try {
      const tx = TransactionBuilder.fromXDR(params.signedXdr, this.networkPassphrase as any)

      const submitResult = await this.server.sendTransaction(tx)

      if (submitResult.errorResult) {
        return {
          txHash: tx.hash().toString('hex'),
          status: 'failed',
        }
      }

      return {
        txHash: submitResult.hash,
        status: 'pending',
      }
    } catch (err) {
      throw new EscrowBlockchainError('Failed to submit approval transaction', err)
    }
  }

  // -------------------------------------------------------------------------
  // getTransactionStatus
  // -------------------------------------------------------------------------

  async getTransactionStatus(params: {
    txHash: string
  }): Promise<{ status: 'pending' | 'confirmed' | 'failed'; resultMetaXdr?: string }> {
    try {
      const result = await this.server.getTransaction(params.txHash)

      switch (result.status) {
        case 'NOT_FOUND':
          return { status: 'pending' }
        case 'SUCCESS':
          return {
            status: 'confirmed',
            resultMetaXdr: result.resultMetaXdr?.toXDR('base64'),
          }
        case 'FAILED':
          return { status: 'failed' }
        default:
          return { status: 'pending' }
      }
    } catch {
      return { status: 'pending' }
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
