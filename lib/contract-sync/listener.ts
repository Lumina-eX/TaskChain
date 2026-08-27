import Server from '@stellar/stellar-sdk'
import {
  CANONICAL_SOROBAN_EVENTS,
  normalizeSorobanEvent,
} from './types'
import type { SorobanContractEvent, SorobanEventPayload } from './types'

export type EventCallback = (payload: SorobanEventPayload) => void | Promise<void>
export type CheckpointCallback = (ledgerSequence: number) => void

export interface SorobanListenerOptions {
  rpcUrl: string
  networkPassphrase: string
  contractAddresses: string[]
  pollIntervalMs?: number
  maxLedgerOffset?: number
  /**
   * Ledger sequence to resume polling from (e.g. the last checkpoint
   * persisted before a restart). When omitted, polling starts from the
   * chain's current latest ledger, which means any events emitted while the
   * listener was down are permanently skipped.
   */
  initialLedger?: number
  /** Invoked after every successful poll with the new high-water-mark ledger. */
  onCheckpoint?: CheckpointCallback
}

export class SorobanEventListener {
  private server: InstanceType<typeof Server>
  private readonly networkPassphrase: string
  private readonly contractAddresses: string[]
  private readonly pollIntervalMs: number
  private readonly maxLedgerOffset: number
  private callback: EventCallback | null = null
  private readonly onCheckpoint: CheckpointCallback | null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastLedger = 0
  private running = false

  private readonly EVENT_NAMES = CANONICAL_SOROBAN_EVENTS

  constructor(options: SorobanListenerOptions) {
    this.server = new Server(options.rpcUrl)
    this.networkPassphrase = options.networkPassphrase
    this.contractAddresses = options.contractAddresses
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000
    this.maxLedgerOffset = options.maxLedgerOffset ?? 100
    this.onCheckpoint = options.onCheckpoint ?? null
    if (options.initialLedger && options.initialLedger > 0) {
      this.lastLedger = options.initialLedger
    }
  }

  setCallback(cb: EventCallback): void {
    this.callback = cb
  }

