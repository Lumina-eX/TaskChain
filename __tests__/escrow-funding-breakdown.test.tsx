import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EscrowFundingBreakdown } from '@/components/dashboard/escrow-funding-breakdown'

vi.mock('@/components/wallet-provider', () => ({
  networkLabel: (network: string) => (network === 'PUBLIC' ? 'Mainnet' : 'Testnet'),
}))

const milestones = [
  { id: '1', title: 'Design', amount: '500' },
  { id: '2', title: 'Development', amount: '1000' },
]

describe('EscrowFundingBreakdown', () => {
  it('summarises the total, funded/remaining amounts, allocations, asset, network and fee', () => {
    render(
      <EscrowFundingBreakdown
        totalValue="1500"
        fundedAmount={500}
        currency="USDC"
        milestones={milestones}
        network="TESTNET"
      />
    )

    expect(screen.getByLabelText('Total contract value')).toHaveTextContent('1,500.00 USDC')
    expect(screen.getAllByText('1,000.00 USDC').length).toBeGreaterThan(0)
    expect(screen.getByText('Design')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
    expect(screen.getByText('33.3% of contract value')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Testnet')).toBeInTheDocument()
    expect(screen.getByText(/not part of the escrow funds/i)).toBeInTheDocument()
  })

  it('shows an empty state when no milestone allocations exist', () => {
    render(
      <EscrowFundingBreakdown
        totalValue="1500"
        currency="USDC"
        milestones={[]}
        network="PUBLIC"
      />
    )

    expect(screen.getByText(/No milestone allocations available/i)).toBeInTheDocument()
  })

  it('surfaces validation errors', () => {
    render(
      <EscrowFundingBreakdown
        totalValue="1500"
        currency="USDC"
        milestones={milestones}
        network="TESTNET"
        validation={{ valid: false, errors: ['Milestone allocations do not match the contract value.'] }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Milestone allocations do not match')
  })

  it('shows a loading state', () => {
    render(
      <EscrowFundingBreakdown
        totalValue="1500"
        currency="USDC"
        network="TESTNET"
        isLoading
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading funding breakdown')
  })
})
