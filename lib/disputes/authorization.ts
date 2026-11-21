/**
 * Dispute Resolution Workflow — Authorization
 *
 * Pure, dependency-free authorization rules. Route handlers and the service
 * layer must never trust a client supplied role, contract owner or arbitrator
 * flag: the actor is resolved from the access token's wallet address and the
 * contract is loaded from the database, then these rules decide.
 *
 * Roles that may act on a dispute:
 *   • participant          — contract client or freelancer (create / view / evidence)
 *   • arbiter              — wallet matching contracts.arbiter_address (all actions)
 *   • designated_resolver  — contracts.designated_resolver_id (all actions)
 *   • admin                — platform administrator (all actions)
 *
 * Resolution additionally requires the on-chain arbiter signature. These
 * checks never replace the smart contract's own `arbiter.require_auth()`;
 * they only decide whether the backend is willing to submit the request.
 */

import type { ContractRecord, DisputeActor, DisputeRecord } from './types'
import { DisputeForbiddenError } from './types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTEGER_ID_RE = /^\d{1,19}$/

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Legacy (job-scoped) routes use integer ids — used to keep them working. */
export function isIntegerId(value: string): boolean {
  return INTEGER_ID_RE.test(value)
}

export type DisputeActorKind =
  | 'admin'
  | 'arbiter'
  | 'designated_resolver'
  | 'participant'
  | 'unrelated'

export function classifyActor(
  actor: DisputeActor,
  contract: ContractRecord
): DisputeActorKind {
  if (actor.role === 'admin') return 'admin'

  const wallet = actor.walletAddress?.trim().toLowerCase()
  const arbiter = contract.arbiterAddress?.trim().toLowerCase()
  if (wallet && arbiter && wallet === arbiter) return 'arbiter'

  if (contract.designatedResolverId && actor.userId === contract.designatedResolverId) {
    return 'designated_resolver'
  }

  if (actor.userId === contract.clientId || actor.userId === contract.freelancerId) {
    return 'participant'
  }

  return 'unrelated'
}

export function isContractParticipant(
  actor: DisputeActor,
  contract: ContractRecord
): boolean {
  return (
    actor.userId === contract.clientId || actor.userId === contract.freelancerId
  )
}

const CREATE_ALLOWED: DisputeActorKind[] = [
  'admin',
  'arbiter',
  'designated_resolver',
  'participant',
]
const VIEW_ALLOWED: DisputeActorKind[] = [
  'admin',
  'arbiter',
  'designated_resolver',
  'participant',
]
const RESOLVE_ALLOWED: DisputeActorKind[] = [
  'admin',
  'arbiter',
  'designated_resolver',
]

export function canCreateDispute(actor: DisputeActor, contract: ContractRecord): boolean {
  return CREATE_ALLOWED.includes(classifyActor(actor, contract))
}

export function canViewDispute(
  actor: DisputeActor,
  contract: ContractRecord,
  dispute: DisputeRecord
): boolean {
  if (canCreateDispute(actor, contract)) return true
  // A user who raised the dispute (e.g. an admin whose role changed) may
  // still read their own record.
  return dispute.raisedByUserId === actor.userId
}

export function canSubmitEvidence(
  actor: DisputeActor,
  contract: ContractRecord
): boolean {
  return VIEW_ALLOWED.includes(classifyActor(actor, contract))
}

export function canResolveDispute(
  actor: DisputeActor,
  contract: ContractRecord
): boolean {
  return RESOLVE_ALLOWED.includes(classifyActor(actor, contract))
}

export function assertCanCreateDispute(
  actor: DisputeActor,
  contract: ContractRecord
): void {
  if (!canCreateDispute(actor, contract)) {
    throw new DisputeForbiddenError(
      'Only contract participants, the arbitrator or a designated decision-maker can open a dispute'
    )
  }
}

export function assertCanViewDispute(
  actor: DisputeActor,
  contract: ContractRecord,
  dispute: DisputeRecord
): void {
  if (!canViewDispute(actor, contract, dispute)) {
    throw new DisputeForbiddenError(
      'Only contract participants, the arbitrator or a designated decision-maker can view this dispute'
    )
  }
}

export function assertCanSubmitEvidence(
  actor: DisputeActor,
  contract: ContractRecord
): void {
  if (!canSubmitEvidence(actor, contract)) {
    throw new DisputeForbiddenError(
      'Only contract participants, the arbitrator or a designated decision-maker can submit evidence'
    )
  }
}

export function assertCanResolveDispute(
  actor: DisputeActor,
  contract: ContractRecord
): void {
  if (!canResolveDispute(actor, contract)) {
    throw new DisputeForbiddenError(
      'Only the arbitrator, a designated decision-maker or an admin can resolve this dispute'
    )
  }
}

/**
 * Resolution outcomes are constrained by the escrow contract:
 * `resolve_dispute(milestone_id, release_to_freelancer)` is binary, so a split
 * resolution cannot be expressed on-chain. Refuse it rather than silently
 * mis-allocate funds.
 */
export function assertOutcomeSupportedOnChain(
  outcome: string,
  contract: ContractRecord
): void {
  if (!contract.escrowAddress) return
  if (outcome === 'resolved_split') {
    throw new DisputeForbiddenError(
      'Split resolutions are not supported by the escrow contract; resolve fully to the client or freelancer'
    )
  }
}
