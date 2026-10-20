import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted — use inline vi.fn() and import the mocked sql afterward
vi.mock('@/lib/db', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/db'
import {
  paymentLedgerService,
  LedgerValidationError,
  LedgerForbiddenError,
  LedgerDuplicateEntryError,
} from '@/lib/payment-ledger'

// sql is the mocked function — control it with mockResolvedValue / mockResolvedValueOnce
const sqlMock = sql as unknown as ReturnType<typeof vi.fn>

describe('PaymentLedgerService', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  describe('listEntries', () => {
    it('throws validation error for invalid contractId', async () => {
      sqlMock.mockResolvedValueOnce([{ id: 'user-1', role: 'freelancer' }])
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '10',
          offsetParam: '0',
          contractId: 'not-a-uuid',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('throws validation error for invalid entryType', async () => {
      sqlMock.mockResolvedValueOnce([{ id: 'user-1', role: 'freelancer' }])
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '10',
          offsetParam: '0',
          entryType: 'invalid_type',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('throws forbidden error when wallet not linked to user', async () => {
      sqlMock.mockResolvedValueOnce([])
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '10',
          offsetParam: '0',
        })
      ).rejects.toThrow(LedgerForbiddenError)
    })

    it('throws validation error for invalid limit', async () => {
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '0',
          offsetParam: '0',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('throws validation error for limit > 100', async () => {
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '101',
          offsetParam: '0',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('throws validation error for negative offset', async () => {
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '10',
          offsetParam: '-1',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('throws validation error for invalid status', async () => {
      sqlMock.mockResolvedValueOnce([{ id: 'user-1', role: 'freelancer' }])
      await expect(
        paymentLedgerService.listEntries({
          walletAddress: 'GWALLET',
          limitParam: '10',
          offsetParam: '0',
          status: 'bogus',
        })
      ).rejects.toThrow(LedgerValidationError)
    })

    it('returns paginated entries for valid request', async () => {
      const mockEntry = {
        id: 'entry-1',
        contract_id: 'contract-1',
        project_id: 'project-1',
        milestone_id: null,
        dispute_id: null,
        actor_user_id: 'user-1',
        counterparty_user_id: null,
        transaction_type: 'deposit',
        amount: '100.000000',
        currency: 'USDC',
        transaction_hash: 'tx-abc',
        status: 'confirmed',
        description: null,
        metadata: {},
        created_at: '2026-10-18T12:00:00Z',
        project_title: 'Test Project',
        contract_status: 'active',
        actor_wallet_address: 'GACTOR',
        counterparty_wallet_address: null,
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'freelancer' }])
        .mockResolvedValueOnce([{ total_count: 1 }])
        .mockResolvedValueOnce([mockEntry])

      const result = await paymentLedgerService.listEntries({
        walletAddress: 'GWALLET',
        limitParam: '10',
        offsetParam: '0',
      })

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].id).toBe('entry-1')
      expect(result.entries[0].entryType).toBe('deposit')
      expect(result.entries[0].amount).toBe('100.000000')
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })
  })

  describe('listPending', () => {
    it('delegates to listEntries with status=pending', async () => {
      const mockEntry = {
        id: 'entry-2',
        contract_id: 'contract-1',
        project_id: 'project-1',
        milestone_id: null,
        dispute_id: null,
        actor_user_id: 'user-1',
        counterparty_user_id: null,
        transaction_type: 'deposit',
        amount: '50.000000',
        currency: 'USDC',
        transaction_hash: 'tx-pending',
        status: 'pending',
        description: null,
        metadata: {},
        created_at: '2026-10-18T12:00:00Z',
        project_title: null,
        contract_status: 'active',
        actor_wallet_address: 'GACTOR',
        counterparty_wallet_address: null,
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'freelancer' }])
        .mockResolvedValueOnce([{ total_count: 1 }])
        .mockResolvedValueOnce([mockEntry])

      const result = await paymentLedgerService.listPending({
        walletAddress: 'GWALLET',
        limitParam: '10',
        offsetParam: '0',
      })

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].status).toBe('pending')
    })
  })

  describe('getBalances', () => {
    it('returns balance per contract and currency', async () => {
      const mockBalance = {
        contract_id: 'contract-1',
        currency: 'USDC',
        funded: '1000.000000',
        released: '300.000000',
        refunded: '0',
        pending: '50.000000',
        entry_count: 5,
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([{ total_count: 1 }])
        .mockResolvedValueOnce([mockBalance])

      const result = await paymentLedgerService.getBalances({
        walletAddress: 'GWALLET',
        limitParam: '10',
        offsetParam: '0',
      })

      expect(result.balances).toHaveLength(1)
      expect(result.balances[0].funded).toBe('1000.000000')
      expect(result.balances[0].released).toBe('300.000000')
      expect(result.balances[0].refunded).toBe('0')
      expect(result.balances[0].remaining).toBe('700.000000')
    })
  })

  describe('getSummary', () => {
    it('returns aggregated summary across currencies', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([
          {
            currency: 'USDC',
            funded: '1000.000000',
            released: '300.000000',
            refunded: '0',
            pending: '50.000000',
            confirmed_count: 10,
            pending_count: 2,
            failed_count: 1,
          },
          {
            currency: 'XLM',
            funded: '500.000000',
            released: '100.000000',
            refunded: '50.000000',
            pending: '0',
            confirmed_count: 5,
            pending_count: 0,
            failed_count: 0,
          },
        ])

      const result = await paymentLedgerService.getSummary({
        walletAddress: 'GWALLET',
      })

      expect(result.totalFunded).toBe('1500.000000')
      expect(result.totalReleased).toBe('400.000000')
      expect(result.totalRefunded).toBe('50.000000')
      expect(result.totalRemaining).toBe('1050.000000')
      expect(result.totalPending).toBe('50.000000')
      expect(result.confirmedEntries).toBe(15)
      expect(result.pendingEntries).toBe(2)
      expect(result.failedEntries).toBe(1)
      expect(result.currencies).toHaveLength(2)
    })

    it('returns zero values when no data', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([])

      const result = await paymentLedgerService.getSummary({
        walletAddress: 'GWALLET',
      })

      expect(result.totalFunded).toBe('0.000000')
      expect(result.totalReleased).toBe('0.000000')
      expect(result.totalRefunded).toBe('0.000000')
      expect(result.totalRemaining).toBe('0.000000')
      expect(result.currencies).toHaveLength(0)
    })
  })

  describe('recordEntry', () => {
    it('throws duplicate error when entry already exists', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'client' }])
        .mockResolvedValueOnce([{ id: 'c-1', project_id: 'p-1', client_id: 'user-1', freelancer_id: 'user-2', currency: 'USDC' }])
        .mockResolvedValueOnce([{ id: 'existing-entry' }])

      await expect(
        paymentLedgerService.recordEntry({
          walletAddress: 'GWALLET',
          contractId: 'c-1',
          entryType: 'deposit',
          amount: '100.000000',
          transactionHash: 'tx-dup',
        })
      ).rejects.toThrow(LedgerDuplicateEntryError)
    })

    it('throws forbidden when non-participant tries to create entry', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'user-3', role: 'freelancer' }])
        .mockResolvedValueOnce([{ id: 'c-1', project_id: 'p-1', client_id: 'user-1', freelancer_id: 'user-2', currency: 'USDC' }])

      await expect(
        paymentLedgerService.recordEntry({
          walletAddress: 'GWALLET',
          contractId: 'c-1',
          entryType: 'deposit',
          amount: '100.000000',
          transactionHash: 'tx-new',
        })
      ).rejects.toThrow(LedgerForbiddenError)
    })

    it('throws validation error when contract not found', async () => {
      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([])

      await expect(
        paymentLedgerService.recordEntry({
          walletAddress: 'GWALLET',
          contractId: '550e8400-e29b-41d4-a716-446655440000',
          entryType: 'deposit',
          amount: '100.000000',
        })
      ).rejects.toThrow(LedgerValidationError)
    })
  })

  describe('exportCsv', () => {
    it('generates CSV from ledger entries', async () => {
      const mockEntry = {
        id: 'entry-1',
        contract_id: 'contract-1',
        project_id: 'project-1',
        milestone_id: null,
        dispute_id: null,
        actor_user_id: 'user-1',
        counterparty_user_id: null,
        transaction_type: 'deposit',
        amount: '100.000000',
        currency: 'USDC',
        transaction_hash: 'tx-1',
        status: 'confirmed',
        description: 'Funding deposit',
        metadata: {},
        created_at: '2026-10-18T12:00:00Z',
        project_title: 'Test',
        contract_status: 'active',
        actor_wallet_address: 'GACTOR',
        counterparty_wallet_address: null,
      }

      sqlMock
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([{ total_count: 1 }])
        .mockResolvedValueOnce([mockEntry])

      const result = await paymentLedgerService.exportCsv({
        walletAddress: 'GWALLET',
      })

      expect(result.totalRows).toBe(1)
      expect(result.filename).toContain('ledger_export_')
      expect(result.csv).toContain('ID')
      expect(result.csv).toContain('entry-1')
      expect(result.csv).toContain('deposit')
      expect(result.csv).toContain('100.000000')
    })
  })
})
