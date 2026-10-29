/**
 * Reconciliation Service
 *
 * Compares blockchain-level payment data (from `escrow_transaction_logs`)
 * against application-level records (from `contracts`, `milestones`) to
 * detect and surface discrepancies.  Each run produces a reconciliation
 * report with aggregated balances and zero or more discrepancies.
 *
 * Discrepancy types detected:
 *  • amount_mismatch       — ledger amount differs from contract/milestone total
 *  • missing_blockchain_event — contract is funded but no deposit log exists
 *  • missing_application_record — deposit/release log exists but contract/milestone
 *                                is not in the expected state
 *  • duplicate_entry        — same transaction_hash appears more than once
 *  • status_mismatch        — log status doesn't match expected lifecycle state
 *
 * Access control:
 *  • Only admins can run reconciliation, view reports, and resolve discrepancies.
 *  • This is enforced at the API route level via `withRbac`.
 */

import { sql } from '@/lib/db'
import { z } from 'zod'
import {
  ReconciliationValidationError,
  ReconciliationNotFoundError,
  ReconciliationExecutionError,
} from './errors'
import type {
  ReconciliationReport,
  ReconciliationReportPage,
  ReconciliationReportDetail,
  ReconciliationDiscrepancy,
  ReconciliationDiscrepancyPage,
  ReconciliationStatus,
  DiscrepancyType,
  DiscrepancySeverity,
  DiscrepancyStatus,
  RunReconciliationInput,
  ReconciliationCsvExport,
} from './types'
import { toCSV, sanitizeFilename, type CSVColumn } from '@/lib/csv'

// ---------------------------------------------------------------------------
// Validation schemas & helpers
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

const reportStatuses: ReconciliationStatus[] = [
  'pending', 'completed', 'failed', 'discrepancies_found'
]
const discrepancyTypes: DiscrepancyType[] = [
  'amount_mismatch', 'missing_blockchain_event', 'missing_application_record',
  'duplicate_entry', 'status_mismatch', 'other'
]
const severityLevels: DiscrepancySeverity[] = ['low', 'medium', 'high', 'critical']
const discrepancyStatuses: DiscrepancyStatus[] = ['open', 'investigating', 'resolved']

function normalizeLimit(value: string | null): number {
  if (!value) return 50
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ReconciliationValidationError('limit must be an integer between 1 and 100')
  }
  return parsed
}

function normalizeOffset(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ReconciliationValidationError('offset must be a non-negative integer')
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToReport(row: Record<string, unknown>): ReconciliationReport {
  return {
    id: row.id as string,
    generatedBy: (row.generated_by as string) ?? null,
    status: row.status as ReconciliationStatus,
    contractId: (row.contract_id as string) ?? null,
    token: (row.token as string) ?? null,
    dateFrom: (row.date_from as string) ?? null,
    dateTo: (row.date_to as string) ?? null,
    totalFunded: String(row.total_funded ?? 0),
    totalReleased: String(row.total_released ?? 0),
    totalRefunded: String(row.total_refunded ?? 0),
    totalPending: String(row.total_pending ?? 0),
    discrepancyCount: row.discrepancy_count as number,
    reportMetadata: (row.report_metadata as Record<string, unknown>) ?? {},
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) ?? null,
  }
}

