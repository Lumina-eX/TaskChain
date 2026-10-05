import { sql } from '@/lib/db'
import { SorobanEventListener } from './listener'
import { SyncQueue } from './queue'
import { mapEventToAction } from './mapper'
import { buildSyncDedupeKey } from './types'
import type { SorobanEventPayload, SyncStatus, SorobanContractEvent } from './types'

export interface SyncServiceOptions {
  rpcUrl?: string
  networkPassphrase?: string
  contractAddresses?: string[]
  pollIntervalMs?: number
  queueConcurrency?: number
  maxRetries?: number
}

export class ContractSyncService {
  private readonly listener: SorobanEventListener
  private readonly queue: SyncQueue
  private started = false

  constructor(options: SyncServiceOptions = {}) {
    this.queue = new SyncQueue({
      maxRetries: options.maxRetries,
      concurrency: options.queueConcurrency,
      onRetry: (item, error) => {
        this.updateSyncLog(item.id, {
          status: 'failed',
          errorMessage: error,
          retryCount: item.retryCount,
        }).catch((err) => console.error('[ContractSyncService] Failed to persist retry status:', err))
      },
      onDeadLetter: (item) => {
        this.updateSyncLog(item.id, {
          status: 'dead_letter',
          errorMessage: item.lastError ?? undefined,
          retryCount: item.retryCount,
        }).catch((err) => console.error('[ContractSyncService] Failed to persist dead-letter status:', err))
      },
    })

    this.listener = new SorobanEventListener({
      rpcUrl: options.rpcUrl ?? process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
      networkPassphrase: options.networkPassphrase ?? process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
      contractAddresses: options.contractAddresses ?? [],
      pollIntervalMs: options.pollIntervalMs,
      onCheckpoint: (ledgerSequence) => {
        this.persistCheckpoint(ledgerSequence).catch((err) =>
          console.error('[ContractSyncService] Failed to persist sync checkpoint:', err)
        )
      },
    })

    this.listener.setCallback((payload) => this.onEvent(payload))
    this.queue.setHandler((item) => this.processSync(item))
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const checkpoint = await this.loadCheckpoint()
    if (checkpoint != null) {
      this.listener.setInitialLedger(checkpoint)
    }

    this.queue.start()
    await this.listener.start()

    console.log('[ContractSyncService] Started — listening for Soroban contract events')
  }

  stop(): void {
    this.listener.stop()
    this.queue.stop()
    this.started = false
    console.log('[ContractSyncService] Stopped')
  }

  getQueue(): SyncQueue {
    return this.queue
  }

  getListener(): SorobanEventListener {
    return this.listener
  }

  /** Applies one Soroban event through the existing sync path. */
  async applyEvent(payload: SorobanEventPayload): Promise<void> {
    await this.processSync({ id: buildSyncDedupeKey(payload), payload })
  }

  private async onEvent(payload: SorobanEventPayload): Promise<void> {
    const dedupeKey = buildSyncDedupeKey(payload)

    // Guards against reprocessing an event that was already synced in a
    // previous process lifetime (the in-memory queue only dedupes within a
    // single run — this check survives restarts).
    if (await this.isAlreadySynced(dedupeKey)) {
      console.log(`[ContractSyncService] Skipping already-synced event (dedupe_key=${dedupeKey})`)
      return
    }

    const id = this.queue.enqueue(payload)
    console.log(`[ContractSyncService] Enqueued event: ${payload.event} @ ${payload.contractAddress} (id=${id})`)

    await this.createSyncLog({
      dedupeKey,
      eventType: payload.event,
      txHash: payload.txHash,
      ledgerSequence: payload.ledgerSequence,
      status: 'pending',
      rawPayload: payload as unknown as Record<string, unknown>,
    })
  }

  private async isAlreadySynced(dedupeKey: string): Promise<boolean> {
    const rows = (await sql`
      SELECT 1 FROM contract_sync_log
       WHERE dedupe_key = ${dedupeKey}
         AND status = 'success'
       LIMIT 1
    `) as unknown[]
    return rows.length > 0
  }

  private async loadCheckpoint(): Promise<number | null> {
    const rows = (await sql`
      SELECT last_ledger FROM contract_sync_checkpoint WHERE id = 1
    `) as { last_ledger: number | string }[]
    if (rows.length === 0) return null
    return Number(rows[0].last_ledger)
  }

  private async persistCheckpoint(ledgerSequence: number): Promise<void> {
    await sql`
      INSERT INTO contract_sync_checkpoint (id, last_ledger)
      VALUES (1, ${ledgerSequence})
      ON CONFLICT (id) DO UPDATE
        SET last_ledger = ${ledgerSequence},
            updated_at = NOW()
    `
  }

  private async processSync(item: { id: string; payload: SorobanEventPayload }): Promise<void> {
    const { payload } = item
    const action = mapEventToAction(payload.event, payload)

    if (action.kind === 'noop') {
      await this.updateSyncLog(item.id, { status: 'success' })
      return
    }

    const contractId = await this.resolveContractId(payload.contractAddress)
    if (!contractId) {
      throw new Error(`No contract found for address ${payload.contractAddress}`)
    }

    if (action.kind === 'update_contract' || action.kind === 'update_both') {
      if (action.contractUpdate) {
        await this.applyContractUpdate(contractId, action.contractUpdate as Record<string, string | null | undefined>)
      }
    }

    if (action.kind === 'update_milestone' || action.kind === 'update_both') {
      if (action.milestoneUpdate && action.milestoneId != null) {
        const milestoneDbId = await this.resolveMilestoneDbId(contractId, action.milestoneId)
        if (milestoneDbId) {
          await this.applyMilestoneUpdate(milestoneDbId, action.milestoneUpdate as unknown as Record<string, string | null | undefined>)
        }
      }
    }

    await this.updateSyncLog(item.id, { status: 'success' })

    if (payload.event === 'release') {
      await this.checkContractCompletion(contractId)
    }
  }

