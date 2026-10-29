/**
 * Payment Ledger — Domain Types
 *
 * Type definitions for the payment ledger module.  The ledger reads from
 * the existing `escrow_transaction_logs` table, separating confirmed
 * entries from pending ones and computing balance aggregates.
 */

// ---------------------------------------------------------------------------
// Ledger entry types
// ---------------------------------------------------------------------------

export type LedgerEntryType = 'deposit' | 'milestone_release' | 'refund' | 'dispute'
export type LedgerEntryStatus = 'pending' | 'confirmed' | 'failed'

export interface LedgerEntry {
  id: string
  contractId: string
  projectId: string
  milestoneId: string | null
  disputeId: string | null
  actorUserId: string
  counterpartyUserId: string | null
  entryType: LedgerEntryType
  amount: string | null
  currency: string
  transactionHash: string | null
  status: LedgerEntryStatus
  description: string | null
  metadata: Record<string, unknown>
  createdAt: string
  // Joined fields for display
  projectTitle: string | null
  contractStatus: string | null
  actorWalletAddress: string | null
  counterpartyWalletAddress: string | null
}

// ---------------------------------------------------------------------------
// Balance summary
// ---------------------------------------------------------------------------

export interface LedgerBalance {
  contractId: string | null
  currency: string
  funded: string
  released: string
  refunded: string
  remaining: string
  pending: string
  entryCount: number
}

export interface LedgerSummary {
  totalFunded: string
  totalReleased: string
  totalRefunded: string
  totalRemaining: string
  totalPending: string
  confirmedEntries: number
  pendingEntries: number
  failedEntries: number
  currencies: Array<{
    currency: string
    funded: string
    released: string
    refunded: string
    remaining: string
    pending: string
  }>
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface LedgerPage {
  entries: LedgerEntry[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

export interface LedgerBalancePage {
  balances: LedgerBalance[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

// ---------------------------------------------------------------------------
// Query filters
// ---------------------------------------------------------------------------

export interface LedgerQueryFilters {
  contractId?: string | null
  userId?: string | null
  currency?: string | null
  entryType?: LedgerEntryType | null
  status?: LedgerEntryStatus | null
  dateFrom?: string | null
  dateTo?: string | null
  limit: number
  offset: number
}

export interface LedgerBalanceQueryFilters {
  contractId?: string | null
  userId?: string | null
  currency?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// CSV export result
// ---------------------------------------------------------------------------

export interface LedgerCsvExport {
  csv: string
  filename: string
  totalRows: number
}
