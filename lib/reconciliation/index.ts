/**
 * Reconciliation — Public API
 *
 * Import from this barrel in API routes and other consumers.
 */

export { reconciliationService, ReconciliationService } from './service'

export type {
  ReconciliationStatus,
  ReconciliationReport,
  ReconciliationReportPage,
  ReconciliationReportDetail,
  ReconciliationDiscrepancy,
  ReconciliationDiscrepancyPage,
  DiscrepancyType,
  DiscrepancySeverity,
  DiscrepancyStatus,
  ReconciliationQueryFilters,
  DiscrepancyQueryFilters,
  RunReconciliationInput,
  ReconciliationCsvExport,
} from './types'

export {
  ReconciliationError,
  ReconciliationValidationError,
  ReconciliationForbiddenError,
  ReconciliationNotFoundError,
  ReconciliationExecutionError,
  reconciliationErrorToHttpStatus,
} from './errors'
