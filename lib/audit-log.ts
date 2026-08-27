import { sql } from '@/lib/db'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────────

export const contractAuditActions = [
  'contract_creation',
  'milestone_creation',
  'milestone_submission',
  'approval',
  'rejection',
  'dispute_creation',
  'dispute_resolution',
  'contract_completion',
] as const
export type ContractAuditAction = (typeof contractAuditActions)[number]

export interface ContractAuditLog {
  id: string
  contractId: number
  projectId: number
  action: ContractAuditAction
  actorUserId: number
  actorWallet: string
  previousState: string | null
  newState: string | null
  milestoneId: number | null
  disputeId: number | null
  amount: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface CreateAuditLogInput {
  contractId: number
  projectId: number
  action: ContractAuditAction
  actorUserId: number
  actorWallet: string
  previousState?: string
  newState?: string
  milestoneId?: number
  disputeId?: number
  amount?: string
  metadata?: Record<string, unknown>
}

export interface AuditLogPage {
  logs: ContractAuditLog[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

// ─── Validation Schemas ────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid()
const amountSchema = z.string().regex(/^\d+(\.\d{1,6})?$/, 'amount must be a positive decimal string with up to 6 decimal places')

const createLogSchema = z.object({
  contractId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  action: z.enum(contractAuditActions as unknown as [string, ...string[]]),
  actorUserId: z.number().int().positive().optional(),
  actorWallet: z.string().trim().min(1).max(255),
  previousState: z.string().trim().max(100).optional(),
  newState: z.string().trim().max(100).optional(),
  milestoneId: z.number().int().positive().optional(),
  disputeId: z.number().int().positive().optional(),
  amount: amountSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})

const listLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  contractId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  action: z.enum(contractAuditActions as unknown as [string, ...string[]]).optional(),
  actorUserId: uuidSchema.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
})

// ─── Errors ──────────────────────────────────────────────────────────────────

export class AuditValidationError extends Error {
  constructor(message: string) { super(message) }
}
export class AuditForbiddenError extends Error {
  constructor(message: string) { super(message) }
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

function rowToLog(row: Record<string, unknown>): ContractAuditLog {
  return {
    id: row.id as string,
    contractId: row.contract_id as number,
    projectId: row.project_id as number,
    action: row.action as ContractAuditAction,
    actorUserId: row.actor_user_id as number,
    actorWallet: row.actor_wallet as string,
    previousState: (row.previous_state as string) ?? null,
    newState: (row.new_state as string) ?? null,
    milestoneId: (row.milestone_id as number) ?? null,
    disputeId: (row.dispute_id as number) ?? null,
    amount: row.amount != null ? String(row.amount) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }
}

// ─── Access control ──────────────────────────────────────────────────────────

interface ContractAccessRow {
  id: number
  project_id: number
  client_id: number
  freelancer_id: number
}

interface AuthUser {
  id: number
  role: string
}

async function getAuthUser(walletAddress: string): Promise<AuthUser> {
  const rows = await sql<{ id: number; role: string }>`
    SELECT id, role::text AS role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `
  if (!rows[0]) throw new AuditForbiddenError('Wallet address not linked to a user')
  return rows[0]
}

function assertCanAccessContract(contract: ContractAccessRow, user: AuthUser): void {
  if (user.role === 'admin') return
  if (contract.client_id === user.id || contract.freelancer_id === user.id) return
  throw new AuditForbiddenError('Only contract participants or admins can access audit logs')
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ContractAuditLogService {
  /**
   * Create an immutable audit log entry.
   * Logs are append-only — no update or delete.
   */
  async createLog(input: unknown, walletAddress: string): Promise<ContractAuditLog> {
    const parsed = createLogSchema.safeParse(input)
    if (!parsed.success) {
      throw new AuditValidationError(parsed.error.issues[0]?.message ?? 'Invalid audit log payload')
    }

    const user = await getAuthUser(walletAddress)
    const data = parsed.data

    // Verify actor
    const actorUserId = data.actorUserId ?? user.id
    if (user.role !== 'admin' && actorUserId !== user.id) {
      throw new AuditForbiddenError('Only admins can create audit logs for other actors')
    }

    // Verify contract access
    const contracts = await sql<ContractAccessRow>`
      SELECT id, project_id, client_id, freelancer_id
        FROM contracts
       WHERE id = ${data.contractId}
       LIMIT 1
    `
    const contract = contracts[0]
    if (!contract) throw new AuditValidationError('contractId does not reference an existing contract')
    assertCanAccessContract(contract, user)

    // Validate actor user exists
    if (actorUserId !== user.id) {
      const actorRows = await sql`SELECT id FROM users WHERE id = ${actorUserId} LIMIT 1`
      if (!actorRows[0]) throw new AuditValidationError('actorUserId must reference an existing user')
    }

    // Validate milestone belongs to contract
    if (data.milestoneId) {
      const msRows = await sql`
        SELECT id FROM milestones WHERE id = ${data.milestoneId} AND contract_id = ${data.contractId} LIMIT 1
      `
      if (!msRows[0]) throw new AuditValidationError('milestoneId must belong to the provided contract')
    }

    // Validate dispute belongs to contract
    if (data.disputeId) {
      const dispRows = await sql`
        SELECT id FROM disputes WHERE id = ${data.disputeId} AND contract_id = ${data.contractId} LIMIT 1
      `
      if (!dispRows[0]) throw new AuditValidationError('disputeId must belong to the provided contract')
    }

    const rows = await sql<Record<string, unknown>>`
      INSERT INTO contract_audit_logs (
        contract_id,
        project_id,
        action,
        actor_user_id,
        actor_wallet,
        previous_state,
        new_state,
        milestone_id,
        dispute_id,
        amount,
        metadata
      )
      VALUES (
        ${data.contractId},
        ${contract.project_id},
        ${data.action},
        ${actorUserId},
        ${data.actorWallet},
        ${data.previousState ?? null},
        ${data.newState ?? null},
        ${data.milestoneId ?? null},
        ${data.disputeId ?? null},
        ${data.amount != null ? data.amount : null}::numeric,
        ${JSON.stringify(data.metadata ?? {})}::jsonb
      )
      RETURNING *
    `

    return rowToLog(rows[0])
  }

  /**
   * List audit logs with pagination and filtering.
   * Results scoped to the caller's accessible contracts.
   */
  async listLogs(
    query: unknown,
    walletAddress: string
  ): Promise<AuditLogPage> {
    const parsed = listLogsQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw new AuditValidationError(parsed.error.issues[0]?.message ?? 'Invalid query params')
    }

    const { limit, offset, contractId, projectId, action, actorUserId, fromDate, toDate } = parsed.data
    const user = await getAuthUser(walletAddress)

    const contractIdNum = contractId ? parseInt(contractId.replace(/-/g, '').slice(-12), 10) : null

    // Count total
    const countRows = await sql<{ total_count: number }>`
      SELECT COUNT(*)::int AS total_count
        FROM contract_audit_logs l
        JOIN contracts c ON c.id = l.contract_id
       WHERE (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id})
         AND (${contractIdNum ?? null}::integer IS NULL OR l.contract_id = ${contractIdNum ?? null}::integer)
         AND (${projectId ? parseInt(projectId.replace(/-/g, '').slice(-12), 10) : null}::integer IS NULL
              OR l.project_id = ${projectId ? parseInt(projectId.replace(/-/g, '').slice(-12), 10) : null}::integer)
         AND (${action ?? null}::varchar IS NULL OR l.action = ${action ?? null}::varchar)
         AND (${actorUserId ? parseInt(actorUserId.replace(/-/g, '').slice(-12), 10) : null}::integer IS NULL
              OR l.actor_user_id = ${actorUserId ? parseInt(actorUserId.replace(/-/g, '').slice(-12), 10) : null}::integer)
         AND (${fromDate ?? null}::timestamptz IS NULL OR l.created_at >= ${fromDate ?? null}::timestamptz)
         AND (${toDate ?? null}::timestamptz IS NULL OR l.created_at <= ${toDate ?? null}::timestamptz)
    `
    const total = countRows[0]?.total_count ?? 0

    const rows = total > offset
      ? await sql<Record<string, unknown>>`
          SELECT l.*
            FROM contract_audit_logs l
            JOIN contracts c ON c.id = l.contract_id
           WHERE (${user.role === 'admin'}::boolean
                  OR c.client_id = ${user.id}
                  OR c.freelancer_id = ${user.id})
             AND (${contractIdNum ?? null}::integer IS NULL OR l.contract_id = ${contractIdNum ?? null}::integer)
             AND (${projectId ? parseInt(projectId.replace(/-/g, '').slice(-12), 10) : null}::integer IS NULL
                  OR l.project_id = ${projectId ? parseInt(projectId.replace(/-/g, '').slice(-12), 10) : null}::integer)
             AND (${action ?? null}::varchar IS NULL OR l.action = ${action ?? null}::varchar)
             AND (${actorUserId ? parseInt(actorUserId.replace(/-/g, '').slice(-12), 10) : null}::integer IS NULL
                  OR l.actor_user_id = ${actorUserId ? parseInt(actorUserId.replace(/-/g, '').slice(-12), 10) : null}::integer)
             AND (${fromDate ?? null}::timestamptz IS NULL OR l.created_at >= ${fromDate ?? null}::timestamptz)
             AND (${toDate ?? null}::timestamptz IS NULL OR l.created_at <= ${toDate ?? null}::timestamptz)
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const logs = rows.map(rowToLog)
    const nextOffset = offset + logs.length < total ? offset + limit : null

    return {
      logs,
      pagination: { limit, offset, total, nextOffset, hasMore: nextOffset !== null },
    }
  }
}

export const contractAuditLogService = new ContractAuditLogService()
