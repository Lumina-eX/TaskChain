import { z } from 'zod'
import { sql } from '@/lib/db'
import { EscrowForbiddenError, EscrowValidationError } from './errors'

export const escrowTransactionTypes = [
  'deposit',
  'milestone_release',
  'refund',
  'dispute',
] as const

export type EscrowTransactionType = (typeof escrowTransactionTypes)[number]
export type EscrowTransactionStatus = 'pending' | 'confirmed' | 'failed'

export interface EscrowTransactionLog {
  id: string
  contractId: string
  projectId: string
  milestoneId: string | null
  disputeId: string | null
  actorUserId: string
  counterpartyUserId: string | null
  transactionType: EscrowTransactionType
  amount: string | null
  currency: string
  transactionHash: string | null
  status: EscrowTransactionStatus
  description: string | null
  metadata: Record<string, unknown>
  createdAt: string
  projectTitle: string | null
  actorWalletAddress: string | null
  counterpartyWalletAddress: string | null
}

export interface CreateEscrowTransactionLogInput {
  contractId: string
  milestoneId?: string
  disputeId?: string
  actorUserId?: string
  counterpartyUserId?: string
  transactionType: EscrowTransactionType
  amount?: string
  currency?: string
  transactionHash?: string
  status?: EscrowTransactionStatus
  description?: string
  metadata?: Record<string, unknown>
}

