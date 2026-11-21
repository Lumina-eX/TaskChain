import { describe, it, expect, beforeEach, vi } from 'vitest'

import { DisputeWorkflowService, evidenceFingerprint } from '@/lib/disputes/service'
import {
  DisputeChainError,
  DisputeConflictError,
  DisputeError,
  DisputeForbiddenError,
  DisputeIneligibleError,
  DisputeValidationError,
  type ContractRecord,
  type DisputeActor,
  type ResolutionAttemptRecord,
} from '@/lib/disputes/types'
import type {
  ChainResolutionRequest,
  ChainResolutionSubmission,
  DisputeChainGateway,
} from '@/lib/disputes/blockchain'
import { FakeDisputeRepository } from './fakeRepository'

const CLIENT: DisputeActor = {
  userId: 'user-client',
  walletAddress: 'GCLIENTWALLET',
  role: 'client',
}
const FREELANCER: DisputeActor = {
  userId: 'user-freelancer',
  walletAddress: 'GFREELANCERWALLET',
  role: 'freelancer',
}
const OUTSIDER: DisputeActor = {
  userId: 'user-outsider',
  walletAddress: 'GOUTSIDERWALLET',
  role: 'freelancer',
}
const ARBITER: DisputeActor = {
  userId: 'user-arbiter',
  walletAddress: 'GARBITERWALLET',
  role: 'client',
}
const DESIGNATED: DisputeActor = {
  userId: 'user-designated',
  walletAddress: 'GDESIGNATEDWALLET',
  role: 'freelancer',
}
const ADMIN: DisputeActor = {
  userId: 'user-admin',
  walletAddress: 'GADMINWALLET',
  role: 'admin',
}

class FakeChain implements DisputeChainGateway {
  submissions: ChainResolutionRequest[] = []
  verified: string[] = []
  submission: ChainResolutionSubmission = {
    txHash: 'tx-hash-1',
    state: 'confirmed',
    ledger: 42,
  }
  submissionError: Error | null = null
  verification: 'confirmed' | 'failed' | 'pending' | 'unknown' = 'pending'

  async submitResolution(request: ChainResolutionRequest): Promise<ChainResolutionSubmission> {
    this.submissions.push(request)
    if (this.submissionError) throw this.submissionError
    return this.submission
  }

  async verifyResolution(txHash: string): Promise<'confirmed' | 'failed' | 'pending' | 'unknown'> {
    this.verified.push(txHash)
    return this.verification
  }
}

interface Harness {
  repo: FakeDisputeRepository
  chain: FakeChain
  service: DisputeWorkflowService
  contract: ContractRecord
}

function setup(overrides: Partial<ContractRecord> = {}): Harness {
  const repo = new FakeDisputeRepository()
  const chain = new FakeChain()

  repo.seedUser(CLIENT)
  repo.seedUser(FREELANCER)
  repo.seedUser(OUTSIDER)
  repo.seedUser(ARBITER)
  repo.seedUser(DESIGNATED)
  repo.seedUser(ADMIN)

  const contract: ContractRecord = {
    id: 'contract-1',
    clientId: CLIENT.userId,
    freelancerId: FREELANCER.userId,
    status: 'active',
    escrowStatus: 'funded',
    escrowAddress: 'CESCROWCONTRACT',
    arbiterAddress: ARBITER.walletAddress,
    designatedResolverId: DESIGNATED.userId,
    activeDisputeId: null,
    totalAmount: '1000.000000',
    currency: 'USDC',
    ...overrides,
  }
  repo.seedContract(contract)
  repo.seedMilestone({
    id: 'milestone-1',
    contractId: contract.id,
    status: 'submitted',
    amount: '1000.000000',
  })

  return {
    repo,
    chain,
    contract,
    service: new DisputeWorkflowService(repo, chain),
  }
}

function creationInput(overrides: Record<string, unknown> = {}) {
  return {
    contractId: 'contract-1',
    actorWalletAddress: CLIENT.walletAddress,
    reason: 'Deliverable does not match the agreed specification',
    milestoneId: 'milestone-1',
    idempotencyKey: 'create-key-0001',
    ...overrides,
  }
}

function resolutionInput(overrides: Record<string, unknown> = {}) {
  return {
    disputeId: '',
    actorWalletAddress: ARBITER.walletAddress,
    outcome: 'resolved_freelancer' as const,
    reasons: 'Milestone evidence proves the freelancer delivered as specified',
    metadata: { reviewedEvidence: true },
    idempotencyKey: 'resolve-key-0001',
    ...overrides,
  }
}

