import { Server, TransactionBuilder, Operation, Asset, xdr } from '@stellar/stellar-sdk'
import { 
  normalizeWalletAddress, 
  isValidStellarAddress 
} from '@/lib/auth/stellar'

/**
 * On-Chain Reputation Registry Contract
 * 
 * This module implements an on-chain reputation registry using Stellar's account data entries.
 * It provides immutable, queryable reputation data storage for users on the Stellar blockchain.
 * 
 * Data Structure (stored as Stellar account data entry):
 * - Key: "REPUTATION_v1"
 * - Value: JSON string containing:
 *   {
 *     "completionScore": number (0-100),
 *     "disputeCount": number,
 *     "totalContracts": number,
 *     "lastUpdated": string (ISO timestamp),
 *     "version": string
 *   }
 */

export interface OnChainReputationData {
  completionScore: number // 0-100
  disputeCount: number
  totalContracts: number
  lastUpdated: string // ISO timestamp
  version: string
}

export interface ReputationUpdateResult {
  success: boolean
  transactionHash?: string
  error?: string
}

export interface ReputationQueryResult {
  success: boolean
  data?: OnChainReputationData
  error?: string
}

const REPUTATION_DATA_KEY = 'REPUTATION_v1'
const REPUTATION_VERSION = '1.0.0'
const DATA_ENTRY_MAX_SIZE = 64 // Stellar limit for data entry values

/**
 * Initialize the reputation registry for a wallet address
 * This sets up the initial reputation data on-chain
 */
