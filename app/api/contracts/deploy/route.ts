export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { deploySorobanEscrow, SorobanDeployError } from '@/lib/soroban/deploy'
import { activityService } from '@/lib/activity'
import { contractAuditLogService } from '@/lib/audit-log'
import {
  createContract,
  createMilestones,
  getExistingContract,
  getJobById,
  getUserById,
  getUserIdByWalletAddress,
  linkJobToContract,
  type MilestoneInput,
} from '@/lib/contracts/store'

interface DeployContractBody {
  jobId?: unknown
  freelancerId?: unknown
  totalAmount?: unknown
  currency?: unknown
  terms?: unknown
  milestones?: unknown
}

/**
 * Deployment environment guard.
 *
 * Testnet and Mainnet are configured independently via environment variables.
 * The network passphrase and deployment network are validated against the
 * configured environment before any on-chain action is taken, which prevents
 * accidental deployment to the wrong network.
 */
const STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? ''
const EXPECTED_NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE ?? ''
const MAINNET_DEPLOY_APPROVED = process.env.SOROBAN_MAINNET_DEPLOY_APPROVED === 'true'

function validateDeploymentEnvironment(): string | null {
  if (STELLAR_NETWORK !== 'testnet' && STELLAR_NETWORK !== 'mainnet') {
    return 'STELLAR_NETWORK must be set to "testnet" or "mainnet"'
  }
  if (!EXPECTED_NETWORK_PASSPHRASE) {
    return 'STELLAR_NETWORK_PASSPHRASE is required for deployment'
  }
  const expected =
    STELLAR_NETWORK === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015'
  if (EXPECTED_NETWORK_PASSPHRASE !== expected) {
    return `STELLAR_NETWORK_PASSPHRASE does not match network "${STELLAR_NETWORK}"`
  }
  if (STELLAR_NETWORK === 'mainnet' && !MAINNET_DEPLOY_APPROVED) {
    return 'Mainnet deployment requires manual approval: set SOROBAN_MAINNET_DEPLOY_APPROVED=true after review'
  }
  return null
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isValidAmount(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

function parseMilestones(raw: unknown): MilestoneInput[] | string {
  if (!Array.isArray(raw)) return 'milestones must be an array'
  for (const [i, m] of raw.entries()) {
    if (typeof m !== 'object' || m === null) return `milestones[${i}] must be an object`
    const entry = m as Record<string, unknown>
    if (!isNonEmptyString(entry.title)) return `milestones[${i}].title is required`
    if (!isValidAmount(entry.amount)) return `milestones[${i}].amount must be a positive number string`
    if (entry.dueDate !== undefined && typeof entry.dueDate !== 'string') {
      return `milestones[${i}].dueDate must be an ISO date string`
    }
  }
  return raw as MilestoneInput[]
}

export const POST = withAuth(async (request: NextRequest, auth) => {
  const envError = validateDeploymentEnvironment()
  if (envError) {
    return NextResponse.json(
      { error: envError, code: 'DEPLOYMENT_CONFIG_INVALID' },
      { status: 503 }
    )
  }

  let body: DeployContractBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  if (!isPositiveInt(body.jobId)) {
    return NextResponse.json(
      { error: 'jobId must be a positive integer', code: 'INVALID_JOB_ID' },
      { status: 400 }
    )
  }
  if (!isPositiveInt(body.freelancerId)) {
    return NextResponse.json(
      { error: 'freelancerId must be a positive integer', code: 'INVALID_FREELANCER_ID' },
      { status: 400 }
    )
  }
  if (!isValidAmount(body.totalAmount)) {
    return NextResponse.json(
      { error: 'totalAmount must be a positive number string (e.g. "100.00")', code: 'INVALID_TOTAL_AMOUNT' },
      { status: 400 }
    )
  }

  const currency = isNonEmptyString(body.currency) ? body.currency.toUpperCase() : 'XLM'
  const terms = isNonEmptyString(body.terms) ? body.terms : undefined

  let milestones: MilestoneInput[] = []
  if (body.milestones !== undefined) {
    const parsed = parseMilestones(body.milestones)
    if (typeof parsed === 'string') {
      return NextResponse.json({ error: parsed, code: 'INVALID_MILESTONES' }, { status: 400 })
    }
    milestones = parsed
  }

  const clientDbId = await getUserIdByWalletAddress(auth.walletAddress)
  if (clientDbId === null) {
    return NextResponse.json(
      { error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' },
      { status: 401 }
    )
  }

  const job = await getJobById(body.jobId)
  if (job === null) {
    return NextResponse.json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }, { status: 404 })
  }
  if (job.client_id !== clientDbId) {
    return NextResponse.json({ error: 'You are not the client for this job', code: 'FORBIDDEN' }, { status: 403 })
  }
  if (job.status === 'completed' || job.status === 'cancelled') {
    return NextResponse.json(
      { error: `Cannot deploy contract for a ${job.status} job`, code: 'JOB_NOT_DEPLOYABLE' },
      { status: 409 }
    )
  }

  const existing = await getExistingContract(body.jobId)
  if (existing !== null) {
    return NextResponse.json(
      { error: 'A contract already exists for this job', code: 'CONTRACT_ALREADY_EXISTS', contractId: existing.id, contractAddress: existing.contract_address },
      { status: 409 }
    )
  }

  const freelancer = await getUserById(body.freelancerId)
  if (freelancer === null) {
    return NextResponse.json({ error: 'Freelancer not found', code: 'FREELANCER_NOT_FOUND' }, { status: 404 })
  }

  let deployment
  try {
    deployment = await deploySorobanEscrow({
      clientAddress: auth.walletAddress,
      freelancerAddress: freelancer.wallet_address,
      totalAmount: body.totalAmount,
      currency,
    })
  } catch (err) {
    const message = err instanceof SorobanDeployError ? err.message : 'Contract deployment failed'
    console.error('[contracts/deploy] Soroban deployment error:', err)
    return NextResponse.json({ error: message, code: 'DEPLOYMENT_FAILED' }, { status: 500 })
  }

  if (!deployment.contractAddress || !deployment.txHash) {
    return NextResponse.json(
      {
        error: 'Deployment did not return a contract address and transaction hash; no record was written',
        code: 'DEPLOYMENT_INCOMPLETE',
      },
      { status: 500 }
    )
  }

  let contract
  try {
    contract = await createContract({
      jobId: body.jobId,
      clientId: clientDbId,
      freelancerId: body.freelancerId,
      totalAmount: body.totalAmount,
      currency,
      terms,
      contractAddress: deployment.contractAddress,
      txHash: deployment.txHash,
      networkPassphrase: deployment.networkPassphrase,
    })
    await linkJobToContract(body.jobId, deployment.contractAddress)
    if (milestones.length > 0) {
      await createMilestones(body.jobId, contract.id, milestones)
    }
  } catch (err) {
    console.error('[contracts/deploy] DB persistence error:', err)
    return NextResponse.json(
      {
        error: 'Failed to persist contract data; on-chain deployment txHash ' + deployment.txHash + ' must be reconciled manually',
        code: 'DB_ERROR',
        txHash: deployment.txHash,
        contractAddress: deployment.contractAddress,
      },
      { status: 500 }
    )
  }

  const users = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
  const actorId = users[0]?.id as string | undefined
  if (actorId) {
    activityService.log({
      actorId,
      contractId: String(contract.id),
      projectId: String(job.id),
      actionType: 'contract_created',
      description: `Contract created for project "${job.title}" with freelancer ${freelancer.wallet_address}`,
      metadata: {
        totalAmount: body.totalAmount,
        currency,
        milestonesCount: milestones.length,
        freelancerId: body.freelancerId,
        network: STELLAR_NETWORK,
        txHash: deployment.txHash,
      },
    }).catch((err: unknown) => console.error('[activity] Failed to log contract_created:', err))

    // Audit log: contract_creation
    contractAuditLogService.createLog({
      contractId: contract.id,
      projectId: Number(job.id),
      action: 'contract_creation',
      actorUserId: Number(actorId),
      actorWallet: auth.walletAddress,
      newState: 'active',
      metadata: {
        totalAmount: body.totalAmount,
        currency,
        milestonesCount: milestones.length,
        network: STELLAR_NETWORK,
        networkPassphrase: deployment.networkPassphrase,
        contractAddress: deployment.contractAddress,
        txHash: deployment.txHash,
      },
    }, auth.walletAddress).catch((err: unknown) => console.error('[audit-log] Failed to log contract_creation:', err))
  }

  return NextResponse.json(
    {
      contractId: contract.id,
      jobId: contract.job_id,
      contractAddress: contract.contract_address,
      txHash: contract.contract_tx_hash,
      networkPassphrase: contract.network_passphrase,
      network: STELLAR_NETWORK,
      status: contract.status,
      totalAmount: contract.total_amount,
      currency: contract.currency,
      milestonesCreated: milestones.length,
      createdAt: contract.created_at,
    },
    { status: 201 }
  )
})
