'use client'

import React, { useState, useCallback } from 'react'
import { truncateStellarAddress } from '@/components/wallet-provider'

export {
  useStellarWallet as useFreighter,
  truncateStellarAddress,
  networkLabel,
  StellarWalletProvider,
  REQUIRED_NETWORK,
} from '@/components/wallet-provider'

export type { StellarNetwork } from '@/components/wallet-provider'

// ----- Transaction Confirmation Modal -----

export type TransactionType = 'transfer' | 'contract-call' | 'group-action' | (string & {})

export interface TransactionDetails {
  type: TransactionType
  amount: string
  tokenSymbol: string
  walletAddress: string
  network: 'Mainnet' | 'Testnet'
  estimatedFee: string
}

export type TransactionStatus = 'pending' | 'success' | 'failed'

interface TransactionConfirmationModalProps {
  open: boolean
  details?: TransactionDetails
  status: TransactionStatus
  transactionHash?: string
  error?: string
  explorerUrl?: string
  onClose: () => void
  onRetry: () => void
}

const TransactionConfirmationModal: React.FC<TransactionConfirmationModalProps> = (props) => {
  const [copied, setCopied] = useState(false)

  if (!props.open || !props.details) return null

  const handleCopyHash = async () => {
    if (!props.transactionHash) return
    try {
      await navigator.clipboard.writeText(props.transactionHash)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy transaction hash:', props.transactionHash)
    }
  }

  const statusColors: Record<TransactionStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    success: 'bg-green-100 text-green-800 border-green-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
  }

  const statusLabels: Record<TransactionStatus, string> = {
    pending: 'Pending',
    success: 'Success',
    failed: 'Failed',
  }

  const { details } = props
  const status = props.status

  const statusIndicator = React.createElement(
    'div',
    { className: `mb-4 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${statusColors[status]}` },
    status === 'pending'
      ? React.createElement('svg', { className: 'mr-1 h-4 w-4 animate-spin', viewBox: '0 0 24 24', fill: 'none' },
          React.createElement('circle', { className: 'opacity-25', cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeWidth: '4' }),
          React.createElement('path', { className: 'opacity-75', fill: 'currentColor', d: 'M4 12a8 8 0 018-8v8h4a4 4 0 01-4 4v4a8 8 0 01-8-8z' })
        )
      : status === 'success'
      ? React.createElement('svg', { className: 'mr-1 h-4 w-4', fill: 'currentColor', viewBox: '0 0 20 20' },
          React.createElement('path', { fillRule: 'evenodd', d: 'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z', clipRule: 'evenodd' })
        )
      : React.createElement('svg', { className: 'mr-1 h-4 w-4', fill: 'currentColor', viewBox: '0 0 20 20' },
          React.createElement('path', { fillRule: 'evenodd', d: 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z', clipRule: 'evenodd' })
        ),
    ` ${statusLabels[status]}`
  )

  const detailRows: React.ReactNode[] = [
    React.createElement('div', { className: 'flex justify-between' },
      React.createElement('dt', { className: 'text-gray-500' }, 'Type'),
      React.createElement('dd', { className: 'font-medium text-gray-900 capitalize' }, String(details.type))
    ),
    React.createElement('div', { className: 'flex justify-between' },
      React.createElement('dt', { className: 'text-gray-500' }, 'Amount'),
      React.createElement('dd', { className: 'font-medium text-gray-900' }, `${details.amount} ${details.tokenSymbol}`)
    ),
    React.createElement('div', { className: 'flex justify-between' },
      React.createElement('dt', { className: 'text-gray-500' }, 'Wallet'),
      React.createElement('dd', { className: 'font-medium text-gray-900' }, truncateStellarAddress(details.walletAddress))
    ),
    React.createElement('div', { className: 'flex justify-between' },
      React.createElement('dt', { className: 'text-gray-500' }, 'Network'),
      React.createElement('dd', { className: 'font-medium text-gray-900' }, details.network)
    ),
    React.createElement('div', { className: 'flex justify-between' },
      React.createElement('dt', { className: 'text-gray-500' }, 'Estimated Fee'),
      React.createElement('dd', { className: 'font-medium text-gray-900' }, details.estimatedFee)
    ),
  ]

  let transactionHashSection: React.ReactNode = null
  if (status === 'success' && props.transactionHash) {
    transactionHashSection = React.createElement('div', { className: 'mt-4 rounded bg-gray-50 p-3' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-xs font-medium text-gray-500' }, 'Transaction Hash'),
        React.createElement('button', { onClick: handleCopyHash, className: 'inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-500' },
          copied ? 'Copied!' : 'Copy'
        )
      ),
      React.createElement('code', { className: 'mt-1 block break-all text-xs text-gray-700' }, props.transactionHash),
      props.explorerUrl ? React.createElement('a', { href: props.explorerUrl, target: '_blank', rel: 'noopener noreferrer', className: 'mt-2 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-500' },
        'View on Explorer ↕'
      ) : null
    )
  }

  let errorSection: React.ReactNode = null
  if (status === 'failed' && props.error) {
    errorSection = React.createElement('div', { className: 'mt-4 rounded bg-red-50 p-3' },
      React.createElement('p', { className: 'text-sm text-red-700' }, props.error)
    )
  }

  let actionButtons: React.ReactNode[] = []
  if (status === 'failed') {
    actionButtons.push(
      React.createElement('button', { key: 'retry', onClick: props.onRetry, className: 'rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700' }, 'Retry')
    )
  }
  actionButtons.push(
    React.createElement('button', { key: 'close', onClick: props.onClose, className: 'rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200' }, 'Close')
  )

  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4' },
    React.createElement('div', { className: 'w-full max-w-md rounded-lg bg-white shadow-xl' },
      React.createElement('div', { className: 'flex items-center justify-between border-b border-gray-200 px-4 py-3' },
        React.createElement('h2', { className: 'text-lg font-medium text-gray-900' }, 'Transaction Confirmation'),
        React.createElement('button', { onClick: props.onClose, className: 'text-gray-500 hover:text-gray-700 focus:outline-none', 'aria-label': 'Close' },
          React.createElement('svg', { className: 'h-5 w-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '2', d: 'M6 18L18 6M6 6l12 12' })
          )
        )
      ),
      React.createElement('div', { className: 'px-4 py-4' },
        statusIndicator,
        React.createElement('dl', { className: 'space-y3 text-sm' }, ...detailRows),
        transactionHashSection,
        errorSection,
        React.createElement('div', { className: 'mt-6 flex justify-end space-x3' }, ...actionButtons)
      )
    )
  )
}

interface UseTransactionConfirmationOptions {
  onRetry?: () => void
}

interface UseTransactionConfirmationReturn {
  modal: React.ReactElement
  openModal: (details: TransactionDetails, options?: UseTransactionConfirmationOptions) => void
  closeModal: () => void
  updateStatus: (status: TransactionStatus, options?: { transactionHash?: string; error?: string; explorerUrl?: string }) => void
}

function useTransactionConfirmation(): UseTransactionConfirmationReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [details, setDetails] = useState<TransactionDetails | undefined>(undefined)
  const [status, setStatus] = useState<TransactionStatus>('pending')
  const [transactionHash, setTransactionHash] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [explorerUrl, setExplorerUrl] = useState<string | undefined>(undefined)
  const [onRetry, setOnRetry] = useState<(() => void) | undefined>(undefined)

  const openModal = useCallback((newDetails: TransactionDetails, options?: UseTransactionConfirmationOptions) => {
    setDetails(newDetails)
    setStatus('pending')
    setTransactionHash(undefined)
    setError(undefined)
    setExplorerUrl(undefined)
    setOnRetry(options?.onRetry)
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    setDetails(undefined)
    setOnRetry(undefined)
  }, [])

  const updateStatus = useCallback(
    (newStatus: TransactionStatus, options?: { transactionHash?: string; error?: string; explorerUrl?: string }) => {
      setStatus(newStatus)
      if (options) {
        if (options.transactionHash) setTransactionHash(options.transactionHash)
        if (options.error) setError(options.error)
        if (options.explorerUrl) setExplorerUrl(options.explorerUrl)
      }
    },
    []
  )

  const modal = React.createElement(TransactionConfirmationModal, {
    open: isOpen,
    details: details,
    status: status,
    transactionHash: transactionHash,
    error: error,
    explorerUrl: explorerUrl,
    onClose: closeModal,
    onRetry: () => {
      if (onRetry) onRetry()
      setStatus('pending')
      setError(undefined)
      setTransactionHash(undefined)
      setExplorerUrl(undefined)
    },
  })

  return { modal, openModal, closeModal, updateStatus }
}

export { TransactionConfirmationModal, useTransactionConfirmation }
export type { TransactionDetails, TransactionStatus, UseTransactionConfirmationReturn }