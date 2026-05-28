/**
 * Soroban Fee Estimator & Gas Optimizer
 *
 * Provides:
 *  - Pre-submission fee simulation via Soroban RPC `simulateTransaction`
 *  - Resource footprint analysis (CPU, memory, ledger I/O, tx size)
 *  - Optimization recommendations (footprint trimming, fee bumping strategy)
 *  - Actual fee extraction from submitted transaction results
 *
 * Stellar fee model recap:
 *  - Classic base fee: 100 stroops per operation (minimum)
 *  - Soroban resource fee: computed from CPU instructions, memory, ledger
 *    reads/writes, event bytes, and transaction size
 *  - 1 XLM = 10,000,000 stroops
 *  - Fee bump transactions can raise the fee on already-submitted txs
 */

import {
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const STROOPS_PER_XLM = 10_000_000n
export const BASE_FEE_STROOPS = BigInt(BASE_FEE) // 100 stroops

/**
 * Safety multiplier applied to simulated resource limits before submission.
 * Soroban simulation can undercount slightly; 1.15 = 15% headroom.
 */
export const RESOURCE_SAFETY_FACTOR = 1.15

/**
 * Recommended fee multiplier over the minimum to improve inclusion speed
 * during moderate network congestion.
 */
export const RECOMMENDED_FEE_MULTIPLIER = 1.25

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SorobanResourceUsage {
  cpuInstructions: bigint
  memoryBytes: bigint
  ledgerReads: number
  ledgerWrites: number
  readBytes: bigint
  writeBytes: bigint
  eventsSizeBytes: bigint
  transactionSizeBytes: bigint
}

export interface FeeBreakdown {
  baseFeeStroops: bigint
  resourceFeeStroops: bigint
  totalFeeStroops: bigint
  totalFeeXlm: number
}

export interface FeeEstimate {
  /** Absolute minimum fee; transaction may be rejected under congestion. */
  minFee: FeeBreakdown
  /** Recommended fee with safety headroom for reliable inclusion. */
  recommendedFee: FeeBreakdown
  /** Conservative upper bound (2× recommended) for time-sensitive ops. */
  maxFee: FeeBreakdown
  /** Simulated resource consumption with safety factor applied. */
  resources: SorobanResourceUsage
  /** Human-readable optimization suggestions. */
  optimizationHints: OptimizationHint[]
  /** Estimated savings in stroops if all hints are applied. */
  estimatedSavingsStroops: bigint
  simulatedAt: string
}

export interface OptimizationHint {
  category: 'storage' | 'cpu' | 'transaction_size' | 'fee_strategy' | 'batching'
  severity: 'info' | 'warning' | 'critical'
  message: string
  /** Estimated stroops saved by applying this hint. */
  estimatedSavingsStroops: bigint
}

export interface ActualFeeRecord {
  stellarTxHash: string
  baseFeeStroops: bigint
  resourceFeeStroops: bigint
  totalFeeStroops: bigint
  totalFeeXlm: number
  resources: Partial<SorobanResourceUsage>
  ledgerSequence: bigint
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_XLM)
}

export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.ceil(xlm * Number(STROOPS_PER_XLM)))
}

function applyFactor(value: bigint, factor: number): bigint {
  return BigInt(Math.ceil(Number(value) * factor))
}

