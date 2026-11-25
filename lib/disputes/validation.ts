/**
 * Dispute Resolution Workflow — Input validation
 *
 * Request bodies are untrusted. Every field is validated here before the
 * service touches the database or the blockchain. Validation failures surface
 * as DisputeValidationError (HTTP 422) with a field-level `details` payload.
 */

import {
  DISPUTE_OUTCOMES,
  EVIDENCE_TYPES,
  DisputeValidationError,
  type DisputeOutcome,
  type EvidenceReferenceInput,
  type EvidenceType,
} from './types'

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/
const MIN_REASON_LENGTH = 10
const MAX_REASON_LENGTH = 5000
const MAX_REFERENCE_LENGTH = 2048
const MAX_METADATA_BYTES = 16 * 1024

export interface ParsedCreateDispute {
  reason: string
  desiredOutcome?: string
  milestoneId?: string
  evidence: EvidenceReferenceInput[]
  idempotencyKey: string
}

export interface ParsedSubmitEvidence {
  references: EvidenceReferenceInput[]
  description?: string
  idempotencyKey: string
}

export interface ParsedResolveDispute {
  outcome: DisputeOutcome
  reasons: string
  metadata: Record<string, unknown>
  clientRefundAmount?: string
  freelancerPayoutAmount?: string
  idempotencyKey: string
  retryAttemptId?: string
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DisputeValidationError('Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function requiredString(
  value: unknown,
  field: string,
  { min = 1, max = MAX_REASON_LENGTH }: { min?: number; max?: number } = {}
): string {
  if (typeof value !== 'string') {
    throw new DisputeValidationError(`${field} is required and must be a string`, {
      field,
    })
  }
  const trimmed = value.trim()
  if (trimmed.length < min) {
    throw new DisputeValidationError(
      `${field} must be at least ${min} characters long`,
      { field }
    )
  }
  if (trimmed.length > max) {
    throw new DisputeValidationError(
      `${field} must be at most ${max} characters long`,
      { field }
    )
  }
  return trimmed
}

function optionalString(value: unknown, field: string, max = MAX_REASON_LENGTH) {
  if (value === undefined || value === null || value === '') return undefined
  return requiredString(value, field, { max })
}

/** Idempotency keys come from the `Idempotency-Key` header or the body. */
export function parseIdempotencyKey(
  headerValue: string | null | undefined,
  bodyValue: unknown
): string {
  const candidate =
    typeof headerValue === 'string' && headerValue.trim()
      ? headerValue.trim()
      : typeof bodyValue === 'string'
        ? bodyValue.trim()
        : ''

  if (!candidate) {
    throw new DisputeValidationError(
      'An Idempotency-Key header (or idempotencyKey body field) is required',
      { field: 'idempotencyKey' }
    )
  }
  if (!IDEMPOTENCY_KEY_RE.test(candidate)) {
    throw new DisputeValidationError(
      'Idempotency-Key must be 8-128 characters of letters, digits, ".", ":", "_" or "-"',
      { field: 'idempotencyKey' }
    )
  }
  return candidate
}

function parseEvidenceReference(value: unknown, index: number): EvidenceReferenceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DisputeValidationError(`evidence[${index}] must be an object`, {
      field: `evidence[${index}]`,
    })
  }
  const entry = value as Record<string, unknown>
  const type = entry.type ?? 'url'
  if (typeof type !== 'string' || !EVIDENCE_TYPES.includes(type as EvidenceType)) {
    throw new DisputeValidationError(
      `evidence[${index}].type must be one of: ${EVIDENCE_TYPES.join(', ')}`,
      { field: `evidence[${index}].type` }
    )
  }
  const url = requiredString(entry.url, `evidence[${index}].url`, {
    max: MAX_REFERENCE_LENGTH,
  })
  if (/[\u0000-\u001f]/.test(url)) {
    throw new DisputeValidationError(`evidence[${index}].url contains control characters`, {
      field: `evidence[${index}].url`,
    })
  }
  return {
    type: type as EvidenceType,
    url,
    label: optionalString(entry.label, `evidence[${index}].label`, 200),
    description: optionalString(entry.description, `evidence[${index}].description`, 2000),
  }
}