async function createOpenDispute(harness: Harness, actor = CLIENT) {
  const result = await harness.service.createDispute(
    creationInput({ actorWalletAddress: actor.walletAddress }) as never
  )
  return result.dispute
}

beforeEach(() => {
  // Each test builds its own harness; nothing global to reset.
})

describe('createDispute', () => {
  it('creates a dispute for a contract participant and audits the transition', async () => {
    const harness = setup()

    const result = await harness.service.createDispute(
      creationInput({ evidence: [{ type: 'url', url: 'https://proof.example/1.pdf' }] }) as never
    )

    expect(result.replayed).toBe(false)
    expect(result.dispute.status).toBe('open')
    expect(result.dispute.raisedBy).toBe('client')
    expect(result.contractStatus).toBe('disputed')
    expect(harness.repo.contracts.get('contract-1')?.status).toBe('disputed')
    expect(harness.repo.contracts.get('contract-1')?.activeDisputeId).toBe(result.dispute.id)

    const actions = harness.repo.audits.map((audit) => audit.action)
    expect(actions).toContain('dispute_created')
  })

  it('allows the arbitrator and designated decision-maker to open a dispute', async () => {
    const arbiterHarness = setup()
    const arbiterResult = await arbiterHarness.service.createDispute(
      creationInput({ actorWalletAddress: ARBITER.walletAddress }) as never
    )
    expect(arbiterResult.dispute.raisedBy).toBe('admin')

    const designatedHarness = setup()
    const designatedResult = await designatedHarness.service.createDispute(
      creationInput({ actorWalletAddress: DESIGNATED.walletAddress }) as never
    )
    expect(designatedResult.dispute.reason).toContain('Deliverable')
  })

  it('rejects unrelated users and records the authorization decision', async () => {
    const harness = setup()

    await expect(
      harness.service.createDispute(
        creationInput({ actorWalletAddress: OUTSIDER.walletAddress }) as never
      )
    ).rejects.toBeInstanceOf(DisputeForbiddenError)

    expect(harness.repo.disputes.size).toBe(0)
    expect(harness.repo.audits.map((a) => a.action)).toContain('authorization_denied')
  })

  it('rejects unauthenticated wallets that have no platform account', async () => {
    const harness = setup()
    await expect(
      harness.service.createDispute(
        creationInput({ actorWalletAddress: 'GUNKNOWNTWALLET' }) as never
      )
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 401 })
  })

  it('rejects creation when the contract is not active or escrow is unfunded', async () => {
    const completed = setup({ status: 'completed' })
    await expect(
      completed.service.createDispute(creationInput() as never)
    ).rejects.toBeInstanceOf(DisputeIneligibleError)

    const unfunded = setup({ escrowStatus: 'unfunded' })
    await expect(
      unfunded.service.createDispute(creationInput() as never)
    ).rejects.toBeInstanceOf(DisputeIneligibleError)
  })

  it('rejects duplicate disputes on the same contract', async () => {
    const harness = setup()
    await createOpenDispute(harness)

    await expect(
      harness.service.createDispute(
        creationInput({ idempotencyKey: 'create-key-0002' }) as never
      )
    ).rejects.toMatchObject({ code: 'DISPUTE_ALREADY_EXISTS', status: 409 })
  })

  it('replays the original dispute for an identical idempotent request', async () => {
    const harness = setup()
    const first = await createOpenDispute(harness)
    const replay = await harness.service.createDispute(creationInput() as never)

    expect(replay.replayed).toBe(true)
    expect(replay.dispute.id).toBe(first.id)
    expect(harness.repo.disputes.size).toBe(1)
  })

  it('rejects milestones that belong to another contract', async () => {
    const harness = setup()
    harness.repo.seedMilestone({
      id: 'foreign-milestone',
      contractId: 'other-contract',
      status: 'submitted',
      amount: '10',
    })

    await expect(
      harness.service.createDispute(
        creationInput({ milestoneId: 'foreign-milestone' }) as never
      )
    ).rejects.toBeInstanceOf(DisputeValidationError)
  })

  it('requires a milestone for on-chain escrowed contracts', async () => {
    const harness = setup()
    await expect(
      harness.service.createDispute(
        creationInput({ milestoneId: undefined }) as never
      )
    ).rejects.toBeInstanceOf(DisputeValidationError)
  })

  it('reports 503 when storage is unavailable', async () => {
    const harness = setup()
    harness.repo.available = false
    await expect(
      harness.service.createDispute(creationInput() as never)
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
  })
})

