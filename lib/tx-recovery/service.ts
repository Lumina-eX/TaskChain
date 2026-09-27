import { Horizon, rpc } from '@stellar/stellar-sdk'
import { sql } from '@/lib/db'
import type {
  PollBatchResult, SubmitTransactionParams, TrackedTransaction,
  TransactionStatusResponse, TxActionType, TxNetwork, TxRecoveryStatus,
} from './types'
import { TxRecoveryError } from './types'

type ChainResult =
  | { status: 'pending' }
  | { status: 'success'; ledger?: number; createdAt?: string | number; fee?: string }
  | { status: 'failed'; code: string; message: string }

type Verifier = (tx: TrackedTransaction) => Promise<ChainResult>
const HASH = /^[0-9a-f]{64}$/
const SELECT_COLUMNS = `id, tx_hash, network, contract_id, milestone_id, user_id,
  action_type, status, retry_count, max_retries, last_polled_at, next_poll_at,
  confirmed_at, error_code, error_message, metadata, created_at, updated_at`

export class TxRecoveryService {
  private readonly verifyOverride?: Verifier
  private readonly horizonUrl: string
  private readonly sorobanRpcUrl: string
  private readonly explorerBaseUrl: string

  constructor(options: {
    horizonUrl?: string
    sorobanRpcUrl?: string
    explorerBaseUrl?: string
    verifier?: Verifier
  } = {}) {
    this.horizonUrl = options.horizonUrl ?? process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
    this.sorobanRpcUrl = options.sorobanRpcUrl ?? process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
    this.explorerBaseUrl = options.explorerBaseUrl ?? process.env.STELLAR_EXPLORER_TX_URL ?? 'https://stellar.expert/explorer/testnet/tx'
    this.verifyOverride = options.verifier
  }

  async submitTransaction(params: SubmitTransactionParams): Promise<{ transaction: TrackedTransaction; isDuplicate: boolean }> {
    const txHash = params.txHash.trim().toLowerCase()
    if (!HASH.test(txHash)) throw new TxRecoveryError('INVALID_TX_HASH', 'Transaction hash must be 64 hexadecimal characters.', 422)
    this.validateContext(params.actionType, params.contractId, params.milestoneId)

    const inserted = await sql.query(
      `WITH inserted AS (
         INSERT INTO tracked_transactions
           (tx_hash, network, contract_id, milestone_id, user_id, action_type, max_retries, metadata)
         VALUES ($1, $2::tx_network, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::jsonb)
         ON CONFLICT (tx_hash) DO NOTHING
         RETURNING ${SELECT_COLUMNS}
       ), audited AS (
         INSERT INTO transaction_lifecycle_events (tracked_transaction_id, status, message)
         SELECT id, 'pending', 'Transaction submitted for confirmation tracking' FROM inserted
       ) SELECT * FROM inserted`,
      [txHash, params.network, params.contractId ?? null, params.milestoneId ?? null,
        params.userId, params.actionType, params.maxRetries ?? 10, JSON.stringify(params.metadata ?? {})]
    ) as Array<Record<string, unknown>>

    if (inserted.length) return { transaction: this.mapRow(inserted[0]), isDuplicate: false }

    const existing = await sql.query(
      `SELECT ${SELECT_COLUMNS} FROM tracked_transactions WHERE tx_hash = $1 LIMIT 1`, [txHash]
    ) as Array<Record<string, unknown>>
    if (!existing.length) throw new TxRecoveryError('TX_SUBMIT_FAILED', 'Transaction registration failed.', 500)
    const transaction = this.mapRow(existing[0])
    const sameContext = transaction.network === params.network &&
      transaction.actionType === params.actionType &&
      transaction.contractId === (params.contractId ?? null) &&
      transaction.milestoneId === (params.milestoneId ?? null) &&
      transaction.userId === params.userId
    if (!sameContext) throw new TxRecoveryError('TX_HASH_CONTEXT_CONFLICT', 'Transaction hash is already bound to a different operation.', 409)
    return { transaction, isDuplicate: true }
  }