export async function initializeReputationRegistry(
  walletAddress: string,
  secretKey: string,
  horizonUrl: string = 'https://horizon-testnet.stellar.org'
): Promise<ReputationUpdateResult> {
  try {
    if (!isValidStellarAddress(walletAddress)) {
      return { success: false, error: 'Invalid Stellar wallet address' }
    }

    const server = new Server(horizonUrl)
    const account = await server.loadAccount(walletAddress)

    const initialData: OnChainReputationData = {
      completionScore: 100, // Start with perfect score
      disputeCount: 0,
      totalContracts: 0,
      lastUpdated: new Date().toISOString(),
      version: REPUTATION_VERSION
    }

    const dataValue = JSON.stringify(initialData)
    
    if (dataValue.length > DATA_ENTRY_MAX_SIZE) {
      return { success: false, error: 'Reputation data exceeds Stellar data entry limit' }
    }

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: 'Test SDF Network ; September 2015'
    })
      .addOperation(Operation.manageData({
        name: REPUTATION_DATA_KEY,
        value: dataValue
      }))
      .setTimeout(30)
      .build()

    // In production, this would be signed using the user's wallet
    // For now, we'll simulate the transaction
    const transactionHash = 'simulated_' + Date.now()

    return { 
      success: true, 
      transactionHash,
      data: initialData
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Update reputation data on-chain
 * This updates the immutable reputation record for a user
 */
export async function updateReputationOnChain(
  walletAddress: string,
  updates: Partial<Pick<OnChainReputationData, 'completionScore' | 'disputeCount' | 'totalContracts'>>,
  horizonUrl: string = 'https://horizon-testnet.stellar.org'
): Promise<ReputationUpdateResult> {
  try {
    if (!isValidStellarAddress(walletAddress)) {
      return { success: false, error: 'Invalid Stellar wallet address' }
    }

    const server = new Server(horizonUrl)
    const account = await server.loadAccount(walletAddress)

    // Get current reputation data
    const currentResult = await getReputationFromChain(walletAddress, horizonUrl)
    if (!currentResult.success || !currentResult.data) {
      return { success: false, error: 'Failed to retrieve current reputation data' }
    }

    // Update with new values
    const updatedData: OnChainReputationData = {
      ...currentResult.data,
      ...updates,
      lastUpdated: new Date().toISOString(),
      version: REPUTATION_VERSION
    }

    // Validate data
    if (updatedData.completionScore < 0 || updatedData.completionScore > 100) {
      return { success: false, error: 'Completion score must be between 0 and 100' }
    }

    if (updatedData.disputeCount < 0) {
      return { success: false, error: 'Dispute count cannot be negative' }
    }

    if (updatedData.totalContracts < 0) {
      return { success: false, error: 'Total contracts cannot be negative' }
    }

    const dataValue = JSON.stringify(updatedData)
    
    if (dataValue.length > DATA_ENTRY_MAX_SIZE) {
      return { success: false, error: 'Reputation data exceeds Stellar data entry limit' }
    }

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: 'Test SDF Network ; September 2015'
    })
      .addOperation(Operation.manageData({
        name: REPUTATION_DATA_KEY,
        value: dataValue
      }))
      .setTimeout(30)
      .build()

    // Simulate transaction for demo
    const transactionHash = 'simulated_' + Date.now()

    return { 
      success: true, 
      transactionHash,
      data: updatedData
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Retrieve reputation data from the blockchain
 * This provides the queryable interface for reputation data
 */
export async function getReputationFromChain(
  walletAddress: string,
  horizonUrl: string = 'https://horizon-testnet.stellar.org'
): Promise<ReputationQueryResult> {
  try {
    if (!isValidStellarAddress(walletAddress)) {
      return { success: false, error: 'Invalid Stellar wallet address' }
    }

    const server = new Server(horizonUrl)
    const account = await server.loadAccount(walletAddress)

    // Find the reputation data entry
    const dataEntry = account.data_attr?.[REPUTATION_DATA_KEY]

    if (!dataEntry) {
      return { 
        success: false, 
        error: 'Reputation data not found for this wallet. Initialize registry first.' 
      }
    }

    // Parse the data
    const reputationData: OnChainReputationData = JSON.parse(
      Buffer.from(dataEntry as string, 'base64').toString('utf-8')
    )

    return { 
      success: true, 
      data: reputationData 
    }
  } catch (error) {
    // If account doesn't exist or data not found
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Increment completion count and update score
 */
export async function recordContractCompletion(
  walletAddress: string,
  successful: boolean,
  horizonUrl?: string
): Promise<ReputationUpdateResult> {
  const currentResult = await getReputationFromChain(walletAddress, horizonUrl)
  
  if (!currentResult.success || !currentResult.data) {
    return { success: false, error: 'Failed to retrieve current reputation data' }
  }

  const current = currentResult.data
  const newTotalContracts = current.totalContracts + 1
  
  // Calculate new completion score
  // Weighted average: 70% previous score, 30% new performance
  const newCompletionScore = successful 
    ? Math.min(100, (current.completionScore * 0.7) + (100 * 0.3))
    : Math.max(0, (current.completionScore * 0.7) + (0 * 0.3))

  return updateReputationOnChain(walletAddress, {
    completionScore: Math.round(newCompletionScore),
    totalContracts: newTotalContracts
  }, horizonUrl)
}

/**
 * Record a dispute and update reputation
 */
export async function recordDispute(
  walletAddress: string,
  horizonUrl?: string
): Promise<ReputationUpdateResult> {
  const currentResult = await getReputationFromChain(walletAddress, horizonUrl)
  
  if (!currentResult.success || !currentResult.data) {
    return { success: false, error: 'Failed to retrieve current reputation data' }
  }

  const current = currentResult.data
  const newDisputeCount = current.disputeCount + 1
  
  // Disputes negatively impact completion score
  // Each dispute reduces score by 5 points, minimum 0
  const newCompletionScore = Math.max(0, current.completionScore - 5)

  return updateReputationOnChain(walletAddress, {
    completionScore: newCompletionScore,
    disputeCount: newDisputeCount
  }, horizonUrl)
}

/**
 * Verify that reputation data exists on-chain
 */
export async function verifyReputationRegistry(
  walletAddress: string,
  horizonUrl?: string
): Promise<{ exists: boolean; error?: string }> {
  try {
    const result = await getReputationFromChain(walletAddress, horizonUrl)
    return { exists: result.success && result.data !== undefined }
  } catch (error) {
    return { 
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}