function buildFeeBreakdown(baseFee: bigint, resourceFee: bigint): FeeBreakdown {
  const total = baseFee + resourceFee
  return {
    baseFeeStroops: baseFee,
    resourceFeeStroops: resourceFee,
    totalFeeStroops: total,
    totalFeeXlm: stroopsToXlm(total),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimization hint generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes resource usage and produces actionable optimization hints.
 * Thresholds are based on Soroban mainnet limits (Protocol 21).
 */
export function generateOptimizationHints(
  resources: SorobanResourceUsage,
  resourceFeeStroops: bigint
): OptimizationHint[] {
  const hints: OptimizationHint[] = []

  // ── CPU instructions ──────────────────────────────────────────────────────
  // Soroban max: 100,000,000 instructions per tx
  const CPU_MAX = 100_000_000n
  const cpuPct = Number(resources.cpuInstructions) / Number(CPU_MAX)
  if (cpuPct > 0.8) {
    hints.push({
      category: 'cpu',
      severity: 'critical',
      message: `CPU usage is ${(cpuPct * 100).toFixed(1)}% of the limit. Consider splitting logic across multiple transactions or simplifying contract functions.`,
      estimatedSavingsStroops: applyFactor(resourceFeeStroops, 0.3),
    })
  } else if (cpuPct > 0.5) {
    hints.push({
      category: 'cpu',
      severity: 'warning',
      message: `CPU usage is ${(cpuPct * 100).toFixed(1)}% of the limit. Review loops and recursive calls in contract logic.`,
      estimatedSavingsStroops: applyFactor(resourceFeeStroops, 0.1),
    })
  }

  // ── Memory ────────────────────────────────────────────────────────────────
  // Soroban max: 40 MB per tx
  const MEM_MAX = 40 * 1024 * 1024n
  const memPct = Number(resources.memoryBytes) / Number(MEM_MAX)
  if (memPct > 0.7) {
    hints.push({
      category: 'storage',
      severity: 'warning',
      message: `Memory usage is ${(memPct * 100).toFixed(1)}% of the limit. Avoid large in-memory data structures; prefer ledger storage for persistent data.`,
      estimatedSavingsStroops: applyFactor(resourceFeeStroops, 0.08),
    })
  }

  // ── Write bytes ───────────────────────────────────────────────────────────
  // Write bytes are the most expensive resource; each byte costs ~25 stroops
  const WRITE_BYTES_WARN = 8_192n  // 8 KB
  const WRITE_BYTES_CRIT = 32_768n // 32 KB
  if (resources.writeBytes > WRITE_BYTES_CRIT) {
    const savingsEstimate = (resources.writeBytes - WRITE_BYTES_WARN) * 25n
    hints.push({
      category: 'storage',
      severity: 'critical',
      message: `Write footprint is ${(Number(resources.writeBytes) / 1024).toFixed(1)} KB. Pack multiple fields into a single storage entry (e.g., use a struct/map) to reduce write operations.`,
      estimatedSavingsStroops: savingsEstimate,
    })
  } else if (resources.writeBytes > WRITE_BYTES_WARN) {
    hints.push({
      category: 'storage',
      severity: 'warning',
      message: `Write footprint is ${(Number(resources.writeBytes) / 1024).toFixed(1)} KB. Consider consolidating storage keys to reduce write bytes.`,
      estimatedSavingsStroops: (resources.writeBytes - WRITE_BYTES_WARN) * 25n,
    })
  }

  // ── Ledger writes ─────────────────────────────────────────────────────────
  // Each ledger write entry has a fixed cost; minimize distinct keys
  if (resources.ledgerWrites > 10) {
    hints.push({
      category: 'storage',
      severity: 'warning',
      message: `${resources.ledgerWrites} ledger write entries detected. Batch related state into fewer storage keys to reduce per-entry overhead.`,
      estimatedSavingsStroops: BigInt(resources.ledgerWrites - 5) * 500n,
    })
  }

  // ── Transaction size ──────────────────────────────────────────────────────
  // Soroban max: 70 KB per tx; each byte costs ~1 stroop
  const TX_SIZE_WARN = 30_720n  // 30 KB
  const TX_SIZE_CRIT = 57_344n  // 56 KB
  if (resources.transactionSizeBytes > TX_SIZE_CRIT) {
    hints.push({
      category: 'transaction_size',
      severity: 'critical',
      message: `Transaction size is ${(Number(resources.transactionSizeBytes) / 1024).toFixed(1)} KB (approaching 70 KB limit). Remove unnecessary authorization entries or split into multiple transactions.`,
      estimatedSavingsStroops: resources.transactionSizeBytes - TX_SIZE_WARN,
    })
  } else if (resources.transactionSizeBytes > TX_SIZE_WARN) {
    hints.push({
      category: 'transaction_size',
      severity: 'info',
      message: `Transaction size is ${(Number(resources.transactionSizeBytes) / 1024).toFixed(1)} KB. Trim unused authorization entries to reduce size fees.`,
      estimatedSavingsStroops: (resources.transactionSizeBytes - TX_SIZE_WARN) / 2n,
    })
  }

  // ── Fee strategy ──────────────────────────────────────────────────────────
  if (resourceFeeStroops > 50_000n) {
    hints.push({
      category: 'fee_strategy',
      severity: 'info',
      message: `Resource fee is ${stroopsToXlm(resourceFeeStroops).toFixed(5)} XLM. For non-urgent operations, submit during off-peak hours (UTC 02:00–08:00) when base fees are lower.`,
      estimatedSavingsStroops: applyFactor(resourceFeeStroops, 0.05),
    })
  }

  return hints
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: simulate transaction and build fee estimate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates a Soroban transaction against the RPC node and returns a full
 * fee estimate with optimization hints.
 *
 * @param server  - Soroban RPC server instance
 * @param tx      - Unsigned transaction to simulate (built with TransactionBuilder)
 */
export async function estimateTransactionFee(
  server: SorobanRpc.Server,
  tx: Transaction
): Promise<FeeEstimate> {
  const simResult = await server.simulateTransaction(tx)

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new FeeEstimationError(
      `Simulation failed: ${simResult.error}`,
      simResult
    )
  }

  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    throw new FeeEstimationError('Simulation returned unexpected result', simResult)
  }

  // Extract resource usage from simulation result
  const simResources = simResult.transactionData?.build()?.resources()
  const minResourceFee = BigInt(simResult.minResourceFee ?? '0')

  const rawResources: SorobanResourceUsage = {
    cpuInstructions: BigInt(simResources?.instructions() ?? 0),
    memoryBytes: BigInt(simResources?.readBytes() ?? 0), // approximation
    ledgerReads: simResources?.footprint()?.readOnly()?.length ?? 0,
    ledgerWrites: simResources?.footprint()?.readWrite()?.length ?? 0,
    readBytes: BigInt(simResources?.readBytes() ?? 0),
    writeBytes: BigInt(simResources?.writeBytes() ?? 0),
    eventsSizeBytes: BigInt(simResources?.extendedMetaDataSizeBytes() ?? 0),
    transactionSizeBytes: BigInt(tx.toEnvelope().toXDR().length),
  }

  // Apply safety factor to resource limits
  const safeResources: SorobanResourceUsage = {
    cpuInstructions: applyFactor(rawResources.cpuInstructions, RESOURCE_SAFETY_FACTOR),
    memoryBytes: applyFactor(rawResources.memoryBytes, RESOURCE_SAFETY_FACTOR),
    ledgerReads: Math.ceil(rawResources.ledgerReads * RESOURCE_SAFETY_FACTOR),
    ledgerWrites: Math.ceil(rawResources.ledgerWrites * RESOURCE_SAFETY_FACTOR),
    readBytes: applyFactor(rawResources.readBytes, RESOURCE_SAFETY_FACTOR),
    writeBytes: applyFactor(rawResources.writeBytes, RESOURCE_SAFETY_FACTOR),
    eventsSizeBytes: applyFactor(rawResources.eventsSizeBytes, RESOURCE_SAFETY_FACTOR),
    transactionSizeBytes: rawResources.transactionSizeBytes, // size is fixed
  }

  const minFee = buildFeeBreakdown(BASE_FEE_STROOPS, minResourceFee)
  const recommendedResourceFee = applyFactor(minResourceFee, RECOMMENDED_FEE_MULTIPLIER)
  const recommendedFee = buildFeeBreakdown(BASE_FEE_STROOPS, recommendedResourceFee)
  const maxFee = buildFeeBreakdown(BASE_FEE_STROOPS, recommendedResourceFee * 2n)

  const hints = generateOptimizationHints(safeResources, recommendedResourceFee)
  const estimatedSavingsStroops = hints.reduce(
    (sum, h) => sum + h.estimatedSavingsStroops,
    0n
  )

  return {
    minFee,
    recommendedFee,
    maxFee,
    resources: safeResources,
    optimizationHints: hints,
    estimatedSavingsStroops,
    simulatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actual fee extraction from submitted transaction result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts actual fee data from a confirmed Soroban transaction result.
 * Call this after `server.getTransaction()` returns `SUCCESS`.
 */
export function extractActualFees(
  txHash: string,
  getTransactionResult: SorobanRpc.Api.GetSuccessfulTransactionResponse
): ActualFeeRecord {
  const envelope = getTransactionResult.envelopeXdr
  const resultMeta = getTransactionResult.resultMetaXdr

  let baseFeeStroops = BASE_FEE_STROOPS
  let resourceFeeStroops = 0n
  let cpuInstructions: bigint | undefined
  let writeBytes: bigint | undefined
  let readBytes: bigint | undefined
  let ledgerWrites: number | undefined
  let ledgerReads: number | undefined

  try {
    // Parse the transaction envelope to get the declared fee
    const txEnvelope = xdr.TransactionEnvelope.fromXDR(
      Buffer.from(envelope.toXDR())
    )
    const innerTx = txEnvelope.value().tx()
    const declaredFee = BigInt(innerTx.fee())

    // For Soroban transactions, the resource fee is embedded in the ext
    const ext = (innerTx as any).ext?.()
    if (ext?.switch()?.value === 1) {
      const sorobanData = ext.sorobanData()
      resourceFeeStroops = BigInt(sorobanData.resourceFee?.() ?? 0)
      baseFeeStroops = declaredFee - resourceFeeStroops
    } else {
      baseFeeStroops = declaredFee
    }
  } catch {
    // Fallback: use declared fee as base fee
  }

  try {
    // Extract resource consumption from transaction result meta
    const meta = xdr.TransactionMeta.fromXDR(Buffer.from(resultMeta.toXDR()))
    if (meta.switch().value === 3) {
      const v3 = meta.v3()
      const resources = v3.sorobanMeta?.()?.ext?.()
      if (resources) {
        cpuInstructions = BigInt((resources as any).cpuInsns?.() ?? 0)
        writeBytes = BigInt((resources as any).writeBytes?.() ?? 0)
        readBytes = BigInt((resources as any).readBytes?.() ?? 0)
      }
    }
  } catch {
    // Resource meta extraction is best-effort
  }

  const totalFeeStroops = baseFeeStroops + resourceFeeStroops

  return {
    stellarTxHash: txHash,
    baseFeeStroops,
    resourceFeeStroops,
    totalFeeStroops,
    totalFeeXlm: stroopsToXlm(totalFeeStroops),
    resources: {
      cpuInstructions,
      writeBytes,
      readBytes,
      ledgerWrites,
      ledgerReads,
    },
    ledgerSequence: BigInt(getTransactionResult.ledger),
  }
}

/**
 * Lightweight fee extractor for classic Stellar payment operations
 * (used by the worker when processing escrow deposits/releases).
 *
 * @param feeCharged - fee_charged field from Horizon payment record (in stroops)
 * @param txHash     - transaction hash
 * @param ledger     - ledger sequence number
 */
export function extractClassicFees(
  feeCharged: string | number,
  txHash: string,
  ledger: number
): ActualFeeRecord {
  const totalFeeStroops = BigInt(feeCharged)
  return {
    stellarTxHash: txHash,
    baseFeeStroops: totalFeeStroops,
    resourceFeeStroops: 0n,
    totalFeeStroops,
    totalFeeXlm: stroopsToXlm(totalFeeStroops),
    resources: {},
    ledgerSequence: BigInt(ledger),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction builder helpers (optimized)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepares a Soroban transaction with optimized resource limits derived from
 * simulation. Applies the safety factor and recommended fee multiplier.
 *
 * @param server      - Soroban RPC server
 * @param tx          - Transaction to prepare (will be cloned)
 * @param feeMultiplier - Override the default RECOMMENDED_FEE_MULTIPLIER
 */
export async function prepareOptimizedTransaction(
  server: SorobanRpc.Server,
  tx: Transaction,
  feeMultiplier: number = RECOMMENDED_FEE_MULTIPLIER
): Promise<{ preparedTx: Transaction; estimate: FeeEstimate }> {
  const estimate = await estimateTransactionFee(server, tx)

  // Use stellar-sdk's built-in prepareTransaction which sets resource limits
  // from simulation and applies the recommended fee
  const preparedTx = await server.prepareTransaction(tx) as Transaction

  // Override the fee with our recommended amount
  const recommendedFeeStroops = applyFactor(
    estimate.minFee.resourceFeeStroops,
    feeMultiplier
  ) + BASE_FEE_STROOPS

  // Rebuild with the optimized fee
  const rebuilt = TransactionBuilder.cloneFrom(preparedTx, {
    fee: recommendedFeeStroops.toString(),
  }).build()

  return { preparedTx: rebuilt, estimate }
}

// ─────────────────────────────────────────────────────────────────────────────
// Network helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Soroban RPC server instance from environment variables.
 */
export function createSorobanServer(): SorobanRpc.Server {
  const rpcUrl =
    process.env.SOROBAN_RPC_URL ??
    process.env.STELLAR_HORIZON_URL?.replace('horizon', 'soroban-rpc') ??
    'https://soroban-testnet.stellar.org'

  return new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') })
}

/**
 * Returns the network passphrase from env or defaults to testnet.
 */
export function getNetworkPassphrase(): string {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    Networks.TESTNET
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

export class FeeEstimationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'FeeEstimationError'
  }
}