export interface EscrowTransactionLogPage {
  logs: EscrowTransactionLog[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

const uuidSchema = z.string().uuid()
const amountSchema = z.string().regex(/^\d+(\.\d{1,6})?$/, 'amount must be a positive decimal string with up to 6 decimal places')

const createLogSchema = z.object({
  contractId: uuidSchema,
  milestoneId: uuidSchema.optional(),
  disputeId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  counterpartyUserId: uuidSchema.optional(),
  transactionType: z.enum(escrowTransactionTypes),
  amount: amountSchema.optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  transactionHash: z.string().trim().min(1).max(255).optional(),
  status: z.enum(['pending', 'confirmed', 'failed']).optional(),
  description: z.string().trim().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const moneyTransactionTypes: EscrowTransactionType[] = [
  'deposit',
  'milestone_release',
  'refund',
]

interface AuthenticatedEscrowUser {
  id: string
  role: string
}

interface ContractAccessRow {
  id: string
  project_id: string
  client_id: string
  freelancer_id: string
  currency: string
}

function rowToLog(row: any): EscrowTransactionLog {
  return {
    id: row.id,
    contractId: row.contract_id,
    projectId: row.project_id,
    milestoneId: row.milestone_id ?? null,
    disputeId: row.dispute_id ?? null,
    actorUserId: row.actor_user_id,
    counterpartyUserId: row.counterparty_user_id ?? null,
    transactionType: row.transaction_type,
    amount: row.amount ?? null,
    currency: row.currency,
    transactionHash: row.transaction_hash ?? null,
    status: row.status,
    description: row.description ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    projectTitle: row.project_title ?? null,
    actorWalletAddress: row.actor_wallet_address ?? null,
    counterpartyWalletAddress: row.counterparty_wallet_address ?? null,
  }
}

function normalizeLimit(value: string | null): number {
  if (!value) return 50
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new EscrowValidationError('limit must be an integer between 1 and 100')
  }
  return parsed
}

function normalizeOffset(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new EscrowValidationError('offset must be a non-negative integer')
  }
  return parsed
}

async function getAuthenticatedUser(walletAddress: string): Promise<AuthenticatedEscrowUser> {
  const rows = await sql`
    SELECT id, role::text AS role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `

  if (!rows[0]) {
    throw new EscrowForbiddenError('Authenticated wallet is not linked to a user')
  }

  return rows[0] as AuthenticatedEscrowUser
}

function assertPositiveAmount(value: string | undefined, field = 'amount'): void {
  if (!value) {
    throw new EscrowValidationError(`${field} is required for this transaction type`)
  }

  if (Number(value) <= 0) {
    throw new EscrowValidationError(`${field} must be greater than zero`)
  }
}

function assertCanAccessContract(contract: ContractAccessRow, user: AuthenticatedEscrowUser): void {
  if (user.role === 'admin') return
  if (contract.client_id === user.id || contract.freelancer_id === user.id) return
  throw new EscrowForbiddenError('Only project participants or admins can access escrow transaction logs')
}

export class EscrowTransactionHistoryService {
  async createLog(
    input: unknown,
    walletAddress: string
  ): Promise<EscrowTransactionLog> {
    const parsed = createLogSchema.safeParse(input)
    if (!parsed.success) {
      throw new EscrowValidationError(parsed.error.issues[0]?.message ?? 'Invalid escrow transaction log payload')
    }

    const data = parsed.data
    const user = await getAuthenticatedUser(walletAddress)

    const contracts = await sql`
      SELECT id, project_id, client_id, freelancer_id, currency
        FROM contracts
       WHERE id = ${data.contractId}
       LIMIT 1
    `
    const contract = contracts[0] as ContractAccessRow | undefined
    if (!contract) {
      throw new EscrowValidationError('contractId does not reference an existing contract')
    }

    assertCanAccessContract(contract, user)

    const actorUserId = data.actorUserId ?? user.id
    if (user.role !== 'admin' && actorUserId !== user.id) {
      throw new EscrowForbiddenError('Only admins can create logs for another actor')
    }

    const actorRows = await sql`
      SELECT id FROM users WHERE id = ${actorUserId} LIMIT 1
    `
    if (!actorRows[0]) {
      throw new EscrowValidationError('actorUserId must reference an existing user')
    }

    if (data.counterpartyUserId) {
      const counterpartyRows = await sql`
        SELECT id FROM users WHERE id = ${data.counterpartyUserId} LIMIT 1
      `
      if (!counterpartyRows[0]) {
        throw new EscrowValidationError('counterpartyUserId must reference an existing user')
      }
    }

    if (data.transactionType === 'milestone_release' && !data.milestoneId) {
      throw new EscrowValidationError('milestoneId is required for milestone_release transactions')
    }

    if (moneyTransactionTypes.includes(data.transactionType)) {
      assertPositiveAmount(data.amount)
      if (!data.transactionHash) {
        throw new EscrowValidationError('transactionHash is required for money movement transaction logs')
      }
    }

    if (data.transactionType === 'dispute' && !data.disputeId) {
      throw new EscrowValidationError('disputeId is required for dispute transaction logs')
    }

    if (data.milestoneId) {
      const milestones = await sql`
        SELECT id FROM milestones
         WHERE id = ${data.milestoneId} AND contract_id = ${data.contractId}
         LIMIT 1
      `
      if (!milestones[0]) {
        throw new EscrowValidationError('milestoneId must belong to the provided contract')
      }
    }

    if (data.disputeId) {
      const disputes = await sql`
        SELECT id FROM disputes
         WHERE id = ${data.disputeId} AND contract_id = ${data.contractId}
         LIMIT 1
      `
      if (!disputes[0]) {
        throw new EscrowValidationError('disputeId must belong to the provided contract')
      }
    }

    const rows = await sql`
      INSERT INTO escrow_transaction_logs (
        contract_id,
        project_id,
        milestone_id,
        dispute_id,
        actor_user_id,
        counterparty_user_id,
        transaction_type,
        amount,
        currency,
        transaction_hash,
        status,
        description,
        metadata
      )
      VALUES (
        ${data.contractId},
        ${contract.project_id},
        ${data.milestoneId ?? null},
        ${data.disputeId ?? null},
        ${actorUserId},
        ${data.counterpartyUserId ?? null},
        ${data.transactionType}::escrow_transaction_type,
        ${data.amount ?? null}::numeric,
        ${data.currency ?? contract.currency},
        ${data.transactionHash ?? null},
        ${data.status ?? 'confirmed'},
        ${data.description ?? null},
        ${JSON.stringify(data.metadata ?? {})}::jsonb
      )
      RETURNING *
    `

    return this.getLogById(rows[0].id, user)
  }

  async listLogs(params: {
    walletAddress: string
    limitParam: string | null
    offsetParam: string | null
    contractId?: string | null
    projectId?: string | null
    transactionType?: string | null
  }): Promise<EscrowTransactionLogPage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)
    const user = await getAuthenticatedUser(params.walletAddress)

    if (params.contractId && !uuidSchema.safeParse(params.contractId).success) {
      throw new EscrowValidationError('contractId must be a valid UUID')
    }
    if (params.projectId && !uuidSchema.safeParse(params.projectId).success) {
      throw new EscrowValidationError('projectId must be a valid UUID')
    }
    if (params.transactionType && !escrowTransactionTypes.includes(params.transactionType as EscrowTransactionType)) {
      throw new EscrowValidationError('transactionType is not supported')
    }

    const countRows = await sql`
      SELECT COUNT(*)::int AS total_count
        FROM escrow_transaction_logs l
        JOIN contracts c ON c.id = l.contract_id
       WHERE (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id}
              OR l.actor_user_id = ${user.id}
              OR l.counterparty_user_id = ${user.id})
         AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.projectId ?? null}::uuid IS NULL OR l.project_id = ${params.projectId ?? null}::uuid)
         AND (${params.transactionType ?? null}::escrow_transaction_type IS NULL OR l.transaction_type = ${params.transactionType ?? null}::escrow_transaction_type)
    `
    const total = Number(countRows[0]?.total_count ?? 0)

    const rows = total > offset ? await sql`
      SELECT l.*,
             p.title AS project_title,
             actor.wallet_address AS actor_wallet_address,
             counterparty.wallet_address AS counterparty_wallet_address
        FROM escrow_transaction_logs l
        JOIN contracts c ON c.id = l.contract_id
        LEFT JOIN projects p ON p.id = l.project_id
        LEFT JOIN users actor ON actor.id = l.actor_user_id
        LEFT JOIN users counterparty ON counterparty.id = l.counterparty_user_id
       WHERE (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id}
              OR l.actor_user_id = ${user.id}
              OR l.counterparty_user_id = ${user.id})
         AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.projectId ?? null}::uuid IS NULL OR l.project_id = ${params.projectId ?? null}::uuid)
         AND (${params.transactionType ?? null}::escrow_transaction_type IS NULL OR l.transaction_type = ${params.transactionType ?? null}::escrow_transaction_type)
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ${limit}
      OFFSET ${offset}
    ` : []

    const logs = rows.map(rowToLog)
    const nextOffset = offset + logs.length < total ? offset + logs.length : null

    return {
      logs,
      pagination: {
        limit,
        offset,
        total,
        nextOffset,
        hasMore: nextOffset !== null,
      },
    }
  }

  private async getLogById(
    logId: string,
    user: AuthenticatedEscrowUser
  ): Promise<EscrowTransactionLog> {
    const rows = await sql`
      SELECT l.*,
             p.title AS project_title,
             actor.wallet_address AS actor_wallet_address,
             counterparty.wallet_address AS counterparty_wallet_address
        FROM escrow_transaction_logs l
        JOIN contracts c ON c.id = l.contract_id
        LEFT JOIN projects p ON p.id = l.project_id
        LEFT JOIN users actor ON actor.id = l.actor_user_id
        LEFT JOIN users counterparty ON counterparty.id = l.counterparty_user_id
       WHERE l.id = ${logId}
         AND (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id}
              OR l.actor_user_id = ${user.id}
              OR l.counterparty_user_id = ${user.id})
       LIMIT 1
    `

    if (!rows[0]) {
      throw new EscrowForbiddenError('Escrow transaction log is not visible to this user')
    }

    return rowToLog(rows[0])
  }
}

export const escrowTransactionHistoryService = new EscrowTransactionHistoryService()