function parseEvidenceList(value: unknown, field = 'evidence'): EvidenceReferenceInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new DisputeValidationError(`${field} must be an array`, { field })
  }
  if (value.length > 20) {
    throw new DisputeValidationError(`${field} may contain at most 20 references`, {
      field,
    })
  }
  return value.map((entry, index) => parseEvidenceReference(entry, index))
}

export function parseCreateDisputeInput(
  raw: unknown,
  headerKey?: string | null
): ParsedCreateDispute {
  const body = asObject(raw)
  return {
    reason: requiredString(body.reason, 'reason', { min: MIN_REASON_LENGTH }),
    desiredOutcome: optionalString(body.desiredOutcome, 'desiredOutcome', 2000),
    milestoneId: optionalString(body.milestoneId, 'milestoneId', 100),
    evidence: parseEvidenceList(body.evidence),
    idempotencyKey: parseIdempotencyKey(headerKey, body.idempotencyKey),
  }
}

export function parseSubmitEvidenceInput(
  raw: unknown,
  headerKey?: string | null
): ParsedSubmitEvidence {
  const body = asObject(raw)
  const references = parseEvidenceList(body.references ?? body.evidence, 'references')
  const description = optionalString(body.description, 'description', 2000)

  if (references.length === 0 && !description) {
    throw new DisputeValidationError(
      'Provide at least one evidence reference or a description',
      { field: 'references' }
    )
  }

  return {
    references,
    description,
    idempotencyKey: parseIdempotencyKey(headerKey, body.idempotencyKey),
  }
}

export function parseResolveDisputeInput(
  raw: unknown,
  headerKey?: string | null
): ParsedResolveDispute {
  const body = asObject(raw)
  const outcome = body.outcome
  if (typeof outcome !== 'string' || !DISPUTE_OUTCOMES.includes(outcome as DisputeOutcome)) {
    throw new DisputeValidationError(
      `outcome must be one of: ${DISPUTE_OUTCOMES.join(', ')}`,
      { field: 'outcome' }
    )
  }

  const metadata = body.metadata
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new DisputeValidationError('metadata must be a JSON object', {
        field: 'metadata',
      })
    }
    if (Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA_BYTES) {
      throw new DisputeValidationError('metadata exceeds the 16 KB limit', {
        field: 'metadata',
      })
    }
  }

  return {
    outcome: outcome as DisputeOutcome,
    reasons: requiredString(body.reasons ?? body.resolutionNotes, 'reasons', {
      min: MIN_REASON_LENGTH,
    }),
    metadata: (metadata as Record<string, unknown>) ?? {},
    clientRefundAmount: optionalString(body.clientRefundAmount, 'clientRefundAmount', 32),
    freelancerPayoutAmount: optionalString(
      body.freelancerPayoutAmount,
      'freelancerPayoutAmount',
      32
    ),
    idempotencyKey: parseIdempotencyKey(headerKey, body.idempotencyKey),
    retryAttemptId: optionalString(body.retryAttemptId, 'retryAttemptId', 100),
  }
}

/** Amounts are NUMERIC(18,6) strings; compare exactly in base units. */
export function toBaseUnits(value: string, field: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value.trim())) {
    throw new DisputeValidationError(
      `${field} must be a positive decimal string with at most 6 decimal places`,
      { field }
    )
  }
  const [whole, fraction = ''] = value.trim().split('.')
  return BigInt(whole) * BigInt(1_000_000) + BigInt((fraction + '000000').slice(0, 6))
}

export function assertSplitAmounts(
  outcome: DisputeOutcome,
  contractTotal: string,
  clientRefundAmount?: string,
  freelancerPayoutAmount?: string
): void {
  if (outcome !== 'resolved_split') return

  if (!clientRefundAmount || !freelancerPayoutAmount) {
    throw new DisputeValidationError(
      'clientRefundAmount and freelancerPayoutAmount are required for a split resolution',
      { field: 'clientRefundAmount' }
    )
  }

  const total = toBaseUnits(contractTotal, 'contractTotal')
  const refund = toBaseUnits(clientRefundAmount, 'clientRefundAmount')
  const payout = toBaseUnits(freelancerPayoutAmount, 'freelancerPayoutAmount')

  if (refund + payout !== total) {
    throw new DisputeValidationError(
      'Split amounts must add up to the contract total',
      { field: 'clientRefundAmount' }
    )
  }
}