  private async resolveContractId(contractAddress: string): Promise<string | null> {
    const rows = (await sql`
      SELECT id FROM contracts WHERE escrow_address = ${contractAddress} LIMIT 1
    `) as { id: string }[]
    return rows[0]?.id ?? null
  }

  private async resolveMilestoneDbId(contractId: string, onChainMilestoneId: number): Promise<string | null> {
    const rows = (await sql`
      SELECT id FROM milestones
       WHERE contract_id = ${contractId}::uuid
       ORDER BY sort_order ASC, created_at ASC
       OFFSET ${onChainMilestoneId}
       LIMIT 1
    `) as { id: string }[]
    return rows[0]?.id ?? null
  }

  private async applyContractUpdate(
    contractId: string,
    update: Record<string, string | null | undefined>
  ): Promise<void> {
    const sets: string[] = ['updated_at = NOW()']

    for (const [field, value] of Object.entries(update)) {
      if (value === undefined) continue
      const dbField = this.fieldToDbColumn(field)
      if (value === null) {
        sets.push(`${dbField} = NULL`)
      } else {
        const escaped = value.replace(/'/g, "''")
        sets.push(`${dbField} = '${escaped}'`)
      }
    }

    const query = `
      UPDATE contracts
         SET ${sets.join(', ')}
       WHERE id = '${contractId}'::uuid
    `
    await sql.unsafe(query)
  }

  private async applyMilestoneUpdate(
    milestoneId: string,
    update: Record<string, string | null | undefined>
  ): Promise<void> {
    const sets: string[] = ['updated_at = NOW()']

    for (const [field, value] of Object.entries(update)) {
      if (value === undefined) continue
      const dbField = this.fieldToDbColumnMilestone(field)
      if (value === null) {
        sets.push(`${dbField} = NULL`)
      } else {
        const escaped = value.replace(/'/g, "''")
        sets.push(`${dbField} = '${escaped}'`)
      }
    }

    const query = `
      UPDATE milestones
         SET ${sets.join(', ')}
       WHERE id = '${milestoneId}'::uuid
    `
    await sql.unsafe(query)
  }

  private async checkContractCompletion(contractId: string): Promise<void> {
    const rows = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
        FROM milestones
       WHERE contract_id = ${contractId}::uuid
    `) as { total: number; paid: number }[]
    const { total, paid } = rows[0]
    if (total > 0 && total === paid) {
      await sql`
        UPDATE contracts
           SET escrow_status = 'fully_released',
               status = 'completed',
               completed_at = NOW(),
               updated_at = NOW()
         WHERE id = ${contractId}::uuid
           AND status != 'completed'
      `
    }
  }

  private async createSyncLog(params: {
    dedupeKey: string
    eventType: SorobanContractEvent
    txHash: string
    ledgerSequence: number
    status: SyncStatus
    rawPayload: Record<string, unknown>
  }): Promise<void> {
    await sql`
      INSERT INTO contract_sync_log (
        dedupe_key,
        event_type,
        tx_hash,
        ledger_sequence,
        status,
        raw_payload
      )
      VALUES (
        ${params.dedupeKey},
        ${params.eventType}::contract_sync_event_type,
        ${params.txHash},
        ${params.ledgerSequence},
        ${params.status}::sync_status,
        ${JSON.stringify(params.rawPayload)}::jsonb
      )
      ON CONFLICT (dedupe_key) DO NOTHING
    `
  }

  // Note: `itemId`/`dedupeKey` are the same value — the queue's item id is
  // built from `buildSyncDedupeKey`, which is also stored as the audit row's
  // dedupe_key, so both sides can be reconciled without any lookup.
  private async updateSyncLog(
    dedupeKey: string,
    params: { status: SyncStatus; errorMessage?: string; retryCount?: number }
  ): Promise<void> {
    await sql`
      UPDATE contract_sync_log
         SET status = ${params.status}::sync_status,
             error_message = COALESCE(${params.errorMessage ?? null}, error_message),
             retry_count = COALESCE(${params.retryCount ?? null}, retry_count),
             updated_at = NOW()
       WHERE dedupe_key = ${dedupeKey}
    `
  }

  private fieldToDbColumn(field: string): string {
    const map: Record<string, string> = {
      escrowStatus: 'escrow_status',
      contractStatus: 'status',
      fundedAt: 'funded_at',
      fundingTxHash: 'funding_tx_hash',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      cancelledAt: 'cancelled_at',
      cancelledReason: 'cancellation_reason',
      activeDisputeId: 'active_dispute_id',
    }
    return map[field] ?? field
  }

  private fieldToDbColumnMilestone(field: string): string {
    const map: Record<string, string> = {
      status: 'status',
      submittedAt: 'submitted_at',
      approvedAt: 'approved_at',
      paidAt: 'paid_at',
      releaseTxHash: 'release_tx_hash',
      rejectionReason: 'rejection_reason',
    }
    return map[field] ?? field
  }
}
