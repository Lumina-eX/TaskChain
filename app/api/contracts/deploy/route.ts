export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { deploySorobanEscrow, SorobanDeployError } from '@/lib/soroban/deploy'
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
    return NextResponse.json({ error: 'Failed to persist contract data', code: 'DB_ERROR' }, { status: 500 })
  }

  return NextResponse.json(
    {
      contractId: contract.id,
      jobId: contract.job_id,
      contractAddress: contract.contract_address,
      txHash: contract.contract_tx_hash,
      networkPassphrase: contract.network_passphrase,
      status: contract.status,
      totalAmount: contract.total_amount,
      currency: contract.currency,
      milestonesCreated: milestones.length,
      createdAt: contract.created_at,
    },
    { status: 201 }
  )
})
