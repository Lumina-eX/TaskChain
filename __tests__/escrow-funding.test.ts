import { describe, expect, it } from 'vitest'
import {
  calculateFundingBreakdown,
  formatAssetAmount,
  formatFundingAmount,
  formatFundingPercent,
  isValidFundingAmount,
  validateFundingSubmission,
} from '@/lib/escrow/funding'

const milestones = [
  { id: '1', title: 'Discovery', amount: '500.0000000' },
  { id: '2', title: 'Build', amount: '1000.0000000' },
]

describe('escrow funding calculations', () => {
  it('calculates funded, remaining and allocation percentages', () => {
    const result = calculateFundingBreakdown({
      totalValue: '1500.00',
      fundedAmount: 500,
      milestones,
      currency: 'USDC',
    })

    expect(result.total).toBe(1500)
    expect(result.funded).toBe(500)
    expect(result.remaining).toBe(1000)
    expect(result.fundedPercent).toBeCloseTo(33.333, 2)
    expect(result.allocationTotal).toBe(1500)
    expect(result.milestoneAllocations[1].percent).toBeCloseTo(66.667, 2)
  })

  it('formats amounts with consistent precision', () => {
    expect(formatFundingAmount('1500')).toBe('1,500.00')
    expect(formatFundingAmount('0.0000001')).toBe('0.0000001')
    expect(formatAssetAmount('1500', 'USDC')).toBe('1,500.00 USDC')
    expect(formatFundingPercent(25)).toBe('25.0%')
  })

  it('only accepts positive Stellar amounts with at most seven decimals', () => {
    expect(isValidFundingAmount('1000')).toBe(true)
    expect(isValidFundingAmount('1000.1234567')).toBe(true)
    expect(isValidFundingAmount('1000.12345678')).toBe(false)
    expect(isValidFundingAmount('0')).toBe(false)
    expect(isValidFundingAmount('abc')).toBe(false)
  })
})

describe('validateFundingSubmission', () => {
  const validInput = {
    totalValue: '1500.00',
    fundedAmount: 0,
    milestones,
    currency: 'USDC',
    amount: '1500.00',
  }

  it('accepts a fully funded, internally consistent allocation', () => {
    expect(validateFundingSubmission(validInput)).toEqual({ valid: true, errors: [] })
  })

  it('rejects submissions when milestone allocations do not match the contract total', () => {
    const result = validateFundingSubmission({
      ...validInput,
      milestones: [{ id: '1', title: 'Discovery', amount: '1400' }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/Milestone allocations total 1,400\.00 USDC/)
  })

  it('rejects an empty allocation list when milestones are supplied', () => {
    const result = validateFundingSubmission({ ...validInput, milestones: [] })

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/No milestone allocations found/)
  })

  it('rejects amounts that do not cover the remaining balance', () => {
    const result = validateFundingSubmission({ ...validInput, amount: '900' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Funding amount must be at least 1,500.00 USDC.')
  })

  it('rejects amounts exceeding the remaining balance', () => {
    const result = validateFundingSubmission({
      ...validInput,
      fundedAmount: 200,
      amount: '1500',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Funding amount exceeds the remaining 1,300.00 USDC.')
  })

  it('skips allocation validation for legacy contracts without milestones', () => {
    const result = validateFundingSubmission({
      totalValue: '1500.00',
      fundedAmount: 500,
      currency: 'XLM',
      amount: '1000',
    })

    expect(result.valid).toBe(true)
  })
})
