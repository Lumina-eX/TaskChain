/**
 * Escrow Lifecycle Service — Public API
 *
 * Import from this barrel in API routes and other consumers.
 * Internal modules (repository, blockchain adapter) are not re-exported
 * to keep the public surface minimal and prevent controllers from bypassing
 * the service layer.
 *
 * Usage:
 *   import { escrowService, EscrowError, escrowErrorToHttpStatus } from '@/lib/escrow'
 */

// Service singleton (primary entry point)
export { escrowService, EscrowService } from './service'
export { escrowTransactionHistoryService, EscrowTransactionHistoryService } from './history'

// All input/output types and interfaces
export type {
  // Enums
  ContractStatus,
  EscrowStatus,
  MilestoneStatus,
  DisputeStatus,
  DisputeRaisedBy,
  // Domain objects
  EscrowContract,
  EscrowMilestone,
  EscrowDispute,
  DisputeEvidence,
  // Service DTOs
  MilestoneInput,
  CreateEscrowInput,
  CreateEscrowResult,
  FundEscrowInput,
  FundEscrowResult,
  ReleaseFundsInput,
  ReleaseFundsResult,
  RefundEscrowInput,
  RefundEscrowResult,
  RaiseDisputeInput,
  RaiseDisputeResult,
  ResolveDisputeInput,
  ResolveDisputeResult,
  // Adapter / repository interfaces (for DI in tests)
  IEscrowBlockchainAdapter,
  IEscrowRepository,
} from './types'

export type {
  EscrowTransactionLog,
  EscrowTransactionLogPage,
  CreateEscrowTransactionLogInput,
  EscrowTransactionType,
  EscrowTransactionStatus,
} from './history'

// Error classes and HTTP status helper
export {
  EscrowError,
  EscrowInvalidStateError,
  EscrowValidationError,
  EscrowForbiddenError,
  EscrowContractNotFoundError,
  EscrowMilestoneNotFoundError,
  EscrowDisputeNotFoundError,
  EscrowAlreadyExistsError,
  EscrowDisputeAlreadyActiveError,
  EscrowBlockchainError,
  EscrowFundingVerificationError,
  escrowErrorToHttpStatus,
} from './errors'
