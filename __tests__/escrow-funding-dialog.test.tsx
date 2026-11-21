import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  signTransaction: vi.fn(),
  connect: vi.fn(),
  onFundingSuccess: vi.fn(),
  wallet: {
    address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX',
    isConnected: true,
    isWrongNetwork: false,
    isInitializing: false,
    network: 'TESTNET',
  },
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock('@/components/wallet-provider', () => ({
  useStellarWallet: () => ({ ...mocks.wallet, connect: mocks.connect }),
  networkLabel: (network: string) => (network === 'PUBLIC' ? 'Mainnet' : 'Testnet'),
  REQUIRED_NETWORK: 'TESTNET',
}))

vi.mock('@stellar/freighter-api', () => ({
  signTransaction: mocks.signTransaction,
}))

vi.mock('@/lib/stellar/transaction-builder', () => ({
  buildPaymentTransaction: () => ({ xdr: 'unsigned-xdr' }),
  getNetworkPassphrase: () => 'Test SDF Network ; September 2015',
}))

import { EscrowFundingDialog } from '@/components/dashboard/escrow-funding-dialog'

const milestones = [
  { id: '1', title: 'Design', amount: '500' },
  { id: '2', title: 'Development', amount: '1000' },
]

function renderDialog(overrides: Partial<ComponentProps<typeof EscrowFundingDialog>> = {}) {
  return render(
    <EscrowFundingDialog
      open
      onOpenChange={() => {}}
      contractId="contract-1"
      contractAddress="CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX"
      requiredAmount="1500"
      currency="USDC"
      milestones={milestones}
      networkPassphrase="Test SDF Network ; September 2015"
      onFundingSuccess={mocks.onFundingSuccess}
      {...overrides}
    />
  )
}

async function openReview() {
  fireEvent.click(screen.getByRole('button', { name: /Review Funding Details/i }))
  expect(await screen.findByRole('checkbox')).toBeInTheDocument()
}

describe('EscrowFundingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks.wallet, {
      address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX',
      isConnected: true,
      isWrongNetwork: false,
      isInitializing: false,
      network: 'TESTNET',
    })
    mocks.signTransaction.mockResolvedValue({ signedTxXdr: 'signed-xdr', error: null })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('requires an explicit confirmation step before wallet signing', async () => {
    renderDialog()
    expect(screen.getByLabelText('Total contract value')).toHaveTextContent('1,500.00 USDC')

    await openReview()
    const continueButton = screen.getByRole('button', { name: /Continue to Wallet/i })
    expect(continueButton).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(continueButton).toBeEnabled()
    expect(mocks.signTransaction).not.toHaveBeenCalled()
  })

  it('blocks review when milestone allocations do not match the contract total', () => {
    renderDialog({ milestones: [{ id: '1', title: 'Design', amount: '900' }] })

    expect(screen.getByRole('alert')).toHaveTextContent(/Milestone allocations total 900\.00 USDC/)
    expect(screen.getByRole('button', { name: /Review Funding Details/i })).toBeDisabled()
  })

  it('never shows success until the blockchain confirmation response resolves', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const pendingFetch = new Promise((resolve) => { resolveFetch = resolve })
    vi.stubGlobal('fetch', vi.fn(() => pendingFetch))

    renderDialog()
    await openReview()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Continue to Wallet/i }))

    expect(await screen.findByText(/Awaiting blockchain confirmation/i)).toBeInTheDocument()
    expect(screen.queryByText(/Confirmed on Stellar/i)).not.toBeInTheDocument()

    resolveFetch({
      ok: true,
      json: async () => ({ escrowStatus: 'funded', fundingTxHash: 'confirmed-hash' }),
    })

    expect(await screen.findByText(/Confirmed on Stellar/i)).toBeInTheDocument()
    expect(mocks.onFundingSuccess).toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it('keeps escrow unfunded and shows an actionable error when verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: async () => ({ error: 'Funding verification failed' }),
    })))

    renderDialog()
    await openReview()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Continue to Wallet/i }))

    expect(await screen.findByText(/Funding was not confirmed/i)).toBeInTheDocument()
    expect(screen.getByText(/The escrow remains unfunded/i)).toBeInTheDocument()
    expect(screen.queryByText(/Confirmed on Stellar/i)).not.toBeInTheDocument()
    expect(mocks.onFundingSuccess).not.toHaveBeenCalled()
  })

  it('distinguishes a cancelled pending transaction from a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    renderDialog()
    await openReview()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Continue to Wallet/i }))

    expect(await screen.findByText(/Awaiting blockchain confirmation/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))

    await waitFor(() => {
      expect(screen.getByText('Funding cancelled')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Funding was not confirmed/i)).not.toBeInTheDocument()
  })

  it('requires a connected wallet on the correct network', () => {
    mocks.wallet.isConnected = false

    renderDialog()
    expect(screen.getByText(/Wallet not connected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review Funding Details/i })).toBeDisabled()
  })
})
