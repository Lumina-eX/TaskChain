import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/db'
import {
  reconciliationService,
  ReconciliationValidationError,
  ReconciliationNotFoundError,
} from '@/lib/reconciliation'

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>

describe('ReconciliationService', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  describe('runReconciliation', () => {
    it('throws validation error for invalid contractId', async () => {
      sqlMock.mockResolvedValueOnce([{ id: 'admin-1' }])

      await expect(
        reconciliationService.runReconciliation({
          walletAddress: 'GADMIN',
          contractId: 'not-a-uuid',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('throws validation error for invalid dateFrom', async () => {
      await expect(
        reconciliationService.runReconciliation({
          walletAddress: 'GADMIN',
          dateFrom: 'not-a-date',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('completes with status=completed when no discrepancies', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'admin-1' }])
        .mockResolvedValueOnce([{ id: 'report-1', status: 'pending' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 'report-1',
          generated_by: 'admin-1',
          status: 'completed',
          total_funded: '0',
          total_released: '0',
          total_refunded: '0',
          total_pending: '0',
          discrepancy_count: 0,
          report_metadata: {},
          error_message: null,
          created_at: '2026-10-18T12:00:00Z',
          completed_at: '2026-10-18T12:00:00Z',
        }])

      const result = await reconciliationService.runReconciliation({
        walletAddress: 'GADMIN',
      })

      expect(result.status).toBe('completed')
      expect(result.discrepancyCount).toBe(0)
    })

    it('detects missing blockchain event when contract is funded but no deposit log', async () => {
      const contract = {
        id: 'c-1',
        project_id: 'p-1',
        client_id: 'user-1',
        freelancer_id: 'user-2',
        total_amount: '1000.000000',
        currency: 'USDC',
        escrow_status: 'funded',
        status: 'active',
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'admin-1' }])
        .mockResolvedValueOnce([{ id: 'report-1', status: 'pending' }])
        .mockResolvedValueOnce([contract])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([{
          id: 'report-1',
          generated_by: 'admin-1',
          status: 'discrepancies_found',
          total_funded: '0',
          total_released: '0',
          total_refunded: '0',
          total_pending: '0',
          discrepancy_count: 1,
          report_metadata: {},
          error_message: null,
          created_at: '2026-10-18T12:00:00Z',
          completed_at: '2026-10-18T12:00:00Z',
        }])

      const result = await reconciliationService.runReconciliation({
        walletAddress: 'GADMIN',
      })

      expect(result.status).toBe('discrepancies_found')
      expect(result.discrepancyCount).toBe(1)
    })

    it('detects amount mismatch between contract total and ledger funded', async () => {
      const contract = {
        id: 'c-1',
        project_id: 'p-1',
        client_id: 'user-1',
        freelancer_id: 'user-2',
        total_amount: '1000.000000',
        currency: 'USDC',
        escrow_status: 'funded',
        status: 'active',
      }

      const ledgerSummary = {
        contract_id: 'c-1',
        currency: 'USDC',
        funded: '900.000000',
        released: '0',
        refunded: '0',
        pending: '0',
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'admin-1' }])
        .mockResolvedValueOnce([{ id: 'report-1', status: 'pending' }])
        .mockResolvedValueOnce([contract])
        .mockResolvedValueOnce([ledgerSummary])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([{
          id: 'report-1',
          generated_by: 'admin-1',
          status: 'discrepancies_found',
          total_funded: '900.000000',
          total_released: '0',
          total_refunded: '0',
          total_pending: '0',
          discrepancy_count: 1,
          report_metadata: {},
          error_message: null,
          created_at: '2026-10-18T12:00:00Z',
          completed_at: '2026-10-18T12:00:00Z',
        }])

      const result = await reconciliationService.runReconciliation({
        walletAddress: 'GADMIN',
      })

      expect(result.status).toBe('discrepancies_found')
      expect(result.totalFunded).toBe('900.000000')
    })

    it('detects duplicate entries', async () => {
      const duplicate = {
        transaction_hash: 'tx-dup',
        contract_id: 'c-1',
        cnt: 2,
        ids: ['entry-1', 'entry-2'],
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'admin-1' }])
        .mockResolvedValueOnce([{ id: 'report-1', status: 'pending' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([duplicate])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([{
          id: 'report-1',
          generated_by: 'admin-1',
          status: 'discrepancies_found',
          total_funded: '0',
          total_released: '0',
          total_refunded: '0',
          total_pending: '0',
          discrepancy_count: 1,
          report_metadata: {},
          error_message: null,
          created_at: '2026-10-18T12:00:00Z',
          completed_at: '2026-10-18T12:00:00Z',
        }])

      const result = await reconciliationService.runReconciliation({
        walletAddress: 'GADMIN',
      })

      expect(result.status).toBe('discrepancies_found')
      expect(result.discrepancyCount).toBe(1)
    })
  })

  describe('getReport', () => {
    it('throws validation error for invalid reportId', async () => {
      await expect(
        reconciliationService.getReport('not-a-uuid')
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('throws not found when report does not exist', async () => {
      sqlMock.mockResolvedValueOnce([])

      await expect(
        reconciliationService.getReport('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(ReconciliationNotFoundError)
    })

    it('returns report with discrepancies', async () => {
      const mockReport = {
        id: 'report-1',
        generated_by: 'admin-1',
        status: 'discrepancies_found',
        contract_id: null,
        token: null,
        date_from: null,
        date_to: null,
        total_funded: '1000.000000',
        total_released: '300.000000',
        total_refunded: '0',
        total_pending: '50.000000',
        discrepancy_count: 1,
        report_metadata: {},
        error_message: null,
        created_at: '2026-10-18T12:00:00Z',
        completed_at: '2026-10-18T12:00:00Z',
      }

      const mockDiscrepancy = {
        id: 'disc-1',
        report_id: 'report-1',
        contract_id: 'c-1',
        milestone_id: null,
        transaction_hash: null,
        discrepancy_type: 'amount_mismatch',
        severity: 'high',
        description: 'Funded amount mismatch',
        expected_amount: '1000.000000',
        actual_amount: '900.000000',
        blockchain_data: { ledgerFunded: '900.000000' },
        application_data: { contractTotal: '1000.000000' },
        status: 'open',
        resolved_by: null,
        resolution_notes: null,
        resolved_at: null,
        created_at: '2026-10-18T12:00:00Z',
        updated_at: '2026-10-18T12:00:00Z',
      }

      sqlMock
        .mockResolvedValueOnce([mockReport])
        .mockResolvedValueOnce([mockDiscrepancy])

      const result = await reconciliationService.getReport('550e8400-e29b-41d4-a716-446655440000')

      expect(result.report.id).toBe('report-1')
      expect(result.discrepancies).toHaveLength(1)
      expect(result.discrepancies[0].discrepancyType).toBe('amount_mismatch')
      expect(result.discrepancies[0].severity).toBe('high')
    })
  })

  describe('listReports', () => {
    it('throws validation error for invalid status filter', async () => {
      await expect(
        reconciliationService.listReports({
          limitParam: '10',
          offsetParam: '0',
          status: 'bogus',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('returns paginated reports', async () => {
      const mockReport = {
        id: 'report-1',
        generated_by: 'admin-1',
        status: 'completed',
        contract_id: null,
        token: null,
        date_from: null,
        date_to: null,
        total_funded: '0',
        total_released: '0',
        total_refunded: '0',
        total_pending: '0',
        discrepancy_count: 0,
        report_metadata: {},
        error_message: null,
        created_at: '2026-10-18T12:00:00Z',
        completed_at: '2026-10-18T12:00:00Z',
      }

      sqlMock
        .mockResolvedValueOnce([{ total_count: 1 }])
        .mockResolvedValueOnce([mockReport])

      const result = await reconciliationService.listReports({
        limitParam: '10',
        offsetParam: '0',
      })

      expect(result.reports).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
    })
  })

  describe('listDiscrepancies', () => {
    it('throws validation error for invalid discrepancyType', async () => {
      await expect(
        reconciliationService.listDiscrepancies({
          limitParam: '10',
          offsetParam: '0',
          discrepancyType: 'bogus',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('throws validation error for invalid severity', async () => {
      await expect(
        reconciliationService.listDiscrepancies({
          limitParam: '10',
          offsetParam: '0',
          severity: 'ultra',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('throws validation error for invalid discrepancy status', async () => {
      await expect(
        reconciliationService.listDiscrepancies({
          limitParam: '10',
          offsetParam: '0',
          status: 'bogus',
        })
      ).rejects.toThrow(ReconciliationValidationError)
    })
  })

  describe('resolveDiscrepancy', () => {
    it('throws validation error for short resolution notes', async () => {
      sqlMock.mockResolvedValueOnce([{ id: 'admin-1' }])

      await expect(
        reconciliationService.resolveDiscrepancy(
          '550e8400-e29b-41d4-a716-446655440000',
          'GADMIN',
          'ok'
        )
      ).rejects.toThrow(ReconciliationValidationError)
    })

    it('throws not found when discrepancy does not exist', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'admin-1' }])
        .mockResolvedValueOnce([])

      await expect(
        reconciliationService.resolveDiscrepancy(
          '550e8400-e29b-41d4-a716-446655440000',
          'GADMIN',
          'Resolved by adjusting the ledger entry'
        )
      ).rejects.toThrow(ReconciliationNotFoundError)
    })
  })

  describe('exportReportCsv', () => {
    it('generates CSV from report discrepancies', async () => {
      const mockReport = {
        id: 'report-1',
        generated_by: 'admin-1',
        status: 'discrepancies_found',
        contract_id: null,
        token: null,
        date_from: null,
        date_to: null,
        total_funded: '0',
        total_released: '0',
        total_refunded: '0',
        total_pending: '0',
        discrepancy_count: 1,
        report_metadata: {},
        error_message: null,
        created_at: '2026-10-18T12:00:00Z',
        completed_at: '2026-10-18T12:00:00Z',
      }

      const mockDiscrepancy = {
        id: 'disc-1',
        report_id: 'report-1',
        contract_id: 'c-1',
        milestone_id: null,
        transaction_hash: null,
        discrepancy_type: 'duplicate_entry',
        severity: 'critical',
        description: 'Duplicate detected',
        expected_amount: null,
        actual_amount: null,
        blockchain_data: {},
        application_data: null,
        status: 'open',
        resolved_by: null,
        resolution_notes: null,
        resolved_at: null,
        created_at: '2026-10-18T12:00:00Z',
        updated_at: '2026-10-18T12:00:00Z',
      }

      sqlMock
        .mockResolvedValueOnce([mockReport])
        .mockResolvedValueOnce([mockDiscrepancy])

      const result = await reconciliationService.exportReportCsv(
        '550e8400-e29b-41d4-a716-446655440000'
      )

      expect(result.totalRows).toBe(1)
      expect(result.filename).toContain('reconciliation_report_')
      expect(result.csv).toContain('Discrepancy ID')
      expect(result.csv).toContain('duplicate_entry')
      expect(result.csv).toContain('critical')
    })
  })
})
