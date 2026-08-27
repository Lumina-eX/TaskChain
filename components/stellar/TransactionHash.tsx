'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getTransactionUrl,
  truncateHash,
  copyToClipboard,
} from '@/lib/stellar/explorer'
import { ExplorerLink } from './ExplorerLink'
import type { StellarNetwork } from '@/components/wallet-provider'

export interface TransactionHashProps {
  /** The full transaction hash (64-char hex string) */
  hash: string
  /** The network environment */
  network: StellarNetwork
  /** Number of characters to show at start and end (default: 6) */
  truncateChars?: number
  /** Whether to show the copy button */
  showCopy?: boolean
  /** Whether to show the explorer link */
  showExplorerLink?: boolean
  /** Additional CSS classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Callback when the hash is copied to clipboard */
  onCopy?: () => void
}

/**
 * Displays a shortened transaction hash with copy-to-clipboard functionality
 * and a link to open the transaction on Stellar Explorer.
 *
 * @example
 * ```tsx
 * <TransactionHash
 *   hash="abc123def456..."
 *   network="TESTNET"
 *   showCopy
 *   showExplorerLink
 * />
 * ```
 */
export function TransactionHash({
  hash,
  network,
  truncateChars = 6,
  showCopy = true,
  showExplorerLink = true,
  className,
  size = 'sm',
  onCopy,
}: TransactionHashProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(hash)
    if (success) {
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    }
  }, [hash, onCopy])

  const explorerUrl = showExplorerLink ? getTransactionUrl(hash, network) : undefined

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono',
        sizeClasses[size],
        className
      )}
    >
      {/* Shortened hash */}
      <span className="text-muted-foreground" title={hash}>
        {truncateHash(hash, truncateChars)}
      </span>

      {/* Copy to clipboard button */}
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center rounded p-0.5 transition-colors',
            copied
              ? 'text-accent hover:text-accent/80'
              : 'text-muted-foreground/50 hover:text-muted-foreground'
          )}
          title={copied ? 'Copied!' : 'Copy transaction hash to clipboard'}
          aria-label={copied ? 'Copied' : 'Copy transaction hash'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {/* Explorer link */}
      {explorerUrl && (
        <ExplorerLink
          href={explorerUrl}
          network={network}
          showIcon={true}
          size={size}
          aria-label={`View transaction on Stellar Explorer`}
        />
      )}
    </span>
  )
}