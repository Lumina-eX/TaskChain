/**
 * Escrow funding math, validation and display formatting.
 *
 * Stellar assets support seven decimal places. All helpers in this module use
 * the same precision rules so totals, allocations, fees and remaining balances
 * are presented consistently throughout the funding flow.
 */

export const FUNDING_PRECISION = 7
export const FUNDING_TOLERANCE = 10 ** -FUNDING_PRECISION
export const DEFAULT_ESTIMATED_FEE_XLM = '0.00001'

const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: FUNDING_PRECISION,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export interface FundingMilestone {
  id: string
  title: string
  amount: string
}

export interface FundingBreakdownInput {
  totalValue: string | number
  fundedAmount?: string | number
  milestones?: FundingMilestone[]
  currency: string
}

export interface FundingBreakdown extends FundingBreakdownInput {
  total: number
  funded: number
  remaining: number
  fundedPercent: number
  allocationTotal: number
  allocationPercent: number
  milestoneAllocations: Array<FundingMilestone & { amountValue: number; percent: number }>
}

/** Parse a value coming from the API or an input without producing NaN totals. */
export function toFundingAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Format any monetary value using the shared Stellar precision rules. */
export function formatFundingAmount(value: string | number | null | undefined): string {
  return amountFormatter.format(toFundingAmount(value))
}

/** Format an amount together with its asset code. */
export function formatAssetAmount(
  value: string | number | null | undefined,
  currency: string
): string {
  return `${formatFundingAmount(value)} ${currency}`
}

/** Format a percentage of a total, e.g. `25.0%`. */
export function formatFundingPercent(value: number): string {
  return `${percentFormatter.format(Number.isFinite(value) ? value : 0)}%`
}

/** Check that a string is a non-zero Stellar amount (max seven decimals). */
export function isValidFundingAmount(value: string): boolean {
  return /^\d+(\.\d{1,7})?$/.test(value.trim()) && Number(value) > 0
}

export function calculateFundingBreakdown(input: FundingBreakdownInput): FundingBreakdown {
  const total = toFundingAmount(input.totalValue)
  const funded = Math.min(toFundingAmount(input.fundedAmount), total)
  const remaining = Math.max(total - funded, 0)
  const milestones = input.milestones ?? []
  const milestoneAllocations = milestones.map((milestone) => {
    const amountValue = toFundingAmount(milestone.amount)
    return {
      ...milestone,
      amountValue,
      percent: total > 0 ? (amountValue / total) * 100 : 0,
    }
  })
  const allocationTotal = milestoneAllocations.reduce((sum, milestone) => sum + milestone.amountValue, 0)

  return {
    ...input,
    total,
    funded,
    remaining,
    fundedPercent: total > 0 ? (funded / total) * 100 : 0,
    allocationTotal,
    allocationPercent: total > 0 ? (allocationTotal / total) * 100 : 0,
    milestoneAllocations,
  }
}

export interface FundingValidationResult {
  valid: boolean
  errors: string[]
}

export interface FundingValidationInput extends FundingBreakdownInput {
  amount: string
}

/**
 * Validate everything that must be true before a funding transaction may be
 * submitted. Milestone totals are only checked when a milestone list was
 * supplied, so older contracts without milestones remain fundable.
 */
export function validateFundingSubmission(input: FundingValidationInput): FundingValidationResult {
  const errors: string[] = []
  const breakdown = calculateFundingBreakdown(input)
  const { total, remaining, allocationTotal } = breakdown

  if (input.milestones) {
    if (input.milestones.length === 0) {
      errors.push('No milestone allocations found. Add milestones before funding escrow.')
    } else if (Math.abs(allocationTotal - total) > FUNDING_TOLERANCE) {
      errors.push(
        `Milestone allocations total ${formatAssetAmount(allocationTotal, input.currency)} but the contract value is ${formatAssetAmount(total, input.currency)}.`
      )
    }
  }

  if (!isValidFundingAmount(input.amount)) {
    errors.push(`Enter a valid amount with no more than ${FUNDING_PRECISION} decimal places.`)
  } else {
    const amount = toFundingAmount(input.amount)
    if (amount < remaining - FUNDING_TOLERANCE) {
      errors.push(`Funding amount must be at least ${formatAssetAmount(remaining, input.currency)}.`)
    }
    if (amount > remaining + FUNDING_TOLERANCE) {
      errors.push(`Funding amount exceeds the remaining ${formatAssetAmount(remaining, input.currency)}.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