describe('submitEvidence', () => {
  it('stores references for participants and is idempotent per reference', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    const reference = { type: 'ipfs' as const, url: 'ipfs://bafyproof', label: 'proof' }

    const first = await harness.service.submitEvidence({
      disputeId: dispute.id,
      actorWalletAddress: FREELANCER.walletAddress,
      references: [reference],
      idempotencyKey: 'evidence-key-1',
    })
    expect(first.evidence).toHaveLength(1)
    expect(first.duplicates).toHaveLength(0)

    const replay = await harness.service.submitEvidence({
      disputeId: dispute.id,
      actorWalletAddress: FREELANCER.walletAddress,
      references: [reference],
      idempotencyKey: 'evidence-key-2',
    })
    expect(replay.evidence).toHaveLength(0)
    expect(replay.duplicates).toEqual([reference.url])
    expect(harness.repo.evidence).toHaveLength(1)
  })

  it('fingerprints include the label so distinct evidence is not merged', () => {
    const a = evidenceFingerprint({ type: 'url', url: 'https://x.test/a' })
    const b = evidenceFingerprint({
      type: 'url',
      url: 'https://x.test/a',
      label: 'screenshot',
    })
    expect(a).not.toBe(b)
  })

  it('forbids unrelated users from adding evidence', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    await expect(
      harness.service.submitEvidence({
        disputeId: dispute.id,
        actorWalletAddress: OUTSIDER.walletAddress,
        references: [{ type: 'url', url: 'https://x.test/leak' }],
        idempotencyKey: 'evidence-key-3',
      })
    ).rejects.toBeInstanceOf(DisputeForbiddenError)
  })

  it('allows the arbitrator to add evidence', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    const result = await harness.service.submitEvidence({
      disputeId: dispute.id,
      actorWalletAddress: ARBITER.walletAddress,
      references: [{ type: 'transaction', url: 'https://stellar.test/tx/abc' }],
      idempotencyKey: 'evidence-key-4',
    })
    expect(result.evidence).toHaveLength(1)
  })

  it('refuses evidence on a closed dispute', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    const resolved = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )
    expect(resolved.state).toBe('confirmed')

    await expect(
      harness.service.submitEvidence({
        disputeId: dispute.id,
        actorWalletAddress: CLIENT.walletAddress,
        references: [{ type: 'url', url: 'https://x.test/late' }],
        idempotencyKey: 'evidence-key-5',
      })
    ).rejects.toMatchObject({ code: 'DISPUTE_CLOSED', status: 409 })
  })
})

describe('getDispute', () => {
  it('returns evidence, attempts and the audit trail to participants', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    await harness.service.submitEvidence({
      disputeId: dispute.id,
      actorWalletAddress: CLIENT.walletAddress,
      references: [{ type: 'url', url: 'https://x.test/evidence' }],
      idempotencyKey: 'evidence-key-6',
    })

    const result = await harness.service.getDispute(
      dispute.id,
      FREELANCER.walletAddress
    )
    expect(result.dispute.id).toBe(dispute.id)
    expect(result.evidence).toHaveLength(1)
    expect(result.auditTrail.map((event) => event.action)).toEqual([
      'dispute_created',
      'evidence_submitted',
    ])
  })

  it('hides private dispute details from unrelated users', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    await expect(
      harness.service.getDispute(dispute.id, OUTSIDER.walletAddress)
    ).rejects.toMatchObject({ code: 'DISPUTE_FORBIDDEN', status: 403 })
  })

  it('lets admins and designated resolvers read any dispute', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    await expect(
      harness.service.getDispute(dispute.id, ADMIN.walletAddress)
    ).resolves.toBeTruthy()
    await expect(
      harness.service.getDispute(dispute.id, DESIGNATED.walletAddress)
    ).resolves.toBeTruthy()
  })
})