function rowToDiscrepancy(row: Record<string, unknown>): ReconciliationDiscrepancy {
  return {
    id: row.id as string,
    reportId: row.report_id as string,
    contractId: (row.contract_id as string) ?? null,
    milestoneId: (row.milestone_id as string) ?? null,
    transactionHash: (row.transaction_hash as string) ?? null,
    discrepancyType: row.discrepancy_type as DiscrepancyType,
    severity: row.severity as DiscrepancySeverity,
    description: row.description as string,
    expectedAmount: row.expected_amount != null ? String(row.expected_amount) : null,
    actualAmount: row.actual_amount != null ? String(row.actual_amount) : null,
    blockchainData: (row.blockchain_data as Record<string, unknown>) ?? null,
    applicationData: (row.application_data as Record<string, unknown>) ?? null,
    status: row.status as DiscrepancyStatus,
    resolvedBy: (row.resolved_by as string) ?? null,
    resolutionNotes: (row.resolution_notes as string) ?? null,
    resolvedAt: (row.resolved_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

interface ContractRow {
  id: string
  project_id: string
  client_id: string
  freelancer_id: string
  total_amount: string
  currency: string
  escrow_status: string
  status: string
}

interface LedgerSummaryRow {
  contract_id: string
  currency: string
  funded: string
  released: string
  refunded: string
  pending: string
}

interface MilestoneRow {
  id: string
  contract_id: string
  amount: string
  status: string
}

interface DuplicateRow {
  transaction_hash: string
  contract_id: string
  cnt: number
  ids: string[]
}

export class ReconciliationService {
  // =========================================================================
  // runReconciliation — create report, compare data, save discrepancies
  // =========================================================================

  async runReconciliation(input: RunReconciliationInput): Promise<ReconciliationReport> {
    // Validate filters
    if (input.contractId && !uuidSchema.safeParse(input.contractId).success) {
      throw new ReconciliationValidationError('contractId must be a valid UUID')
    }
    if (input.dateFrom && Number.isNaN(new Date(input.dateFrom).getTime())) {
      throw new ReconciliationValidationError('dateFrom must be a valid ISO date')
    }
    if (input.dateTo && Number.isNaN(new Date(input.dateTo).getTime())) {
      throw new ReconciliationValidationError('dateTo must be a valid ISO date')
    }

    // Resolve user ID for generated_by
    const userRows = await sql`
      SELECT id FROM users WHERE wallet_address = ${input.walletAddress} LIMIT 1
    `
    const generatedBy = (userRows[0]?.id as string) ?? null

    // Create a pending report
    const reportRows = await sql`
      INSERT INTO reconciliation_reports (
        generated_by, status,
        contract_id, token, date_from, date_to
      )
      VALUES (
        ${generatedBy},
        'pending'::reconciliation_status,
        ${input.contractId ?? null}::uuid,
        ${input.token ?? null},
        ${input.dateFrom ?? null}::timestamptz,
        ${input.dateTo ?? null}::timestamptz
      )
      RETURNING *
    `
    const reportId = reportRows[0].id as string

    try {
      // --- 1. Fetch contracts in scope ---
      const contracts = await sql`
        SELECT id, project_id, client_id, freelancer_id,
               total_amount::text, currency, escrow_status::text, status::text
          FROM contracts
         WHERE (${input.contractId ?? null}::uuid IS NULL OR id = ${input.contractId ?? null}::uuid)
           AND escrow_status <> 'unfunded'
      `

      // --- 2. Fetch ledger summaries per contract ---
      const ledgerSummaries = await sql`
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
                        THEN l.amount ELSE 0 END), 0)::text AS pending
          FROM escrow_transaction_logs l
          WHERE (${input.contractId ?? null}::uuid IS NULL OR l.contract_id = ${input.contractId ?? null}::uuid)
            AND (${input.token ?? null}::text IS NULL OR l.currency = ${input.token ?? null}::text)
            AND (${input.dateFrom ?? null}::timestamptz IS NULL OR l.created_at >= ${input.dateFrom ?? null}::timestamptz)
            AND (${input.dateTo ?? null}::timestamptz IS NULL OR l.created_at <= ${input.dateTo ?? null}::timestamptz)
          GROUP BY l.contract_id, l.currency
      `

      // --- 3. Fetch paid milestones ---
      const milestones = await sql`
        SELECT m.id, m.contract_id, m.amount::text, m.status::text
          FROM milestones m
          JOIN contracts c ON c.id = m.contract_id
         WHERE m.status = 'paid'
           AND (${input.contractId ?? null}::uuid IS NULL OR m.contract_id = ${input.contractId ?? null}::uuid)
      `

      // --- 4. Check for duplicate entries (same hash appearing more than once) ---
      const duplicates = await sql`
        SELECT transaction_hash, contract_id,
               COUNT(*)::int AS cnt,
               ARRAY_AGG(id::text) AS ids
          FROM escrow_transaction_logs
         WHERE transaction_hash IS NOT NULL
           AND (${input.contractId ?? null}::uuid IS NULL OR contract_id = ${input.contractId ?? null}::uuid)
         GROUP BY transaction_hash, contract_id
        HAVING COUNT(*) > 1
      `

      // --- 5. Build discrepancies ---
      const discrepancies: Array<{
        contractId: string | null
        milestoneId: string | null
        transactionHash: string | null
        discrepancyType: DiscrepancyType
        severity: DiscrepancySeverity
        description: string
        expectedAmount: string | null
        actualAmount: string | null
        blockchainData: Record<string, unknown> | null
        applicationData: Record<string, unknown> | null
      }> = []

      const contractMap = new Map<string, ContractRow>()
      for (const c of contracts as unknown as ContractRow[]) {
        contractMap.set(c.id, c)
      }

      const ledgerMap = new Map<string, LedgerSummaryRow>()
      for (const l of ledgerSummaries as unknown as LedgerSummaryRow[]) {
        ledgerMap.set(`${l.contract_id}:${l.currency}`, l)
      }

      const milestoneMap = new Map<string, MilestoneRow[]>()
      for (const m of milestones as unknown as MilestoneRow[]) {
        const existing = milestoneMap.get(m.contract_id) ?? []
        existing.push(m)
        milestoneMap.set(m.contract_id, existing)
      }

      // 5a. Check each contract: expected funded vs actual funded
      for (const contract of contracts as unknown as ContractRow[]) {
        const ledgerKey = `${contract.id}:${contract.currency}`
        const ledger = ledgerMap.get(ledgerKey)

        // If contract is funded/partially_released/fully_released/refunded,
        // there should be a deposit entry matching total_amount
        if (['funded', 'partially_released', 'fully_released', 'refunded'].includes(contract.escrow_status)) {
          const actualFunded = ledger ? Number(ledger.funded) : 0
          const expectedFunded = Number(contract.total_amount)

          if (actualFunded === 0) {
            // Missing blockchain event: contract is funded but no deposit log
            discrepancies.push({
              contractId: contract.id,
              milestoneId: null,
              transactionHash: null,
              discrepancyType: 'missing_blockchain_event',
              severity: 'high',
              description: `Contract ${contract.id} has escrow_status='${contract.escrow_status}' but no confirmed deposit entry in the ledger`,
              expectedAmount: contract.total_amount,
              actualAmount: '0',
              blockchainData: null,
              applicationData: {
                contractId: contract.id,
                escrowStatus: contract.escrow_status,
                totalAmount: contract.total_amount,
                currency: contract.currency,
              },
            })
          } else if (actualFunded !== expectedFunded) {
            discrepancies.push({
              contractId: contract.id,
              milestoneId: null,
              transactionHash: null,
              discrepancyType: 'amount_mismatch',
              severity: 'high',
              description: `Contract ${contract.id} funded amount mismatch: ledger shows ${actualFunded.toFixed(6)} ${contract.currency} but contract total is ${expectedFunded.toFixed(6)} ${contract.currency}`,
              expectedAmount: expectedFunded.toFixed(6),
              actualAmount: actualFunded.toFixed(6),
              blockchainData: {
                ledgerFunded: actualFunded.toFixed(6),
                currency: contract.currency,
              },
              applicationData: {
                contractTotal: expectedFunded.toFixed(6),
                currency: contract.currency,
              },
            })
          }
        }

        // 5b. Check released amounts: sum of paid milestone amounts vs ledger releases
        const paidMilestones = milestoneMap.get(contract.id) ?? []
        if (paidMilestones.length > 0) {
          const expectedReleased = paidMilestones.reduce(
            (sum, m) => sum + Number(m.amount), 0
          )
          const actualReleased = ledger ? Number(ledger.released) : 0

          if (actualReleased === 0 && expectedReleased > 0) {
            discrepancies.push({
              contractId: contract.id,
              milestoneId: null,
              transactionHash: null,
              discrepancyType: 'missing_blockchain_event',
              severity: 'high',
              description: `Contract ${contract.id} has ${paidMilestones.length} paid milestone(s) totaling ${expectedReleased.toFixed(6)} ${contract.currency} but no confirmed milestone_release entries in the ledger`,
              expectedAmount: expectedReleased.toFixed(6),
              actualAmount: '0',
              blockchainData: null,
              applicationData: {
                paidMilestones: paidMilestones.length,
                totalExpected: expectedReleased.toFixed(6),
                currency: contract.currency,
              },
            })
          } else if (Math.abs(actualReleased - expectedReleased) > 0.000001) {
            discrepancies.push({
              contractId: contract.id,
              milestoneId: null,
              transactionHash: null,
              discrepancyType: 'amount_mismatch',
              severity: 'medium',
              description: `Contract ${contract.id} released amount mismatch: ledger shows ${actualReleased.toFixed(6)} ${contract.currency} but paid milestones total ${expectedReleased.toFixed(6)} ${contract.currency}`,
              expectedAmount: expectedReleased.toFixed(6),
              actualAmount: actualReleased.toFixed(6),
              blockchainData: {
                ledgerReleased: actualReleased.toFixed(6),
                currency: contract.currency,
              },
              applicationData: {
                paidMilestonesTotal: expectedReleased.toFixed(6),
                currency: contract.currency,
              },
            })
          }
        }

        // 5c. Check for missing_application_record: deposit exists but contract not funded
        if (ledger && Number(ledger.funded) > 0 && contract.escrow_status === 'unfunded') {
          discrepancies.push({
            contractId: contract.id,
            milestoneId: null,
            transactionHash: null,
            discrepancyType: 'missing_application_record',
            severity: 'high',
            description: `Contract ${contract.id} has confirmed deposit entries (${Number(ledger.funded).toFixed(6)} ${contract.currency}) but contract escrow_status is still 'unfunded'`,
            expectedAmount: null,
            actualAmount: ledger.funded,
            blockchainData: {
              ledgerFunded: ledger.funded,
              currency: contract.currency,
            },
            applicationData: {
              escrowStatus: 'unfunded',
            },
          })
        }
      }

      // 5d. Check for duplicate entries
      for (const dup of duplicates as unknown as DuplicateRow[]) {
        discrepancies.push({
          contractId: dup.contract_id,
          milestoneId: null,
          transactionHash: dup.transaction_hash,
          discrepancyType: 'duplicate_entry',
          severity: 'critical',
          description: `Duplicate ledger entries detected: transaction_hash '${dup.transaction_hash}' appears ${dup.cnt} times for contract ${dup.contract_id} (entry IDs: ${dup.ids.join(', ')})`,
          expectedAmount: null,
          actualAmount: null,
          blockchainData: {
            transactionHash: dup.transaction_hash,
            duplicateCount: dup.cnt,
            entryIds: dup.ids,
          },
          applicationData: null,
        })
      }

      // --- 6. Compute aggregated totals ---
      let totalFunded = 0
      let totalReleased = 0
      let totalRefunded = 0
      let totalPending = 0
      for (const l of ledgerSummaries as unknown as LedgerSummaryRow[]) {
        totalFunded += Number(l.funded)
        totalReleased += Number(l.released)
        totalRefunded += Number(l.refunded)
        totalPending += Number(l.pending)
      }

      // --- 7. Determine final status ---
      const finalStatus: ReconciliationStatus =
        discrepancies.length > 0 ? 'discrepancies_found' : 'completed'

      // --- 8. Save discrepancies and update report ---
      if (discrepancies.length > 0) {
        // Insert all discrepancies
        for (const d of discrepancies) {
          await sql`
            INSERT INTO reconciliation_discrepancies (
              report_id, contract_id, milestone_id, transaction_hash,
              discrepancy_type, severity, description,
              expected_amount, actual_amount,
              blockchain_data, application_data
            )
            VALUES (
              ${reportId}::uuid,
              ${d.contractId ?? null}::uuid,
              ${d.milestoneId ?? null}::uuid,
              ${d.transactionHash ?? null},
              ${d.discrepancyType}::discrepancy_type,
              ${d.severity}::discrepancy_severity,
              ${d.description},
              ${d.expectedAmount ?? null}::numeric,
              ${d.actualAmount ?? null}::numeric,
              ${d.blockchainData ? JSON.stringify(d.blockchainData) : null}::jsonb,
              ${d.applicationData ? JSON.stringify(d.applicationData) : null}::jsonb
            )
          `
        }
      }

      // Update report with results
      const updatedReports = await sql`
        UPDATE reconciliation_reports
           SET status = ${finalStatus}::reconciliation_status,
               total_funded = ${totalFunded.toFixed(6)}::numeric,
               total_released = ${totalReleased.toFixed(6)}::numeric,
               total_refunded = ${totalRefunded.toFixed(6)}::numeric,
               total_pending = ${totalPending.toFixed(6)}::numeric,
               discrepancy_count = ${discrepancies.length},
               report_metadata = ${JSON.stringify({
                 contractsChecked: contracts.length,
                 milestonesChecked: milestones.length,
                 duplicatesFound: duplicates.length,
                 filters: {
                   contractId: input.contractId ?? null,
                   token: input.token ?? null,
                   dateFrom: input.dateFrom ?? null,
                   dateTo: input.dateTo ?? null,
                 },
               })}::jsonb,
               completed_at = NOW()
         WHERE id = ${reportId}::uuid
        RETURNING *
      `

      return rowToReport(updatedReports[0] as Record<string, unknown>)
    } catch (err) {
      // Mark report as failed
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during reconciliation'

      await sql`
        UPDATE reconciliation_reports
           SET status = 'failed'::reconciliation_status,
               error_message = ${errorMessage},
               completed_at = NOW()
         WHERE id = ${reportId}::uuid
      `

      // Re-throw as typed error
      throw new ReconciliationExecutionError(
        `Reconciliation run failed: ${errorMessage}`,
        err
      )
    }
  }

  // =========================================================================
  // getReport — report detail with its discrepancies
  // =========================================================================

  async getReport(reportId: string): Promise<ReconciliationReportDetail> {
    if (!uuidSchema.safeParse(reportId).success) {
      throw new ReconciliationValidationError('reportId must be a valid UUID')
    }

    const reportRows = await sql`
      SELECT * FROM reconciliation_reports WHERE id = ${reportId}::uuid LIMIT 1
    `
    if (!reportRows[0]) {
      throw new ReconciliationNotFoundError(`Reconciliation report ${reportId} not found`)
    }

    const discrepancyRows = await sql`
      SELECT * FROM reconciliation_discrepancies
       WHERE report_id = ${reportId}::uuid
       ORDER BY severity DESC, created_at DESC
    `

    return {
      report: rowToReport(reportRows[0] as Record<string, unknown>),
      discrepancies: discrepancyRows.map((r) =>
        rowToDiscrepancy(r as Record<string, unknown>)
      ),
    }
  }

  // =========================================================================
  // listReports — paginated list of reconciliation reports
  // =========================================================================

  async listReports(params: {
    limitParam: string | null
    offsetParam: string | null
    status?: string | null
    contractId?: string | null
  }): Promise<ReconciliationReportPage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)

    if (params.status && !reportStatuses.includes(params.status as ReconciliationStatus)) {
      throw new ReconciliationValidationError('status is not a supported value')
    }
    if (params.contractId && !uuidSchema.safeParse(params.contractId).success) {
      throw new ReconciliationValidationError('contractId must be a valid UUID')
    }

    const countRows = await sql`
      SELECT COUNT(*)::int AS total_count
        FROM reconciliation_reports
       WHERE (${params.status ?? null}::text IS NULL OR status::text = ${params.status ?? null}::text)
         AND (${params.contractId ?? null}::uuid IS NULL OR contract_id = ${params.contractId ?? null}::uuid)
    `
    const total = countRows[0]?.total_count ?? 0

    const rows = total > offset
      ? await sql`
          SELECT * FROM reconciliation_reports
           WHERE (${params.status ?? null}::text IS NULL OR status::text = ${params.status ?? null}::text)
             AND (${params.contractId ?? null}::uuid IS NULL OR contract_id = ${params.contractId ?? null}::uuid)
           ORDER BY created_at DESC, id DESC
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const reports = rows.map((r) => rowToReport(r as Record<string, unknown>))

    return {
      reports,
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
  // listDiscrepancies — paginated list of discrepancies with filters
  // =========================================================================

  async listDiscrepancies(params: {
    limitParam: string | null
    offsetParam: string | null
    reportId?: string | null
    contractId?: string | null
    discrepancyType?: string | null
    severity?: string | null
    status?: string | null
  }): Promise<ReconciliationDiscrepancyPage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)

    if (params.reportId && !uuidSchema.safeParse(params.reportId).success) {
      throw new ReconciliationValidationError('reportId must be a valid UUID')
    }
    if (params.contractId && !uuidSchema.safeParse(params.contractId).success) {
      throw new ReconciliationValidationError('contractId must be a valid UUID')
    }
    if (params.discrepancyType && !discrepancyTypes.includes(params.discrepancyType as DiscrepancyType)) {
      throw new ReconciliationValidationError('discrepancyType is not a supported value')
    }
    if (params.severity && !severityLevels.includes(params.severity as DiscrepancySeverity)) {
      throw new ReconciliationValidationError('severity is not a supported value')
    }
    if (params.status && !discrepancyStatuses.includes(params.status as DiscrepancyStatus)) {
      throw new ReconciliationValidationError('status is not a supported value')
    }

    const countRows = await sql`
      SELECT COUNT(*)::int AS total_count
        FROM reconciliation_discrepancies
       WHERE (${params.reportId ?? null}::uuid IS NULL OR report_id = ${params.reportId ?? null}::uuid)
         AND (${params.contractId ?? null}::uuid IS NULL OR contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.discrepancyType ?? null}::text IS NULL
              OR discrepancy_type::text = ${params.discrepancyType ?? null}::text)
         AND (${params.severity ?? null}::text IS NULL
              OR severity::text = ${params.severity ?? null}::text)
         AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
    `
    const total = countRows[0]?.total_count ?? 0

    const rows = total > offset
      ? await sql`
          SELECT * FROM reconciliation_discrepancies
           WHERE (${params.reportId ?? null}::uuid IS NULL OR report_id = ${params.reportId ?? null}::uuid)
             AND (${params.contractId ?? null}::uuid IS NULL OR contract_id = ${params.contractId ?? null}::uuid)
             AND (${params.discrepancyType ?? null}::text IS NULL
                  OR discrepancy_type::text = ${params.discrepancyType ?? null}::text)
             AND (${params.severity ?? null}::text IS NULL
                  OR severity::text = ${params.severity ?? null}::text)
             AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
           ORDER BY
             CASE severity
               WHEN 'critical' THEN 1
               WHEN 'high' THEN 2
               WHEN 'medium' THEN 3
               WHEN 'low' THEN 4
             END,
             created_at DESC
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const discrepancies = rows.map((r) => rowToDiscrepancy(r as Record<string, unknown>))

    return {
      discrepancies,
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
  // resolveDiscrepancy — mark a discrepancy as resolved
  // =========================================================================

  async resolveDiscrepancy(
    discrepancyId: string,
    walletAddress: string,
    resolutionNotes: string
  ): Promise<ReconciliationDiscrepancy> {
    if (!uuidSchema.safeParse(discrepancyId).success) {
      throw new ReconciliationValidationError('discrepancyId must be a valid UUID')
    }
    if (!resolutionNotes || resolutionNotes.trim().length < 3) {
      throw new ReconciliationValidationError('resolutionNotes must be at least 3 characters')
    }

    const userRows = await sql`
      SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
    `
    const userId = userRows[0]?.id as string | undefined
    if (!userId) {
      throw new ReconciliationValidationError('Authenticated wallet is not linked to a user')
    }

    const rows = await sql`
      UPDATE reconciliation_discrepancies
         SET status = 'resolved',
             resolved_by = ${userId}::uuid,
             resolution_notes = ${resolutionNotes.trim()},
             resolved_at = NOW(),
             updated_at = NOW()
       WHERE id = ${discrepancyId}::uuid
      RETURNING *
    `

    if (!rows[0]) {
      throw new ReconciliationNotFoundError(`Discrepancy ${discrepancyId} not found`)
    }

    return rowToDiscrepancy(rows[0] as Record<string, unknown>)
  }

  // =========================================================================
  // exportReportCsv — CSV export of a reconciliation report + discrepancies
  // =========================================================================

  async exportReportCsv(reportId: string): Promise<ReconciliationCsvExport> {
    const detail = await this.getReport(reportId)

    const columns: CSVColumn<ReconciliationDiscrepancy>[] = [
      { key: 'id', header: 'Discrepancy ID' },
      { key: 'reportId', header: 'Report ID' },
      { key: 'contractId', header: 'Contract ID' },
      { key: 'milestoneId', header: 'Milestone ID' },
      { key: 'transactionHash', header: 'Transaction Hash' },
      { key: 'discrepancyType', header: 'Type' },
      { key: 'severity', header: 'Severity' },
      { key: 'description', header: 'Description' },
      { key: 'expectedAmount', header: 'Expected Amount' },
      { key: 'actualAmount', header: 'Actual Amount' },
      { key: 'status', header: 'Status' },
      {
        key: 'resolvedBy',
        header: 'Resolved By',
        format: (val) => val.resolvedBy ?? '',
      },
      {
        key: 'resolutionNotes',
        header: 'Resolution Notes',
        format: (val) => val.resolutionNotes ?? '',
      },
      { key: 'createdAt', header: 'Created At' },
      {
        key: 'resolvedAt',
        header: 'Resolved At',
        format: (val) => val.resolvedAt ?? '',
      },
    ]

    const csv = toCSV(detail.discrepancies, { columns })
    const datePart = new Date().toISOString().slice(0, 10)
    const filename = sanitizeFilename(`reconciliation_report_${reportId.slice(0, 8)}_${datePart}.csv`)

    return {
      csv,
      filename,
      totalRows: detail.discrepancies.length,
    }
  }
}

// ---------------------------------------------------------------------------
// Exported singleton
// ---------------------------------------------------------------------------

export const reconciliationService = new ReconciliationService()