  async getTransactionStatus(txHashInput: string): Promise<TransactionStatusResponse> {
    const txHash = txHashInput.trim().toLowerCase()
    if (!HASH.test(txHash)) throw new TxRecoveryError('INVALID_TX_HASH', 'Transaction hash must be 64 hexadecimal characters.', 422)
    const rows = await sql.query(
      `SELECT ${SELECT_COLUMNS} FROM tracked_transactions WHERE tx_hash = $1 LIMIT 1`, [txHash]
    ) as Array<Record<string, unknown>>
    if (!rows.length) throw new TxRecoveryError('TX_NOT_FOUND', 'Transaction is not tracked.', 404)
    const tx = this.mapRow(rows[0])
    return {
      hash: tx.txHash, network: tx.network, actionType: tx.actionType,
      contractId: tx.contractId, milestoneId: tx.milestoneId, status: tx.status,
      retryCount: tx.retryCount, maxRetries: tx.maxRetries,
      explorerUrl: `${this.explorerBaseUrl}/${tx.txHash}`,
      errorCode: tx.errorCode, errorMessage: tx.errorMessage,
      confirmedAt: tx.confirmedAt, createdAt: tx.createdAt, updatedAt: tx.updatedAt,
    }
  }

  async pollPendingQueue(batchSize = 50): Promise<PollBatchResult> {
    const limit = Number.isInteger(batchSize) ? Math.min(100, Math.max(1, batchSize)) : 50
    // Claim rows for five minutes so overlapping workers do not poll the same hash.
    const rows = await sql.query(
      `WITH due AS (
         SELECT id FROM tracked_transactions
          WHERE status = 'pending' AND next_poll_at <= NOW()
          ORDER BY next_poll_at LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       UPDATE tracked_transactions t SET next_poll_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
        FROM due WHERE t.id = due.id RETURNING ${SELECT_COLUMNS.split(', ').map(c => `t.${c.trim()}`).join(', ')}`,
      [limit]
    ) as Array<Record<string, unknown>>
    const result: PollBatchResult = { processed: rows.length, succeeded: 0, failed: 0, expired: 0, stillPending: 0, errors: [] }
    for (const row of rows) {
      const tx = this.mapRow(row)
      try {
        const status = await this.verifyAndSyncTransaction(tx)
        if (status === 'success') result.succeeded++
        else if (status === 'failed') result.failed++
        else if (status === 'expired') result.expired++
        else result.stillPending++
      } catch (error) {
        result.errors.push(`Tx ${tx.txHash}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return result
  }

  async verifyAndSyncTransaction(txOrHash: TrackedTransaction | string): Promise<TxRecoveryStatus> {
    const tx = typeof txOrHash === 'string' ? await this.getTracked(txOrHash) : txOrHash
    if (tx.status !== 'pending') return tx.status
    try {
      const result = this.verifyOverride ? await this.verifyOverride(tx) : await this.verifyOnChain(tx)
      if (result.status === 'success') return this.syncSuccess(tx, result)
      if (result.status === 'failed') return this.transitionTerminal(tx, 'failed', result.code, result.message)
      return this.scheduleRetry(tx, 'TX_NOT_CONFIRMED', 'Transaction is not yet present in a confirmed ledger')
    } catch (error) {
      return this.scheduleRetry(tx, 'RPC_UNAVAILABLE', error instanceof Error ? error.message : 'Blockchain RPC request failed')
    }
  }

  private async verifyOnChain(tx: TrackedTransaction): Promise<ChainResult> {
    if (tx.network === 'soroban') {
      const response = await new rpc.Server(this.sorobanRpcUrl).getTransaction(tx.txHash)
      if (response.txHash.toLowerCase() !== tx.txHash) return { status: 'failed', code: 'RPC_HASH_MISMATCH', message: 'Soroban RPC returned a different transaction hash' }
      if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) return { status: 'success', ledger: response.ledger, createdAt: response.createdAt }
      if (response.status === rpc.Api.GetTransactionStatus.FAILED) return { status: 'failed', code: 'TX_FAILED_ON_CHAIN', message: 'Soroban transaction execution failed' }
      return { status: 'pending' }
    }
    try {
      const response = await new Horizon.Server(this.horizonUrl).transactions().transaction(tx.txHash).call()
      const record = response as unknown as { hash: string; successful: boolean; ledger?: number; created_at?: string; fee_charged?: string }
      if (record.hash.toLowerCase() !== tx.txHash) return { status: 'failed', code: 'RPC_HASH_MISMATCH', message: 'Horizon returned a different transaction hash' }
      return record.successful
        ? { status: 'success', ledger: record.ledger, createdAt: record.created_at, fee: record.fee_charged }
        : { status: 'failed', code: 'TX_FAILED_ON_CHAIN', message: 'Stellar transaction execution failed' }
    } catch (error) {
      if (this.httpStatus(error) === 404) return { status: 'pending' }
      throw error
    }
  }

  private async scheduleRetry(tx: TrackedTransaction, code: string, message: string): Promise<TxRecoveryStatus> {
    const retryCount = tx.retryCount + 1
    if (retryCount >= tx.maxRetries) return this.transitionTerminal(tx, 'expired', 'TX_EXPIRED_TIMEOUT', `${message}; retry limit reached`)
    const base = Math.min(300, 3 * 2 ** tx.retryCount)
    const delay = Math.round(base * (0.75 + Math.random() * 0.5))
    await sql.query(
      `UPDATE tracked_transactions SET retry_count = $2, last_polled_at = NOW(),
         next_poll_at = NOW() + ($3 * INTERVAL '1 second'), error_code = $4,
         error_message = $5, updated_at = NOW() WHERE id = $1::uuid AND status = 'pending'`,
      [tx.id, retryCount, delay, code, message]
    )
    return 'pending'
  }

  private async syncSuccess(tx: TrackedTransaction, chain: Extract<ChainResult, { status: 'success' }>): Promise<TxRecoveryStatus> {
    const metadata = JSON.stringify({ ...tx.metadata, ledger: chain.ledger, onChainCreatedAt: chain.createdAt, fee: chain.fee })
    let domainCte = ''
    if (tx.actionType === 'escrow_fund') domainCte = `, domain_update AS (UPDATE contracts SET escrow_status='funded', status='active', funded_at=NOW(), funding_tx_hash=$2, updated_at=NOW() WHERE id=$3::uuid AND EXISTS (SELECT 1 FROM transitioned))`
    else if (tx.actionType === 'contract_deploy') domainCte = `, domain_update AS (UPDATE contracts SET contract_tx_hash=$2, updated_at=NOW() WHERE id=$3::uuid AND EXISTS (SELECT 1 FROM transitioned))`
    else if (tx.actionType === 'dispute_raise') domainCte = `, domain_update AS (UPDATE contracts SET status='disputed', updated_at=NOW() WHERE id=$3::uuid AND EXISTS (SELECT 1 FROM transitioned))`
    else {
      const state: Partial<Record<TxActionType, string>> = { milestone_submit: 'submitted', milestone_approve: 'approved', payment_release: 'paid', refund: 'rejected' }
      const next = state[tx.actionType]
      if (tx.actionType === 'refund') domainCte = `,
        domain_update AS (UPDATE milestones SET status='rejected', rejection_reason='Refund confirmed on-chain', updated_at=NOW() WHERE id=$4::uuid AND EXISTS (SELECT 1 FROM transitioned) RETURNING contract_id),
        contract_refund AS (UPDATE contracts SET escrow_status='refunded', updated_at=NOW() WHERE id IN (SELECT contract_id FROM domain_update))`
      else if (next) domainCte = `, domain_update AS (UPDATE milestones SET status='${next}', updated_at=NOW() WHERE id=$4::uuid AND EXISTS (SELECT 1 FROM transitioned))`
    }
    const rows = await sql.query(
      `WITH transitioned AS (
         UPDATE tracked_transactions SET status='success', confirmed_at=NOW(), last_polled_at=NOW(),
           error_code=NULL, error_message=NULL, metadata=$5::jsonb, updated_at=NOW()
          WHERE id=$1::uuid AND status='pending' RETURNING id
       )${domainCte}, audited AS (
         INSERT INTO transaction_lifecycle_events (tracked_transaction_id,status,message,metadata)
         SELECT id,'success','Blockchain confirmation received',$5::jsonb FROM transitioned
         ON CONFLICT (tracked_transaction_id,status) DO NOTHING
       ) SELECT id FROM transitioned`,
      [tx.id, tx.txHash, tx.contractId, tx.milestoneId, metadata]
    ) as Array<{ id: string }>
    return rows.length ? 'success' : (await this.getTracked(tx.txHash)).status
  }

  private async transitionTerminal(tx: TrackedTransaction, status: 'failed' | 'expired', code: string, message: string): Promise<TxRecoveryStatus> {
    const rows = await sql.query(
      `WITH transitioned AS (
         UPDATE tracked_transactions SET status=$2::tx_recovery_status, retry_count=CASE WHEN $2='expired' THEN retry_count+1 ELSE retry_count END,
           last_polled_at=NOW(), error_code=$3, error_message=$4, updated_at=NOW()
          WHERE id=$1::uuid AND status='pending' RETURNING id
       ), audited AS (
         INSERT INTO transaction_lifecycle_events (tracked_transaction_id,status,code,message)
         SELECT id,$2::tx_recovery_status,$3,$4 FROM transitioned
         ON CONFLICT (tracked_transaction_id,status) DO NOTHING
       ) SELECT id FROM transitioned`, [tx.id, status, code, message]
    ) as Array<{ id: string }>
    return rows.length ? status : (await this.getTracked(tx.txHash)).status
  }

  private async getTracked(hash: string): Promise<TrackedTransaction> {
    const clean = hash.trim().toLowerCase()
    if (!HASH.test(clean)) throw new TxRecoveryError('INVALID_TX_HASH', 'Transaction hash must be 64 hexadecimal characters.', 422)
    const rows = await sql.query(`SELECT ${SELECT_COLUMNS} FROM tracked_transactions WHERE tx_hash=$1 LIMIT 1`, [clean]) as Array<Record<string, unknown>>
    if (!rows.length) throw new TxRecoveryError('TX_NOT_FOUND', 'Transaction is not tracked.', 404)
    return this.mapRow(rows[0])
  }

  private validateContext(action: TxActionType, contractId?: string, milestoneId?: string): void {
    const milestoneActions: TxActionType[] = ['milestone_submit', 'milestone_approve', 'payment_release', 'refund']
    if (milestoneActions.includes(action) && !milestoneId) throw new TxRecoveryError('MILESTONE_REQUIRED', 'This action requires a milestoneId.', 422)
    if (['escrow_fund', 'contract_deploy'].includes(action) && !contractId) throw new TxRecoveryError('CONTRACT_REQUIRED', 'This action requires a contractId.', 422)
    if (action.startsWith('dispute_') && !contractId && !milestoneId) throw new TxRecoveryError('ENTITY_REQUIRED', 'Dispute actions require a contractId or milestoneId.', 422)
  }

  private httpStatus(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status : undefined
  }

  private mapRow(row: Record<string, unknown>): TrackedTransaction {
    return {
      id: String(row.id), txHash: String(row.tx_hash), network: String(row.network) as TxNetwork,
      contractId: row.contract_id ? String(row.contract_id) : null,
      milestoneId: row.milestone_id ? String(row.milestone_id) : null,
      userId: String(row.user_id), actionType: String(row.action_type) as TxActionType,
      status: String(row.status) as TxRecoveryStatus, retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries), lastPolledAt: this.iso(row.last_polled_at),
      nextPollAt: this.iso(row.next_poll_at)!, confirmedAt: this.iso(row.confirmed_at),
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      metadata: typeof row.metadata === 'object' && row.metadata ? row.metadata as Record<string, unknown> : {},
      createdAt: this.iso(row.created_at)!, updatedAt: this.iso(row.updated_at)!,
    }
  }

  private iso(value: unknown): string | null { return value ? new Date(value as string | number | Date).toISOString() : null }
}

export const txRecoveryService = new TxRecoveryService()
