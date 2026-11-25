/**
 * Dispute Resolution Workflow — Public API
 *
 * Controllers import the singleton service and error mapper from here.
 * Repositories and blockchain adapters are internal so route handlers cannot
 * bypass authorization or transaction tracking.
 */

export {
  disputeWorkflowService,
  DisputeWorkflowService,
  evidenceFingerprint,
} from './service'
export {
  DisputeError,
  DisputeValidationError,
  DisputeNotFoundError,
  DisputeForbiddenError,
  DisputeConflictError,
  DisputeIneligibleError,
  DisputeChainError,
  disputeErrorToStatus,
} from './types'
export type {
  CreateDisputeInput,
  CreateDisputeResult,
  SubmitEvidenceInput,
  SubmitEvidenceResult,
  GetDisputeResult,
  ResolveDisputeInput,
  ResolveDisputeResult,
  DisputeOutcome,
  DisputeRecord,
  EvidenceRecord,
  ResolutionAttemptRecord,
  AuditEventRecord,
} from './types'
export {
  parseCreateDisputeInput,
  parseSubmitEvidenceInput,
  parseResolveDisputeInput,
} from './validation'
export { isUuid } from './authorization'
export type { DisputeRepository, ConfirmResolutionRow } from './repository'
export type { DisputeChainGateway, ChainResolutionSubmission } from './blockchain'
