/**
 * Payment Ledger Service
 *
 * Provides a reliable accounting layer over the existing
 * `escrow_transaction_logs` table.  Separates confirmed entries from
 * pending transactions, computes balance aggregates, and supports
 * filtering by contract, user, token, and date range.
 *
 * Key design decisions:
 *  • Reads from `escrow_transaction_logs` — no duplicate financial data.
 *  • Access-scoped: non-admins only see entries on contracts they
 *    participate in (as client, freelancer, actor, or counterparty).
 *  • Immutable: entries are never modified; corrections use compensating
 *    entries (new rows with `metadata.reversesEntryId` pointing to the
 *    original).
 *  • Dedup-aware: the DB-level unique index prevents duplicate blockchain
 *    events from creating duplicate rows.  The service also performs a
 *    pre-check to return a friendly 409 instead of a raw constraint error.
 */

import { sql } from '@/lib/db'
import { z } from 'zod'
import {
  LedgerValidationError,
  LedgerForbiddenError,
  LedgerDuplicateEntryError,
  LedgerQueryError,
} from './errors'
import type {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryStatus,
  LedgerPage,
  LedgerBalance,
  LedgerBalancePage,
  LedgerSummary,
  LedgerQueryFilters,
  LedgerBalanceQueryFilters,
  LedgerCsvExport,
} from './types'
import { toCSV, sanitizeFilename, type CSVColumn } from '@/lib/csv'

// ---------------------------------------------------------------------------
// Validation schemas & helpers
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

const entryTypes: LedgerEntryType[] = ['deposit', 'milestone_release', 'refund', 'dispute']
const entryStatuses: LedgerEntryStatus[] = ['pending', 'confirmed', 'failed']

interface AuthUser {
  id: string
  role: string
}

async function getAuthUser(walletAddress: string): Promise<AuthUser> {
  const rows = await sql`
    SELECT id, role::text AS role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `
  if (!rows[0]) {
    throw new LedgerForbiddenError('Authenticated wallet is not linked to a user')
  }
  return rows[0] as AuthUser
}

function normalizeLimit(value: string | null): number {
  if (!value) return 50
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new LedgerValidationError('limit must be an integer between 1 and 100')
  }
  return parsed
}

function normalizeOffset(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new LedgerValidationError('offset must be a non-negative integer')
  }
  return parsed
}

function rowToEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    projectId: row.project_id as string,
    milestoneId: (row.milestone_id as string) ?? null,
    disputeId: (row.dispute_id as string) ?? null,
    actorUserId: row.actor_user_id as string,
    counterpartyUserId: (row.counterparty_user_id as string) ?? null,
    entryType: row.transaction_type as LedgerEntryType,
    amount: row.amount != null ? String(row.amount) : null,
    currency: row.currency as string,
    transactionHash: (row.transaction_hash as string) ?? null,
    status: row.status as LedgerEntryStatus,
    description: (row.description as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    projectTitle: (row.project_title as string) ?? null,
    contractStatus: (row.contract_status as string) ?? null,
    actorWalletAddress: (row.actor_wallet_address as string) ?? null,
    counterpartyWalletAddress: (row.counterparty_wallet_address as string) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class PaymentLedgerService {
  // =========================================================================
  // listEntries — confirmed + pending + failed with filters & pagination
  // =========================================================================

  async listEntries(
    params: {
      walletAddress: string
      limitParam: string | null
      offsetParam: string | null
      contractId?: string | null
      userId?: string | null
      currency?: string | null
      entryType?: string | null
      status?: string | null
      dateFrom?: string | null
      dateTo?: string | null
    }
  ): Promise<LedgerPage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)
    const user = await getAuthUser(params.walletAddress)

    this.validateFilters(params)

    // Count total
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
         AND (${params.userId ?? null}::uuid IS NULL
              OR l.actor_user_id = ${params.userId ?? null}::uuid
              OR l.counterparty_user_id = ${params.userId ?? null}::uuid)
         AND (${params.currency ?? null}::text IS NULL OR l.currency = ${params.currency ?? null}::text)
         AND (${params.entryType ?? null}::text IS NULL
              OR l.transaction_type::text = ${params.entryType ?? null}::text)
         AND (${params.status ?? null}::text IS NULL OR l.status = ${params.status ?? null}::text)
         AND (${params.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${params.dateFrom ?? null}::timestamptz)
         AND (${params.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${params.dateTo ?? null}::timestamptz)
    `
    const total = countRows[0]?.total_count ?? 0

    const rows = total > offset
      ? await sql`
          SELECT l.*, p.title AS project_title, c.status AS contract_status,
                 ua.wallet_address AS actor_wallet_address,
                 uc.wallet_address AS counterparty_wallet_address
            FROM escrow_transaction_logs l
            JOIN contracts c ON c.id = l.contract_id
            LEFT JOIN projects p ON p.id = l.project_id
            LEFT JOIN users ua ON ua.id = l.actor_user_id
            LEFT JOIN users uc ON uc.id = l.counterparty_user_id
           WHERE (${user.role === 'admin'}::boolean
                  OR c.client_id = ${user.id}
                  OR c.freelancer_id = ${user.id}
                  OR l.actor_user_id = ${user.id}
                  OR l.counterparty_user_id = ${user.id})
             AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
             AND (${params.userId ?? null}::uuid IS NULL
                  OR l.actor_user_id = ${params.userId ?? null}::uuid
                  OR l.counterparty_user_id = ${params.userId ?? null}::uuid)
             AND (${params.currency ?? null}::text IS NULL OR l.currency = ${params.currency ?? null}::text)
             AND (${params.entryType ?? null}::text IS NULL
                  OR l.transaction_type::text = ${params.entryType ?? null}::text)
             AND (${params.status ?? null}::text IS NULL OR l.status = ${params.status ?? null}::text)
             AND (${params.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${params.dateFrom ?? null}::timestamptz)
             AND (${params.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${params.dateTo ?? null}::timestamptz)
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const entries = rows.map(rowToEntry)

    return {
      entries,
      pagination: {
        limit,
        offset,
        total,
        nextOffset: offset + limit < total ? offset + limit : null,
        hasMore: offset + limit < total,
      },
    }
  }

  // =========================================================================
  // listPending — pending-only entries, clearly separated from confirmed
  // =========================================================================

  async listPending(
    params: {
      walletAddress: string
      limitParam: string | null
      offsetParam: string | null
      contractId?: string | null
      userId?: string | null
      currency?: string | null
      entryType?: string | null
      dateFrom?: string | null
      dateTo?: string | null
    }
  ): Promise<LedgerPage> {
    return this.listEntries({
      ...params,
      status: 'pending',
    })
  }

  // =========================================================================
  // getBalances — funded / released / refunded / remaining per contract+currency
  // =========================================================================

  async getBalances(
    params: {
      walletAddress: string
      limitParam: string | null
      offsetParam: string | null
      contractId?: string | null
      userId?: string | null
      currency?: string | null
      dateFrom?: string | null
      dateTo?: string | null
    }
  ): Promise<LedgerBalancePage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)
    const user = await getAuthUser(params.walletAddress)

    this.validateFilters({ ...params, entryType: null, status: null })

    const countRows = await sql`
      SELECT COUNT(DISTINCT (l.contract_id, l.currency))::int AS total_count
        FROM escrow_transaction_logs l
        JOIN contracts c ON c.id = l.contract_id
       WHERE l.status = 'confirmed'
         AND l.transaction_type IN ('deposit', 'milestone_release', 'refund')
         AND (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id}
              OR l.actor_user_id = ${user.id}
              OR l.counterparty_user_id = ${user.id})
         AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.userId ?? null}::uuid IS NULL
              OR l.actor_user_id = ${params.userId ?? null}::uuid
              OR l.counterparty_user_id = ${params.userId ?? null}::uuid)
         AND (${params.currency ?? null}::text IS NULL OR l.currency = ${params.currency ?? null}::text)
         AND (${params.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${params.dateFrom ?? null}::timestamptz)
         AND (${params.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${params.dateTo ?? null}::timestamptz)
    `
    const total = countRows[0]?.total_count ?? 0

    const rows = total > offset
      ? await sql`
          SELECT
              l.contract_id,
              l.currency,
              COALESCE(SUM(CASE WHEN l.transaction_type = 'deposit' AND l.status = 'confirmed'
                          THEN l.amount ELSE 0 END), 0)::text AS funded,
              COALESCE(SUM(CASE WHEN l.transaction_type = 'milestone_release' AND l.status = 'confirmed'
                          THEN l.amount ELSE 0 END), 0)::text AS released,
              COALESCE(SUM(CASE WHEN l.transaction_type = 'refund' AND l.status = 'confirmed'
                          THEN l.amount ELSE 0 END), 0)::text AS refunded,
              COALESCE(SUM(CASE WHEN l.transaction_type IN ('deposit', 'milestone_release', 'refund')
                              AND l.status = 'pending'
                          THEN l.amount ELSE 0 END), 0)::text AS pending,
              COUNT(*)::int AS entry_count
            FROM escrow_transaction_logs l
            JOIN contracts c ON c.id = l.contract_id
           WHERE l.transaction_type IN ('deposit', 'milestone_release', 'refund')
             AND (${user.role === 'admin'}::boolean
                  OR c.client_id = ${user.id}
                  OR c.freelancer_id = ${user.id}
                  OR l.actor_user_id = ${user.id}
                  OR l.counterparty_user_id = ${user.id})
             AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
             AND (${params.userId ?? null}::uuid IS NULL
                  OR l.actor_user_id = ${params.userId ?? null}::uuid
                  OR l.counterparty_user_id = ${params.userId ?? null}::uuid)
             AND (${params.currency ?? null}::text IS NULL OR l.currency = ${params.currency ?? null}::text)
             AND (${params.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${params.dateFrom ?? null}::timestamptz)
             AND (${params.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${params.dateTo ?? null}::timestamptz)
           GROUP BY l.contract_id, l.currency
           ORDER BY l.contract_id, l.currency
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const balances: LedgerBalance[] = rows.map((row: Record<string, unknown>) => {
      const funded = row.funded ? String(row.funded) : '0'
      const released = row.released ? String(row.released) : '0'
      const refunded = row.refunded ? String(row.refunded) : '0'
      const pending = row.pending ? String(row.pending) : '0'
      return {
        contractId: (row.contract_id as string) ?? null,
        currency: row.currency as string,
        funded,
        released,
        refunded,
        pending,
        remaining: (Number(funded) - Number(released) - Number(refunded)).toFixed(6),
        entryCount: row.entry_count as number,
      }
    })

    return {
      balances,
      pagination: {
        limit,
        offset,
        total,
        nextOffset: offset + limit < total ? offset + limit : null,
        hasMore: offset + limit < total,
      },
    }
  }

  // =========================================================================
  // getSummary — global balance summary across all currencies
  // =========================================================================

  async getSummary(
    params: {
      walletAddress: string
      contractId?: string | null
      currency?: string | null
      dateFrom?: string | null
      dateTo?: string | null
    }
  ): Promise<LedgerSummary> {
    const user = await getAuthUser(params.walletAddress)
    this.validateFilters({ ...params, entryType: null, status: null, userId: null })

    const rows = await sql`
      SELECT
          l.currency,
          COALESCE(SUM(CASE WHEN l.transaction_type = 'deposit' AND l.status = 'confirmed'
                      THEN l.amount ELSE 0 END), 0)::text AS funded,
          COALESCE(SUM(CASE WHEN l.transaction_type = 'milestone_release' AND l.status = 'confirmed'
                      THEN l.amount ELSE 0 END), 0)::text AS released,
          COALESCE(SUM(CASE WHEN l.transaction_type = 'refund' AND l.status = 'confirmed'
                      THEN l.amount ELSE 0 END), 0)::text AS refunded,
          COALESCE(SUM(CASE WHEN l.transaction_type IN ('deposit', 'milestone_release', 'refund')
                          AND l.status = 'pending'
                      THEN l.amount ELSE 0 END), 0)::text AS pending,
          COUNT(CASE WHEN l.status = 'confirmed' THEN 1 END)::int AS confirmed_count,
          COUNT(CASE WHEN l.status = 'pending' THEN 1 END)::int AS pending_count,
          COUNT(CASE WHEN l.status = 'failed' THEN 1 END)::int AS failed_count
        FROM escrow_transaction_logs l
        JOIN contracts c ON c.id = l.contract_id
       WHERE (${user.role === 'admin'}::boolean
              OR c.client_id = ${user.id}
              OR c.freelancer_id = ${user.id}
              OR l.actor_user_id = ${user.id}
              OR l.counterparty_user_id = ${user.id})
         AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.currency ?? null}::text IS NULL OR l.currency = ${params.currency ?? null}::text)
         AND (${params.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${params.dateFrom ?? null}::timestamptz)
         AND (${params.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${params.dateTo ?? null}::timestamptz)
       GROUP BY l.currency
       ORDER BY l.currency
    `

    let totalFunded = 0
    let totalReleased = 0
    let totalRefunded = 0
    let totalPending = 0
    let confirmedEntries = 0
    let pendingEntries = 0
    let failedEntries = 0
    const currencies: LedgerSummary['currencies'] = []

    for (const row of rows as Record<string, unknown>[]) {
      const funded = Number(row.funded ?? 0)
      const released = Number(row.released ?? 0)
      const refunded = Number(row.refunded ?? 0)
      const pending = Number(row.pending ?? 0)

      totalFunded += funded
      totalReleased += released
      totalRefunded += refunded
      totalPending += pending
      confirmedEntries += row.confirmed_count as number
      pendingEntries += row.pending_count as number
      failedEntries += row.failed_count as number

      currencies.push({
        currency: row.currency as string,
        funded: funded.toFixed(6),
        released: released.toFixed(6),
        refunded: refunded.toFixed(6),
        remaining: (funded - released - refunded).toFixed(6),
        pending: pending.toFixed(6),
      })
    }

    return {
      totalFunded: totalFunded.toFixed(6),
      totalReleased: totalReleased.toFixed(6),
      totalRefunded: totalRefunded.toFixed(6),
      totalRemaining: (totalFunded - totalReleased - totalRefunded).toFixed(6),
      totalPending: totalPending.toFixed(6),
      confirmedEntries,
      pendingEntries,
      failedEntries,
      currencies,
    }
  }

  // =========================================================================
  // exportCsv — generate CSV string of ledger entries
  // =========================================================================

  async exportCsv(
    params: {
      walletAddress: string
      contractId?: string | null
      userId?: string | null
      currency?: string | null
      entryType?: string | null
      status?: string | null
      dateFrom?: string | null
      dateTo?: string | null
    }
  ): Promise<LedgerCsvExport> {
    // Reuse listEntries with a large page size to fetch all matching rows
    const page = await this.listEntries({
      ...params,
      limitParam: '100',
      offsetParam: '0',
    })

    const allEntries: LedgerEntry[] = [...page.entries]
    let currentOffset = 0
    while (page.pagination.hasMore) {
      currentOffset += 100
      const nextPage = await this.listEntries({
        ...params,
        limitParam: '100',
        offsetParam: String(currentOffset),
      })
      allEntries.push(...nextPage.entries)
      if (!nextPage.pagination.hasMore) break
    }

    const columns: CSVColumn<LedgerEntry>[] = [
      { key: 'id', header: 'ID' },
      { key: 'contractId', header: 'Contract ID' },
      { key: 'projectId', header: 'Project ID' },
      { key: 'projectTitle', header: 'Project' },
      { key: 'entryType', header: 'Type' },
      { key: 'amount', header: 'Amount' },
      { key: 'currency', header: 'Currency' },
      { key: 'status', header: 'Status' },
      { key: 'transactionHash', header: 'Transaction Hash' },
      { key: 'actorWalletAddress', header: 'Actor Wallet' },
      { key: 'counterpartyWalletAddress', header: 'Counterparty Wallet' },
      { key: 'description', header: 'Description' },
      { key: 'createdAt', header: 'Created At' },
    ]

    const csv = toCSV(allEntries, { columns })
    const datePart = new Date().toISOString().slice(0, 10)
    const filename = sanitizeFilename(`ledger_export_${datePart}.csv`)

    return { csv, filename, totalRows: allEntries.length }
  }

  // =========================================================================
  // recordEntry — insert a new ledger entry with duplicate detection
  // =========================================================================

  async recordEntry(input: {
    walletAddress: string
    contractId: string
    milestoneId?: string
    disputeId?: string
    actorUserId?: string
    counterpartyUserId?: string
    entryType: LedgerEntryType
    amount?: string
    currency?: string
    transactionHash?: string
    status?: LedgerEntryStatus
    description?: string
    metadata?: Record<string, unknown>
  }): Promise<LedgerEntry> {
    const user = await getAuthUser(input.walletAddress)

    // Verify contract exists and user has access
    const contracts = await sql`
      SELECT id, project_id, client_id, freelancer_id, currency
        FROM contracts
       WHERE id = ${input.contractId}
       LIMIT 1
    `
    const contract = contracts[0] as
      | { id: string; project_id: string; client_id: string; freelancer_id: string; currency: string }
      | undefined
    if (!contract) {
      throw new LedgerValidationError('contractId does not reference an existing contract')
    }

    if (user.role !== 'admin' && contract.client_id !== user.id && contract.freelancer_id !== user.id) {
      throw new LedgerForbiddenError('Only contract participants or admins can create ledger entries')
    }

    // --- Duplicate detection (pre-check before insert) ---
    if (input.transactionHash) {
      const existing = await sql`
        SELECT id FROM escrow_transaction_logs
         WHERE transaction_hash = ${input.transactionHash}
           AND transaction_type = ${input.entryType}::escrow_transaction_type
           AND contract_id = ${input.contractId}
         LIMIT 1
      `
      if (existing[0]) {
        throw new LedgerDuplicateEntryError(existing[0].id as string)
      }
    }

    const actorUserId = input.actorUserId ?? user.id
    if (user.role !== 'admin' && actorUserId !== user.id) {
      throw new LedgerForbiddenError('Only admins can create entries for another actor')
    }

    try {
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
          ${input.contractId},
          ${contract.project_id},
          ${input.milestoneId ?? null},
          ${input.disputeId ?? null},
          ${actorUserId},
          ${input.counterpartyUserId ?? null},
          ${input.entryType}::escrow_transaction_type,
          ${input.amount ?? null}::numeric,
          ${input.currency ?? contract.currency},
          ${input.transactionHash ?? null},
          ${input.status ?? 'confirmed'},
          ${input.description ?? null},
          ${JSON.stringify(input.metadata ?? {})}::jsonb
        )
        RETURNING *
      `

      // Fetch with joins for the full entry
      const fullRows = await sql`
        SELECT l.*, p.title AS project_title, c.status AS contract_status,
               ua.wallet_address AS actor_wallet_address,
               uc.wallet_address AS counterparty_wallet_address
          FROM escrow_transaction_logs l
          JOIN contracts c ON c.id = l.contract_id
          LEFT JOIN projects p ON p.id = l.project_id
          LEFT JOIN users ua ON ua.id = l.actor_user_id
          LEFT JOIN users uc ON uc.id = l.counterparty_user_id
         WHERE l.id = ${rows[0].id}
         LIMIT 1
      `
      return rowToEntry(fullRows[0])
    } catch (err) {
      // Catch unique constraint violation (23505) as a friendly duplicate error
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new LedgerDuplicateEntryError('unknown')
      }
      throw err
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private validateFilters(params: {
    contractId?: string | null
    userId?: string | null
    currency?: string | null
    entryType?: string | null
    status?: string | null
    dateFrom?: string | null
    dateTo?: string | null
  }): void {
    if (params.contractId && !uuidSchema.safeParse(params.contractId).success) {
      throw new LedgerValidationError('contractId must be a valid UUID')
    }
    if (params.userId && !uuidSchema.safeParse(params.userId).success) {
      throw new LedgerValidationError('userId must be a valid UUID')
    }
    if (params.entryType && !entryTypes.includes(params.entryType as LedgerEntryType)) {
      throw new LedgerValidationError('entryType is not a supported value')
    }
    if (params.status && !entryStatuses.includes(params.status as LedgerEntryStatus)) {
      throw new LedgerValidationError('status is not a supported value')
    }
    if (params.dateFrom && Number.isNaN(new Date(params.dateFrom).getTime())) {
      throw new LedgerValidationError('dateFrom must be a valid ISO date')
    }
    if (params.dateTo && Number.isNaN(new Date(params.dateTo).getTime())) {
      throw new LedgerValidationError('dateTo must be a valid ISO date')
    }
  }
}

// ---------------------------------------------------------------------------
// Exported singleton
// ---------------------------------------------------------------------------

export const paymentLedgerService = new PaymentLedgerService()