describe('resolveDispute', () => {
  it('confirms an arbiter resolution only after on-chain verification', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-confirmed', state: 'confirmed', ledger: 99 }

    const result = await harness.service.resolveDispute(
      resolutionInput({
        disputeId: dispute.id,
        clientRefundAmount: undefined,
      }) as never
    )

    expect(result.state).toBe('confirmed')
    expect(result.attempt.status).toBe('confirmed')
    expect(result.attempt.txHash).toBe('tx-confirmed')
    expect(result.dispute.status).toBe('resolved_freelancer')
    expect(result.contractStatus).toBe('completed')
    expect(harness.repo.contracts.get('contract-1')?.status).toBe('completed')
    expect(harness.repo.contracts.get('contract-1')?.activeDisputeId).toBeNull()
    expect(harness.chain.submissions[0]).toMatchObject({
      contractAddress: 'CESCROWCONTRACT',
      milestoneId: 'milestone-1',
      releaseToFreelancer: true,
    })
    expect(harness.repo.audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['resolution_requested', 'resolution_confirmed'])
    )
  })

  it('forbids contract participants who are not arbitrators from resolving', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    await expect(
      harness.service.resolveDispute(
        resolutionInput({
          disputeId: dispute.id,
          actorWalletAddress: CLIENT.walletAddress,
        }) as never
      )
    ).rejects.toBeInstanceOf(DisputeForbiddenError)

    expect(harness.chain.submissions).toHaveLength(0)
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
  })

  it('allows the designated decision-maker and admins to resolve', async () => {
    const designatedHarness = setup()
    const designatedDispute = await createOpenDispute(designatedHarness)
    const designated = await designatedHarness.service.resolveDispute(
      resolutionInput({
        disputeId: designatedDispute.id,
        actorWalletAddress: DESIGNATED.walletAddress,
      }) as never
    )
    expect(designated.state).toBe('confirmed')

    const adminHarness = setup()
    const adminDispute = await createOpenDispute(adminHarness)
    const admin = await adminHarness.service.resolveDispute(
      resolutionInput({
        disputeId: adminDispute.id,
        actorWalletAddress: ADMIN.walletAddress,
      }) as never
    )
    expect(admin.state).toBe('confirmed')
  })

  it('rejects a second resolution of the same dispute', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    await expect(
      harness.service.resolveDispute(
        resolutionInput({
          disputeId: dispute.id,
          idempotencyKey: 'resolve-key-0002',
        }) as never
      )
    ).rejects.toMatchObject({ code: 'RESOLUTION_ALREADY_FINALISED', status: 409 })
  })

  it('replays a confirmed attempt for a repeated idempotency key', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    const input = resolutionInput({ disputeId: dispute.id })

    const first = await harness.service.resolveDispute(input as never)
    const replay = await harness.service.resolveDispute(input as never)

    expect(first.state).toBe('confirmed')
    expect(replay.state).toBe('confirmed')
    expect(replay.replayed).toBe(true)
    expect(harness.chain.submissions).toHaveLength(1)
  })

  it('rejects reusing an idempotency key with a different payload', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    const input = resolutionInput({ disputeId: dispute.id })
    await harness.service.resolveDispute(input as never)

    await expect(
      harness.service.resolveDispute(
        resolutionInput({
          disputeId: dispute.id,
          outcome: 'resolved_client',
        }) as never
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
  })

  it('prevents concurrent resolutions from both succeeding', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    // Hold the chain call so both requests overlap.
    let release: (value: ChainResolutionSubmission) => void = () => {}
    harness.chain.submitResolution = (request: ChainResolutionRequest) => {
      harness.chain.submissions.push(request)
      return new Promise((resolve) => {
        release = resolve
      })
    }

    // Attach handlers immediately so a fast rejection is never reported as an
    // unhandled promise rejection.
    const settle = (promise: Promise<unknown>) =>
      promise.then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason })
      )

    const first = settle(
      harness.service.resolveDispute(
        resolutionInput({ disputeId: dispute.id, idempotencyKey: 'concurrent-key-1' }) as never
      )
    )
    const second = settle(
      harness.service.resolveDispute(
        resolutionInput({ disputeId: dispute.id, idempotencyKey: 'concurrent-key-2' }) as never
      )
    )

    // Wait until the first request is inside the chain submission.
    await vi.waitFor(() => {
      expect(harness.chain.submissions).toHaveLength(1)
    })
    release({ txHash: 'tx-race', state: 'confirmed', ledger: 1 })

    const outcomes = await Promise.all([first, second])
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled')
    const rejected = outcomes.filter((o) => o.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as { reason: unknown }).reason).toMatchObject({
      code: 'RESOLUTION_IN_PROGRESS',
    })
    const attempts = await harness.repo.listAttempts(dispute.id)
    expect(attempts.filter((a) => a.status === 'confirmed')).toHaveLength(1)
  })

  it('tracks a pending blockchain transaction without resolving the dispute', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-pending', state: 'pending' }

    const result = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    expect(result.state).toBe('pending')
    expect(result.attempt.status).toBe('pending')
    expect(result.attempt.txHash).toBe('tx-pending')
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
    expect(harness.repo.contracts.get('contract-1')?.status).toBe('disputed')
    expect(harness.repo.audits.map((a) => a.action)).toContain('resolution_pending')
  })

  it('keeps the dispute open when the transaction reverts, and does not retry blindly', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = {
      txHash: 'tx-reverted',
      state: 'failed',
      errorCode: 'InvalidMilestoneStatus',
      errorMessage: 'Milestone is not disputed on-chain',
    }

    const result = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    expect(result.state).toBe('failed')
    expect(result.retryable).toBe(false)
    expect(result.attempt.errorCode).toBe('InvalidMilestoneStatus')
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
    expect(harness.repo.audits.map((a) => a.action)).toContain('resolution_failed')
  })

  it('records RPC failures as recoverable and preserves the dispute record', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submissionError = new DisputeChainError(
      'RPC timeout',
      'BLOCKCHAIN_UNAVAILABLE',
      true
    )

    const result = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    expect(result.state).toBe('failed')
    expect(result.retryable).toBe(true)
    expect(result.attempt.errorCode).toBe('BLOCKCHAIN_UNAVAILABLE')
    expect(await harness.repo.getDispute(dispute.id)).not.toBeNull()
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
  })

  it('retries a failed attempt with the same idempotency key and confirms it', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = {
      txHash: 'tx-failed',
      state: 'failed',
      errorCode: 'CONTRACT_REVERTED',
      errorMessage: 'reverted',
    }

    const input = resolutionInput({ disputeId: dispute.id })
    const failed = await harness.service.resolveDispute(input as never)
    expect(failed.state).toBe('failed')

    harness.chain.submission = { txHash: 'tx-retried', state: 'confirmed', ledger: 7 }
    const retried = await harness.service.resolveDispute(input as never)

    expect(retried.state).toBe('confirmed')
    expect(retried.attempt.txHash).toBe('tx-retried')
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('resolved_freelancer')
    expect(harness.repo.audits.map((a) => a.action)).toContain('resolution_retried')
  })

  it('retries a specific failed attempt id and links the new attempt', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submissionError = new DisputeChainError('down', 'BLOCKCHAIN_UNAVAILABLE', true)

    const failed = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id, idempotencyKey: 'first-try-key' }) as never
    )
    expect(failed.state).toBe('failed')

    harness.chain.submissionError = null
    harness.chain.submission = { txHash: 'tx-recovered', state: 'confirmed', ledger: 12 }

    const retried = await harness.service.resolveDispute(
      resolutionInput({
        disputeId: dispute.id,
        idempotencyKey: 'retry-key-0001',
        retryAttemptId: failed.attempt.id,
      }) as never
    )

    expect(retried.state).toBe('confirmed')
    expect(retried.attempt.retryOf).toBe(failed.attempt.id)
  })

  it('reconciles a pending transaction once the chain confirms it', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-late', state: 'pending' }
    const pending = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )
    expect(pending.state).toBe('pending')

    harness.chain.verification = 'confirmed'
    const reconciled = await harness.service.reconcileResolution(
      dispute.id,
      ARBITER.walletAddress
    )

    expect(reconciled?.state).toBe('confirmed')
    expect(reconciled?.attempt.txHash).toBe('tx-late')
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('resolved_freelancer')
    expect(harness.chain.verified).toEqual(['tx-late'])
  })

  it('leaves the dispute unresolved while reconciliation is still pending', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-waiting', state: 'pending' }
    await harness.service.resolveDispute(resolutionInput({ disputeId: dispute.id }) as never)

    harness.chain.verification = 'unknown'
    const reconciled = await harness.service.reconcileResolution(
      dispute.id,
      ARBITER.walletAddress
    )

    expect(reconciled?.state).toBe('pending')
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
  })

  it('withdraws off-chain without calling the escrow contract', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    const result = await harness.service.resolveDispute(
      resolutionInput({
        disputeId: dispute.id,
        outcome: 'withdrawn',
        reasons: 'Parties reached an agreement outside arbitration',
      }) as never
    )

    expect(result.state).toBe('confirmed')
    expect(result.attempt.onchain).toBe(false)
    expect(result.attempt.txHash).toBeNull()
    expect(result.contractStatus).toBe('active')
    expect(harness.chain.submissions).toHaveLength(0)
    expect(harness.repo.contracts.get('contract-1')?.activeDisputeId).toBeNull()
  })

  it('refuses split resolutions on-chain but allows them off-chain', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)

    await expect(
      harness.service.resolveDispute(
        resolutionInput({
          disputeId: dispute.id,
          outcome: 'resolved_split',
          clientRefundAmount: '400.000000',
          freelancerPayoutAmount: '600.000000',
        }) as never
      )
    ).rejects.toBeInstanceOf(DisputeForbiddenError)
    expect(harness.chain.submissions).toHaveLength(0)

    const offchain = setup({ escrowAddress: null })
    const offchainDispute = await createOpenDispute(offchain)
    const result = await offchain.service.resolveDispute(
      resolutionInput({
        disputeId: offchainDispute.id,
        outcome: 'resolved_split',
        clientRefundAmount: '400.000000',
        freelancerPayoutAmount: '600.000000',
      }) as never
    )
    expect(result.state).toBe('confirmed')
    expect(result.dispute.clientRefundAmount).toBe('400.000000')
    expect(result.dispute.freelancerPayoutAmount).toBe('600.000000')
  })

  it('never confirms a resolution when the attempt cannot be persisted', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-1', state: 'confirmed' }

    // Simulate a concurrent winner: the dispute is finalized behind our back.
    const original = harness.repo.confirmResolution.bind(harness.repo)
    let calls = 0
    harness.repo.confirmResolution = async (input) => {
      calls += 1
      if (calls === 1) return null
      return original(input)
    }

    await expect(
      harness.service.resolveDispute(resolutionInput({ disputeId: dispute.id }) as never)
    ).rejects.toMatchObject({ code: 'RESOLUTION_ALREADY_FINALISED' })
    expect((await harness.repo.getDispute(dispute.id))?.status).toBe('open')
  })

  it('keeps an append-only audit trail for the whole lifecycle', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    await harness.service.submitEvidence({
      disputeId: dispute.id,
      actorWalletAddress: FREELANCER.walletAddress,
      references: [{ type: 'url', url: 'https://x.test/final' }],
      idempotencyKey: 'evidence-key-final',
    })
    await expect(
      harness.service.resolveDispute(
        resolutionInput({
          disputeId: dispute.id,
          actorWalletAddress: OUTSIDER.walletAddress,
        }) as never
      )
    ).rejects.toBeInstanceOf(DisputeForbiddenError)
    await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    const actions = harness.repo.audits.map((audit) => audit.action)
    expect(actions).toEqual([
      'dispute_created',
      'evidence_submitted',
      'authorization_denied',
      'resolution_requested',
      'resolution_confirmed',
    ])
    expect(harness.repo.audits.every((audit) => Boolean(audit.createdAt))).toBe(true)
  })
})

describe('error mapping', () => {
  it('exposes typed status codes for consistent API responses', () => {
    expect(new DisputeConflictError('x', 'DISPUTE_CLOSED').status).toBe(409)
    expect(new DisputeValidationError('x').status).toBe(422)
    expect(new DisputeError('x', 'CODE', 418).status).toBe(418)
  })

  it('does not confirm an attempt when the chain reports a revert during reconciliation', async () => {
    const harness = setup()
    const dispute = await createOpenDispute(harness)
    harness.chain.submission = { txHash: 'tx-revert-late', state: 'pending' }
    const pending = await harness.service.resolveDispute(
      resolutionInput({ disputeId: dispute.id }) as never
    )

    harness.chain.verification = 'failed'
    const reconciled = await harness.service.reconcileResolution(
      dispute.id,
      ARBITER.walletAddress
    )

    expect(reconciled?.state).toBe('failed')
    const stored = (await harness.repo.getAttempt(
      pending.attempt.id
    )) as ResolutionAttemptRecord
    expect(stored.status).toBe('failed')
  })
})
