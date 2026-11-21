/**
 * Dispute Resolution Workflow — Blockchain Gateway
 *
 * Wraps the escrow contract's `resolve_dispute(milestone_id, release_to_freelancer)`
 * call behind a small interface so the service can be tested without an RPC
 * endpoint.
 *
 * Security / reliability rules encoded here:
 *   • The on-chain arbiter signature is required by the contract itself
 *     (`arbiter.require_auth()`); the gateway signs with the configured arbiter
 *     key and refuses to run without it. Backend authorization never replaces
 *     the contract's own authorization.
 *   • A submission is only reported as `confirmed` after the transaction has
 *     been independently re-fetched from the RPC node and reported SUCCESS.
 *   • RPC failures/timeouts are surfaced as retryable DisputeChainError so the
 *     service can persist a recoverable failed/pending attempt instead of
 *     losing the record.
 */

import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import {
  SorobanContractClient,
} from '@/lib/soroban/sdk/client'
import { DisputeChainError } from './types'

export type ChainSubmissionState = 'confirmed' | 'pending' | 'failed'

export interface ChainResolutionRequest {
  contractAddress: string
  /** Escrow milestones are addressed on-chain by their u32 id. */
  milestoneId: string
  /** true → funds go to the freelancer, false → funds go back to the client. */
  releaseToFreelancer: boolean
  disputeId: string
}

export interface ChainResolutionSubmission {
  txHash: string | null
  state: ChainSubmissionState
  ledger?: number | null
  errorCode?: string
  errorMessage?: string
}

export interface DisputeChainGateway {
  submitResolution(request: ChainResolutionRequest): Promise<ChainResolutionSubmission>
  verifyResolution(
    txHash: string,
    contractAddress?: string
  ): Promise<'confirmed' | 'failed' | 'pending' | 'unknown'>
}

export interface SorobanDisputeChainGatewayConfig {
  rpcUrl: string
  networkPassphrase: string
  arbiterSecret: string
  /** How many ledgers to wait for confirmation inside a single request. */
  confirmationAttempts?: number
  confirmationIntervalMs?: number
}

function readConfig(): SorobanDisputeChainGatewayConfig {
  const rpcUrl = (
    process.env.STELLAR_RPC_URL?.trim() ?? process.env.SOROBAN_RPC_URL?.trim()
  )
  const arbiterSecret = process.env.STELLAR_ARBITER_SECRET?.trim()
  const networkPassphrase =
    process.env.STELLAR_NETWORK_PASSPHRASE?.trim() || Networks.TESTNET

  if (!rpcUrl || !arbiterSecret) {
    throw new DisputeChainError(
      'On-chain dispute resolution is not configured (STELLAR_RPC_URL / STELLAR_ARBITER_SECRET)',
      'BLOCKCHAIN_NOT_CONFIGURED',
      true
    )
  }

  return {
    rpcUrl,
    arbiterSecret,
    networkPassphrase,
    confirmationAttempts: Number(process.env.STELLAR_CONFIRMATION_ATTEMPTS ?? 10),
    confirmationIntervalMs: Number(process.env.STELLAR_CONFIRMATION_INTERVAL_MS ?? 1500),
  }
}

export class SorobanDisputeChainGateway implements DisputeChainGateway {
  constructor(private readonly config?: SorobanDisputeChainGatewayConfig) {}

  private buildClient(contractAddress: string): SorobanContractClient {
    const config = this.config ?? readConfig()
    const arbiter = Keypair.fromSecret(config.arbiterSecret)

    return new SorobanContractClient({
      contractId: contractAddress,
      sourcePublicKey: arbiter.publicKey(),
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      confirmationAttempts: config.confirmationAttempts,
      confirmationIntervalMs: config.confirmationIntervalMs,
      signTransaction: async (unsignedXdr: string) => {
        const transaction = TransactionBuilder.fromXDR(
          unsignedXdr,
          config.networkPassphrase
        )
        transaction.sign(arbiter)
        return transaction.toXDR()
      },
    })
  }

  async submitResolution(
    request: ChainResolutionRequest
  ): Promise<ChainResolutionSubmission> {
    if (!request.contractAddress) {
      throw new DisputeChainError(
        'Contract has no on-chain escrow address',
        'BLOCKCHAIN_NOT_CONFIGURED',
        false
      )
    }

    let result
    try {
      result = await this.buildClient(request.contractAddress).resolveDispute(
        request.contractAddress,
        request.milestoneId,
        request.releaseToFreelancer
      )
    } catch (err) {
      throw new DisputeChainError(
        err instanceof Error ? err.message : 'Escrow RPC call failed',
        'BLOCKCHAIN_UNAVAILABLE',
        true
      )
    }

    if (result.status === 'failed') {
      // A reverted transaction is deterministic: retrying the exact same call
      // will not help, so report it as a non-retryable failure.
      return {
        txHash: result.hash,
        state: 'failed',
        errorCode: result.error?.code ?? 'CONTRACT_REVERTED',
        errorMessage: result.error?.message ?? 'Escrow contract rejected the resolution',
      }
    }

    if (!result.hash) {
      return {
        txHash: null,
        state: 'pending',
        errorCode: 'TX_HASH_PENDING',
        errorMessage: 'Transaction was accepted but no hash was returned yet',
      }
    }

    // Never trust the submission response alone — re-fetch the transaction.
    const verified = await this.verifyResolution(result.hash, request.contractAddress)
    if (verified === 'failed') {
      return {
        txHash: result.hash,
        state: 'failed',
        errorCode: 'CONTRACT_REVERTED',
        errorMessage: 'Resolution transaction failed on-chain',
      }
    }

    return {
      txHash: result.hash,
      state: verified === 'confirmed' ? 'confirmed' : 'pending',
      ledger: result.ledger ?? null,
    }
  }

  async verifyResolution(
    txHash: string,
    contractAddress?: string
  ): Promise<'confirmed' | 'failed' | 'pending' | 'unknown'> {
    const address = contractAddress ?? process.env.STELLAR_ESCROW_CONTRACT_ID ?? ''
    if (!address) return 'unknown'
    try {
      const client = this.buildClient(address)
      return await client.getTransactionStatus(txHash)
    } catch {
      return 'unknown'
    }
  }
}

export const sorobanDisputeChainGateway = new SorobanDisputeChainGateway()
