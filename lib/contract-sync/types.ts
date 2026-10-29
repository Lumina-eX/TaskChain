/**
 * Canonical event names emitted by the Soroban contracts.
 *
 * These values intentionally use snake_case because they are the stable wire
 * representation used by Soroban symbols, the event indexer, and Postgres.
 * The PascalCcake names in the contract source become these symbols through
 * Soroban's contract-event macro.
 */
export type CanonicalSorobanContractEvent =
  | 'escrow_created'
  | 'escrow_funded'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_confirmed'
  | 'payment_released'
  | 'dispute_raised'
  | 'refund_issued'
  | 'dispute_resolved'
  | 'milestone_expired'
  | 'deadline_set'
  | 'deadline_expired'
  | 'deadline_extended'
  | 'dispute_created'
  | 'vote_cast'
  | 'stake_claimed'

/** Legacy topics emitted by contracts deployed before event standardization. */
export type LegacySorobanContractEvent =
  | 'init'
  | 'fund'
  | 'submit'
  | 'approve'
  | 'confirm'
  | 'release'
  | 'refund'
  | 'dispute'
  | 'resolve'
  | 'expire'

export type SorobanContractEvent = CanonicalSorobanContractEvent | LegacySorobanContractEvent

export const CANONICAL_SOROBAN_EVENTS: readonly CanonicalSorobanContractEvent[] = [
  'escrow_created',
  'escrow_funded',
  'milestone_submitted',
  'milestone_approved',
  'milestone_confirmed',
  'payment_released',
  'dispute_raised',
  'refund_issued',
  'dispute_resolved',
  'milestone_expired',
  'deadline_set',
  'deadline_expired',
  'deadline_extended',
  'dispute_created',
  'vote_cast',
  'stake_claimed',
]

const EVENT_ALIASES: Record<string, CanonicalSorobanContractEvent> = {
  // Legacy topics.
  init: 'escrow_created',
  fund: 'escrow_funded',
  submit: 'milestone_submitted',
  approve: 'milestone_approved',
  confirm: 'milestone_confirmed',
  release: 'payment_released',
  refund: 'refund_issued',
  dispute: 'dispute_raised',
  resolve: 'dispute_resolved',
  expire: 'milestone_expired',
  // Contract-event struct names, as returned by Soroban RPC symbols.
  escrowcreated: 'escrow_created',
  escrowfunded: 'escrow_funded',
  milestonesubmitted: 'milestone_submitted',
  milestoneapproved: 'milestone_approved',
  milestoneconfirmed: 'milestone_confirmed',
  paymentreleased: 'payment_released',
  disputeraised: 'dispute_raised',
  refundissued: 'refund_issued',
  disputeresolved: 'dispute_resolved',
  milestoneexpired: 'milestone_expired',
  deadlineset: 'deadline_set',
  deadlineexpired: 'deadline_expired',
  deadlineextended: 'deadline_extended',
  disputecreated: 'dispute_created',
  votecast: 'vote_cast',
  stakeclaimed: 'stake_claimed',
}

/** Convert a canonical, legacy, or PascalCase topic to the wire event name. */
export function normalizeSorobanEvent(topic: string): CanonicalSorobanContractEvent | null {
  const normalized = topic.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase()
  return EVENT_ALIASES[normalized] ?? EVENT_ALIASES[normalized.replace(/_/g, '')] ?? null
}

export type SyncStatus = 'pending' | 'processing' | 'success' | 'failed' | 'dead_letter'

export interface SorobanEventPayload {
  event: SorobanContractEvent
  contractAddress: string
  ledgerSequence: number
  timestamp: number
  txHash: string
  data: unknown[]
  milestoneId?: number
  disputeId?: number
  amount?: string
  deadline?: number
  wasExpired?: boolean
  actor?: string
  recipient?: string
  support?: boolean
  releaseToFreelancer?: boolean
}

export interface ContractSyncLog {
  id: string
  contractId: string | null
  milestoneId: string | null
  eventType: SorobanContractEvent
  txHash: string | null
  ledgerSequence: number | null
  status: SyncStatus
  errorMessage: string | null
  retryCount: number
  rawPayload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SyncQueueItem {
  id: string
  payload: SorobanEventPayload
  retryCount: number
  maxRetries: number
  lastError: string | null
  nextRetryAt: number
  status: SyncStatus
}

export function getDefaultMaxRetries(): number {
  return 5
}

export function getBackoffDelay(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 60_000)
}

/**
 * Stable identity for a single on-chain event, shared by the in-memory queue
 * and the `contract_sync_log` audit table. Used to guarantee at-most-once
 * processing even across process restarts (the queue alone only dedupes
 * while an item is in memory).
 */
export function buildSyncDedupeKey(
  payload: Pick<SorobanEventPayload, 'txHash' | 'event' | 'milestoneId' | 'disputeId'>
): string {
  return `${payload.txHash}:${payload.event}:${payload.milestoneId ?? payload.disputeId ?? 0}`
}

export const ESCROW_EVENT_TOPIC_PREFIX = 'escrow_event'

/**
 * File metadata management for contract workspaces.
 *
 * Files are associated with a contract and, optionally, a specific milestone.
 * Only metadata is persisted here; the binary lives in private object storage
 * and is served through short-lived signed URLs.
 */
export type FileUploadStatus = 'pending' | 'stored' | 'failed' | 'deleted'

export interface ContractFileMetadata {
  id: string
  contractId: string
  milestoneId: string | null
  uploadedBy: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** Monotonically increasing version for a given logical file. */
  version: number
  /** Groups all versions of the same logical file together. */
  fileGroupId: string
  /** Private storage key; never exposed to clients. */
  storageKey: string
  checksum: string | null
  status: FileUploadStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type FileAuditAction = 'upload' | 'download' | 'update' | 'delete'

export interface FileAuditRecord {
  id: string
  fileId: string
  contractId: string
  actorId: string
  action: FileAuditAction
  version: number
  createdAt: string
  metadata: Record<string, unknown>
}

/** Supported MIME types for contract workspace uploads. */
export const SUPPORTED_FILE_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
]

/** Maximum allowed upload size in bytes (25 MiB). */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

/** Lifetime of a signed download URL in seconds. */
export const SIGNED_URL_TTL_SECONDS = 300

export function isSupportedFileType(mimeType: string): boolean {
  return SUPPORTED_FILE_MIME_TYPES.includes(mimeType.toLowerCase())
}

export function isWithinFileSizeLimit(sizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES
}
