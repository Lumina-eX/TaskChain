export type ContractStatus = 'active' | 'completed'

export interface ContractItem {
  id: string
  title: string
  clientName: string
  deadline: string
  paymentTerms: string
  amountUsd: number
  status: ContractStatus
  payoutConfirmed?: boolean
  completedAt?: string
}

export interface EarningsSummary {
  totalEarningsUsd: number
  pendingPaymentsUsd: number
  withdrawalsUsd: number
}

export interface EscrowEntry {
  id: string
  contractTitle: string
  amountUsd: number
  releaseCondition: string
  status: 'held' | 'releasing' | 'released'
}

export interface FreelancerDashboardData {
  activeContracts: ContractItem[]
  completedContracts: ContractItem[]
  earnings: EarningsSummary
  escrow: EscrowEntry[]
  updatedAt: string
}

const DASHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_DASHBOARD_API_URL ??
  '/api/freelancer/dashboard'

const FALLBACK_DATA: FreelancerDashboardData = {
  activeContracts: [
    {
      id: 'ac-101',
      title: 'Marketing Site Redesign',
      clientName: 'Northstar Labs',
      deadline: '2026-03-04',
      paymentTerms: '50% upfront, 50% on delivery',
      amountUsd: 1800,
      status: 'active',
    },
    {
      id: 'ac-102',
      title: 'Mobile App QA Audit',
      clientName: 'Skyline Systems',
      deadline: '2026-03-12',
      paymentTerms: 'Net 7 after milestone approval',
      amountUsd: 950,
      status: 'active',
    },
  ],
  completedContracts: [
    {
      id: 'cc-220',
      title: 'Analytics Dashboard',
      clientName: 'Pulse Commerce',
      deadline: '2026-01-28',
      paymentTerms: 'Milestone based',
      amountUsd: 2200,
      status: 'completed',
      payoutConfirmed: true,
      completedAt: '2026-01-29',
    },
    {
      id: 'cc-221',
      title: 'API Integration',
      clientName: 'Cobalt Dynamics',
      deadline: '2026-01-14',
      paymentTerms: 'Net 3',
      amountUsd: 1200,
      status: 'completed',
      payoutConfirmed: true,
      completedAt: '2026-01-16',
    },
  ],
  earnings: {
    totalEarningsUsd: 11150,
    pendingPaymentsUsd: 2750,
    withdrawalsUsd: 8400,
  },
  escrow: [
    {
      id: 'es-500',
      contractTitle: 'Marketing Site Redesign',
      amountUsd: 900,
      releaseCondition: 'Release on final design approval',
      status: 'held',
    },
    {
      id: 'es-501',
      contractTitle: 'Mobile App QA Audit',
      amountUsd: 950,
      releaseCondition: 'Release after QA sign-off',
      status: 'releasing',
    },
  ],
  updatedAt: new Date().toISOString(),
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isContractItem(value: unknown): value is ContractItem {
  if (!isObject(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.clientName === 'string' &&
    typeof value.deadline === 'string' &&
    typeof value.paymentTerms === 'string' &&
    typeof value.amountUsd === 'number' &&
    (value.status === 'active' || value.status === 'completed')
  )
}

function isEscrowEntry(value: unknown): value is EscrowEntry {
  if (!isObject(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.contractTitle === 'string' &&
    typeof value.amountUsd === 'number' &&
    typeof value.releaseCondition === 'string' &&
    (value.status === 'held' ||
      value.status === 'releasing' ||
      value.status === 'released')
  )
}

function isDashboardData(value: unknown): value is FreelancerDashboardData {
  if (!isObject(value)) {
    return false
  }

  const earnings = value.earnings

  return (
    Array.isArray(value.activeContracts) &&
    value.activeContracts.every(isContractItem) &&
    Array.isArray(value.completedContracts) &&
    value.completedContracts.every(isContractItem) &&
    isObject(earnings) &&
    typeof earnings.totalEarningsUsd === 'number' &&
    typeof earnings.pendingPaymentsUsd === 'number' &&
    typeof earnings.withdrawalsUsd === 'number' &&
    Array.isArray(value.escrow) &&
    value.escrow.every(isEscrowEntry) &&
    typeof value.updatedAt === 'string'
  )
}

export async function getFreelancerDashboardData(): Promise<FreelancerDashboardData> {
  try {
    const response = await fetch(DASHBOARD_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return FALLBACK_DATA
    }

    const data: unknown = await response.json()
    if (!isDashboardData(data)) {
      return FALLBACK_DATA
    }

    return data
  } catch {
    return FALLBACK_DATA
  }
}