  setInitialLedger(ledgerSequence: number): void {
    if (!this.running && ledgerSequence > 0) {
      this.lastLedger = ledgerSequence
    }
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    if (this.lastLedger === 0) {
      try {
        const info = await this.server.getLatestLedger()
        this.lastLedger = info.sequence
      } catch {
        console.warn('[SorobanListener] Could not get latest ledger, starting from 0')
      }
    }

    this.timer = setInterval(() => this.poll(), this.pollIntervalMs)
    console.log(`[SorobanListener] Started polling ${this.contractAddresses.length} contract(s) every ${this.pollIntervalMs}ms (resuming from ledger ${this.lastLedger})`)
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get isRunning(): boolean {
    return this.running
  }

  private async poll(): Promise<void> {
    if (!this.callback) return

    try {
      const info = await this.server.getLatestLedger()
      const latestSeq = info.sequence

      if (this.lastLedger === 0) {
        this.lastLedger = latestSeq
        this.onCheckpoint?.(latestSeq)
        return
      }

      const startSeq = Math.max(this.lastLedger + 1, latestSeq - this.maxLedgerOffset)
      if (startSeq >= latestSeq) {
        this.lastLedger = latestSeq
        this.onCheckpoint?.(latestSeq)
        return
      }

      for (const contractAddress of this.contractAddresses) {
        await this.pollContractEvents(contractAddress, startSeq, latestSeq)
      }

      this.lastLedger = latestSeq
      this.onCheckpoint?.(latestSeq)
    } catch (err) {
      console.error('[SorobanListener] Poll error:', err)
    }
  }

  private async pollContractEvents(
    contractAddress: string,
    startSeq: number,
    endSeq: number
  ): Promise<void> {
    try {
      const events = await this.server.getEvents({
        startLedger: startSeq,
        filters: [{ type: 'contract', contractIds: [contractAddress] }],
        pagination: { limit: 100 },
      })

      for (const event of events.events) {
        const parsed = this.parseSorobanEvent(event, contractAddress)
        if (parsed) {
          await this.callback!(parsed)
        }
      }

      if (events.events.length > 0) {
        console.log(`[SorobanListener] Processed ${events.events.length} event(s) from ${contractAddress} (ledgers ${startSeq}-${endSeq})`)
      }
    } catch (err) {
      console.error(`[SorobanListener] Error polling contract ${contractAddress}:`, err)
    }
  }

  private parseSorobanEvent(event: any, contractAddress: string): SorobanEventPayload | null {
    try {
      const topic = event.topic
      if (!topic || topic.length === 0) return null

      const eventName = this.decodeEventName(topic[0])
      if (!eventName || !this.EVENT_NAMES.includes(eventName)) return null

      const rawData = event.value ?? event.data ?? []
      const data = Array.isArray(rawData) ? rawData : [rawData]
      const legacy = this.isLegacyTopic(topic[0])
      const milestoneId = this.extractMilestoneId(eventName, topic, data, legacy)
      const disputeId = this.extractDisputeId(eventName, topic, data, legacy)
      const amount = this.extractEventField(eventName, data, 'amount', legacy)
      const actor = this.extractActor(eventName, topic, data, legacy)
      const recipient = this.extractEventField(eventName, data, 'recipient', legacy)
      const support = this.extractBooleanField(data, 'support')
      const releaseToFreelancer = this.extractBooleanField(data, 'release_to_freelancer')

      return {
        event: eventName as SorobanContractEvent,
        contractAddress,
        ledgerSequence: event.ledger ?? event.ledgerSequence ?? 0,
        timestamp: event.ledgerClosedAt ? new Date(event.ledgerClosedAt).getTime() : Date.now(),
        txHash: event.txHash ?? event.id ?? 'unknown',
        data,
        milestoneId,
        disputeId,
        amount,
        actor,
        recipient,
        support,
        releaseToFreelancer,
      }
    } catch (err) {
      console.error('[SorobanListener] Failed to parse event:', err)
      return null
    }
  }

  private decodeEventName(topicPart: any): ReturnType<typeof normalizeSorobanEvent> {
    if (typeof topicPart === 'string') return normalizeSorobanEvent(topicPart)
    if (topicPart && typeof topicPart === 'object') {
      if (typeof topicPart.symbol === 'string') return normalizeSorobanEvent(topicPart.symbol)
      if (typeof topicPart.toString === 'function') return normalizeSorobanEvent(topicPart.toString())
    }
    return null
  }

  private isLegacyTopic(topicPart: any): boolean {
    if (typeof topicPart !== 'string') return false
    return ['init', 'fund', 'submit', 'approve', 'confirm', 'release', 'refund', 'dispute', 'resolve', 'expire']
      .includes(topicPart.toLowerCase())
  }

  private extractMilestoneId(
    eventName: string,
    topic: any[],
    data: any[],
    legacy: boolean
  ): number | undefined {
    if (['milestone_submitted', 'milestone_approved', 'milestone_confirmed', 'payment_released', 'dispute_raised', 'refund_issued', 'dispute_resolved', 'milestone_expired', 'dispute_created', 'vote_cast', 'stake_claimed'].includes(eventName)) {
      return this.extractNumber(topic[legacy ? 1 : 2]) ?? this.extractNumber(data[0])
    }
    return undefined
  }

  private extractDisputeId(
    eventName: string,
    topic: any[],
    data: any[],
    legacy: boolean
  ): number | undefined {
    if (!['dispute_created', 'vote_cast', 'stake_claimed'].includes(eventName)) return undefined
    return this.extractNumber(topic[legacy ? 1 : 2]) ?? this.extractNumber(data[0])
  }

  private extractActor(eventName: string, topic: any[], data: any[], legacy: boolean): string | undefined {
    if (legacy) return undefined
    return this.extractString(topic[3] ?? topic[2]) ?? this.extractEventField(eventName, data, 'actor', false)
  }

  private extractEventField(
    eventName: string,
    data: any[],
    field: string,
    legacy: boolean
  ): string | undefined {
    if (legacy) {
      if (field === 'amount' && ['escrow_funded'].includes(eventName)) return this.extractString(data[0])
      if (field === 'amount' && ['payment_released', 'refund_issued', 'milestone_expired'].includes(eventName)) return this.extractString(data[1])
      return undefined
    }

    const value = data[0]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return this.extractString(value[field] ?? value[this.toCamelCase(field)])
    }
    if (field === 'amount') return this.extractString(data[0])
    return undefined
  }

  private extractBooleanField(data: any[], field: string): boolean | undefined {
    const value = data[0]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value[field] ?? value[this.toCamelCase(field)]
    return typeof result === 'boolean' ? result : undefined
  }

  private extractNumber(value: any): number | undefined {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
    if (value?.toNumber) return value.toNumber()
    if (value?.toString) {
      const parsed = Number(value.toString())
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  private extractString(value: any): string | undefined {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'bigint') return String(value)
    if (value?.toString) return value.toString()
    return undefined
  }

  private toCamelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  }
}
