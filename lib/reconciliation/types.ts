/**
 * Reconciliation — Domain Types
 *
 * Type definitions for the reconciliation reports and discrepancies modules.
 */

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export type ReconciliationStatus = 'pending' | 'completed' | 'failed' | 'discrepancies_found'

export interface ReconciliationReport {
  id: string
  generatedBy: string | null
  status: ReconciliationStatus
  contractId: string | null
  token: string | null
  dateFrom: string | null
  dateTo: string | null
  totalFunded: string
  totalReleased: string
  totalRefunded: string
  totalPending: string
  discrepancyCount: number
  reportMetadata: Record<string, unknown>
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface ReconciliationReportPage {
  reports: ReconciliationReport[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

// ---------------------------------------------------------------------------
// Discrepancy types
// ---------------------------------------------------------------------------

export type DiscrepancyType =
  | 'amount_mismatch'
  | 'missing_blockchain_event'
  | 'missing_application_record'
  | 'duplicate_entry'
  | 'status_mismatch'
  | 'other'

export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical'

export type DiscrepancyStatus = 'open' | 'investigating' | 'resolved'

export interface ReconciliationDiscrepancy {
  id: string
  reportId: string
  contractId: string | null
  milestoneId: string | null
  transactionHash: string | null
  discrepancyType: DiscrepancyType
  severity: DiscrepancySeverity
  description: string
  expectedAmount: string | null
  actualAmount: string | null
  blockchainData: Record<string, unknown> | null
  applicationData: Record<string, unknown> | null
  status: DiscrepancyStatus
  resolvedBy: string | null
  resolutionNotes: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReconciliationDiscrepancyPage {
  discrepancies: ReconciliationDiscrepancy[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

// ---------------------------------------------------------------------------
// Report detail (report + its discrepancies)
// ---------------------------------------------------------------------------

export interface ReconciliationReportDetail {
  report: ReconciliationReport
  discrepancies: ReconciliationDiscrepancy[]
}

// ---------------------------------------------------------------------------
// Query filters
// ---------------------------------------------------------------------------

export interface ReconciliationQueryFilters {
  contractId?: string | null
  token?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  status?: ReconciliationStatus | null
  limit: number
  offset: number
}

export interface DiscrepancyQueryFilters {
  reportId?: string | null
  contractId?: string | null
  discrepancyType?: DiscrepancyType | null
  severity?: DiscrepancySeverity | null
  status?: DiscrepancyStatus | null
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Run reconciliation input
// ---------------------------------------------------------------------------

export interface RunReconciliationInput {
  walletAddress: string
  contractId?: string | null
  token?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export interface ReconciliationCsvExport {
  csv: string
  filename: string
  totalRows: number
}
