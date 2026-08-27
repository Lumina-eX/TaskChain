/**
 * Stellar Explorer Integration
 *
 * Provides utilities for generating Stellar Explorer links and formatting
 * blockchain data throughout the application.
 *
 * Supports both Testnet and Mainnet (Public) network environments.
 */

import type { StellarNetwork } from '@/components/wallet-provider'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPLORER_BASE_URLS: Record<StellarNetwork, string> = {
  TESTNET: 'https://stellar.expert/explorer/testnet',
  PUBLIC: 'https://stellar.expert/explorer/public',
  UNKNOWN: 'https://stellar.expert/explorer/testnet', // Default to testnet
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplorerLinkConfig {
  /** The network environment (testnet, public, or unknown) */
  network: StellarNetwork
  /** Optional label override for the link */
  label?: string
  /** Additional CSS classes for the link */
  className?: string
}

// ---------------------------------------------------------------------------
// URL Generators
// ---------------------------------------------------------------------------

/**
 * Get the base explorer URL for the given network.
 */
export function getExplorerBaseUrl(network: StellarNetwork): string {
  return EXPLORER_BASE_URLS[network] || EXPLORER_BASE_URLS.TESTNET
}

/**
 * Generate a full explorer URL for a transaction hash.
 *
 * @example
 *   getTransactionUrl('abc123...', 'TESTNET')
 *   // => 'https://stellar.expert/explorer/testnet/tx/abc123...'
 */
export function getTransactionUrl(hash: string, network: StellarNetwork): string {
  const base = getExplorerBaseUrl(network)
  return `${base}/tx/${hash}`
}

/**
 * Generate a full explorer URL for an account / wallet address.
 *
 * @example
 *   getAccountUrl('GABCD...', 'PUBLIC')
 *   // => 'https://stellar.expert/explorer/public/account/GABCD...'
 */
export function getAccountUrl(address: string, network: StellarNetwork): string {
  const base = getExplorerBaseUrl(network)
  return `${base}/account/${address}`
}

/**
 * Generate a full explorer URL for a contract address.
 * On Stellar, contracts are identified by their contract ID.
 *
 * @example
 *   getContractUrl('CC123...', 'TESTNET')
 *   // => 'https://stellar.expert/explorer/testnet/contract/CC123...'
 */
export function getContractUrl(contractId: string, network: StellarNetwork): string {
  const base = getExplorerBaseUrl(network)
  return `${base}/contract/${contractId}`
}

/**
 * Generate a full explorer URL for a ledger (block).
 *
 * @example
 *   getLedgerUrl(123456, 'PUBLIC')
 *   // => 'https://stellar.expert/explorer/public/ledger/123456'
 */
export function getLedgerUrl(ledgerSeq: number | string, network: StellarNetwork): string {
  const base = getExplorerBaseUrl(network)
  return `${base}/ledger/${ledgerSeq}`
}

/**
 * Generate a full explorer URL for an asset.
 *
 * @example
 *   getAssetUrl('USDC', 'GC...', 'TESTNET')
 *   // => 'https://stellar.expert/explorer/testnet/asset/USDC-GC...'
 */
export function getAssetUrl(
  assetCode: string,
  assetIssuer: string,
  network: StellarNetwork
): string {
  const base = getExplorerBaseUrl(network)
  return `${base}/asset/${assetCode}-${assetIssuer}`
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a hash or address for display purposes.
 *
 * @param hash - The full hash or address string.
 * @param chars - Number of characters to keep at the start and end (default: 4).
 * @returns The truncated string, e.g. "abcde...xyzw"
 *
 * @example
 *   truncateHash('GABCDEF1234567890XYZ') // => 'GABC...XYZ0'
 *   truncateHash('abc123def456', 3)      // => 'abc...456'
 */
export function truncateHash(hash: string, chars = 4): string {
  if (!hash) return ''
  if (hash.length <= chars * 2 + 3) return hash
  return `${hash.slice(0, chars + 1)}...${hash.slice(-chars)}`
}

/**
 * Truncate a Stellar account address (G... or C... public key) for display.
 * Stellar addresses are 56 characters long, so we show first 5 and last 4.
 *
 * @example
 *   truncateAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWX')
 *   // => 'GABCD...WX'
 */
export function truncateAddress(address: string): string {
  if (!address) return ''
  if (address.length <= 10) return address
  return `${address.slice(0, 5)}...${address.slice(-4)}`
}

/**
 * Determine if the given hash is a Stellar transaction hash.
 * Stellar transaction hashes are 64-character hex strings.
 */
export function isTransactionHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash)
}

/**
 * Determine if the given string is a Stellar public key (G... or C... account).
 * Stellar account addresses are 56 characters starting with G or C.
 */
export function isStellarAddress(address: string): boolean {
  return /^[GC][1-9A-HJ-NP-Za-km-z]{55}$/.test(address)
}

/**
 * Determine if the given string is a Stellar contract ID.
 * Contract IDs are typically 56 characters starting with C.
 */
export function isContractId(contractId: string): boolean {
  return /^C[1-9A-HJ-NP-Za-km-z]{55}$/.test(contractId)
}

// ---------------------------------------------------------------------------
// Clipboard Helper
// ---------------------------------------------------------------------------

/**
 * Copy the given text to the clipboard.
 * Returns a promise that resolves to true if the copy was successful.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    textArea.style.top = '-9999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Network Helpers
// ---------------------------------------------------------------------------

/**
 * Get a human-readable label for the network type.
 */
export function getNetworkLabel(network: StellarNetwork): string {
  const labels: Record<StellarNetwork, string> = {
    TESTNET: 'Testnet',
    PUBLIC: 'Mainnet',
    UNKNOWN: 'Unknown',
  }
  return labels[network] || 'Unknown'
}

/**
 * Determine if the network is a testnet.
 */
export function isTestnet(network: StellarNetwork): boolean {
  return network === 'TESTNET'
}

/**
 * Determine if the network is mainnet (public).
 */
export function isMainnet(network: StellarNetwork): boolean {
  return network === 'PUBLIC'
}

/**
 * Known Stellar network passphrases.
 */
const NETWORK_PASSPHRASES: Record<string, StellarNetwork> = {
  'Test SDF Network ; September 2015': 'TESTNET',
  'Public Global Stellar Network ; September 2015': 'PUBLIC',
}

/**
 * Convert a Stellar network passphrase to a StellarNetwork type.
 *
 * @param passphrase - The network passphrase string (e.g. "Test SDF Network ; September 2015")
 * @returns The corresponding StellarNetwork type, or 'UNKNOWN' if not recognized.
 *
 * @example
 *   networkFromPassphrase('Test SDF Network ; September 2015') // => 'TESTNET'
 *   networkFromPassphrase('Public Global Stellar Network ; September 2015') // => 'PUBLIC'
 */
export function networkFromPassphrase(passphrase: string | null | undefined): StellarNetwork {
  if (!passphrase) return 'UNKNOWN'
  return NETWORK_PASSPHRASES[passphrase] || 'UNKNOWN'
}
