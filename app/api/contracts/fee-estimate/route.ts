/**
 * POST /api/contracts/fee-estimate
 *
 * Returns a pre-deployment fee estimate for a Soroban escrow contract.
 * Runs a simulation against the Soroban RPC node (or returns a static
 * estimate when RPC is not configured) so clients can show users the
 * expected cost before they confirm deployment.
 *
 * Request body:
 *   { totalAmount: string, currency?: string, milestoneCount?: number }
 *
 * Response:
 *   {
 *     minFeeXlm: number,
 *     recommendedFeeXlm: number,
 *     maxFeeXlm: number,
 *     minFeeStroops: string,
 *     recommendedFeeStroops: string,
 *     resources: { ... },
 *     optimizationHints: [...],
 *     estimatedSavingsXlm: number,
 *     simulationMode: 'live' | 'static',
 *     simulatedAt: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import {
  createSorobanServer,
  getNetworkPassphrase,
  estimateTransactionFee,
  stroopsToXlm,
  BASE_FEE_STROOPS,
  RECOMMENDED_FEE_MULTIPLIER,
  FeeEstimationError,
  type FeeEstimate,
} from '@/lib/soroban/feeEstimator'
import { recordFeeEstimate } from '@/lib/gas/analyzer'
import {
  TransactionBuilder,
  Keypair,
  Operation,
  xdr,
} from '@stellar/stellar-sdk'

// ─────────────────────────────────────────────────────────────────────────────
// Static estimate (used when Soroban RPC is not configured)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a static fee estimate based on observed mainnet averages.
 * Milestone count affects write bytes (each milestone = ~512 bytes).
 */
function buildStaticEstimate(milestoneCount: number): FeeEstimate {
  const writeBytesPerMilestone = 512n
  const baseWriteBytes = 2048n
  const totalWriteBytes = baseWriteBytes + writeBytesPerMilestone * BigInt(milestoneCount)

  // Approximate resource fee: ~25 stroops/write byte + base overhead
  const resourceFeeStroops = totalWriteBytes * 25n + 5000n
  const recommendedResourceFee = BigInt(
    Math.ceil(Number(resourceFeeStroops) * RECOMMENDED_FEE_MULTIPLIER)
  )

  const minTotal = BASE_FEE_STROOPS + resourceFeeStroops
  const recTotal = BASE_FEE_STROOPS + recommendedResourceFee
  const maxTotal = recTotal * 2n

  const resources = {
    cpuInstructions: 2_500_000n,
    memoryBytes: 512_000n,
    ledgerReads: 3,
    ledgerWrites: 2 + milestoneCount,
    readBytes: 1024n,
    writeBytes: totalWriteBytes,
    eventsSizeBytes: 256n,
    transactionSizeBytes: 1500n + BigInt(milestoneCount * 200),
  }

  return {
    minFee: {
      baseFeeStroops: BASE_FEE_STROOPS,
      resourceFeeStroops,
      totalFeeStroops: minTotal,
      totalFeeXlm: stroopsToXlm(minTotal),
    },
    recommendedFee: {
      baseFeeStroops: BASE_FEE_STROOPS,
      resourceFeeStroops: recommendedResourceFee,
      totalFeeStroops: recTotal,
      totalFeeXlm: stroopsToXlm(recTotal),
    },
    maxFee: {
      baseFeeStroops: BASE_FEE_STROOPS,
      resourceFeeStroops: recommendedResourceFee * 2n,
      totalFeeStroops: maxTotal,
      totalFeeXlm: stroopsToXlm(maxTotal),
    },
    resources,
    optimizationHints:
      milestoneCount > 5
        ? [
            {
              category: 'storage' as const,
              severity: 'info' as const,
              message: `${milestoneCount} milestones will increase write bytes. Consider batching milestone data into a single storage entry.`,
              estimatedSavingsStroops: BigInt(milestoneCount - 5) * 512n * 25n,
            },
          ]
        : [],
    estimatedSavingsStroops:
      milestoneCount > 5 ? BigInt(milestoneCount - 5) * 512n * 25n : 0n,
    simulatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

function isValidAmount(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (request: NextRequest, auth) => {
  let body: {
    totalAmount?: unknown
    currency?: unknown
    milestoneCount?: unknown
    jobId?: unknown
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  if (!isValidAmount(body.totalAmount)) {
    return NextResponse.json(
      { error: 'totalAmount must be a positive number string', code: 'INVALID_TOTAL_AMOUNT' },
      { status: 400 }
    )
  }

  const milestoneCount =
    typeof body.milestoneCount === 'number' && body.milestoneCount >= 0
      ? Math.min(body.milestoneCount, 50) // cap at 50 for safety
      : 0

  const jobId =
    typeof body.jobId === 'number' && Number.isInteger(body.jobId) && body.jobId > 0
      ? body.jobId
      : null

  const rpcUrl = process.env.SOROBAN_RPC_URL
  let estimate: FeeEstimate
  let simulationMode: 'live' | 'static'

  if (rpcUrl) {
    // ── Live simulation via Soroban RPC ──────────────────────────────────────
    try {
      const server = createSorobanServer()
      const network = getNetworkPassphrase()

      // Build a representative deploy transaction for simulation.
      // We use a throwaway keypair since we only need the simulation result.
      const simulationKeypair = Keypair.random()

      // Simulate account load — use a known funded account if available,
      // otherwise fall back to static estimate.
      const deployerPublicKey =
        process.env.DEPLOYER_PUBLIC_KEY ?? simulationKeypair.publicKey()

      let account
      try {
        account = await server.getAccount(deployerPublicKey)
      } catch {
        // Account not found on this network — fall back to static
        estimate = buildStaticEstimate(milestoneCount)
        simulationMode = 'static'
        return buildResponse(estimate, simulationMode, jobId)
      }

      // Build a minimal deploy transaction for simulation purposes
      const simulationTx = new TransactionBuilder(account, {
        fee: BASE_FEE_STROOPS.toString(),
        networkPassphrase: network,
      })
        .addOperation(
          // Use a no-op invoke to simulate resource consumption
          Operation.invokeContractFunction({
            contract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
            function: 'deploy_escrow',
            args: [
              xdr.ScVal.scvString(auth.walletAddress),
              xdr.ScVal.scvString(body.totalAmount as string),
              xdr.ScVal.scvU32(milestoneCount),
            ],
          })
        )
        .setTimeout(30)
        .build()

      estimate = await estimateTransactionFee(server, simulationTx)
      simulationMode = 'live'
    } catch (err) {
      if (err instanceof FeeEstimationError) {
        console.warn('[fee-estimate] Simulation failed, using static estimate:', err.message)
      } else {
        console.warn('[fee-estimate] Unexpected error, using static estimate:', err)
      }
      estimate = buildStaticEstimate(milestoneCount)
      simulationMode = 'static'
    }
  } else {
    // ── Static estimate (no RPC configured) ──────────────────────────────────
    estimate = buildStaticEstimate(milestoneCount)
    simulationMode = 'static'
  }

  // Persist the estimate for accuracy tracking
  try {
    await recordFeeEstimate({
      jobId,
      operationType: 'contract_deploy',
      estimatedCpu: estimate.resources.cpuInstructions,
      estimatedMemory: estimate.resources.memoryBytes,
      estimatedLedgerReads: estimate.resources.ledgerReads,
      estimatedLedgerWrites: estimate.resources.ledgerWrites,
      estimatedReadBytes: estimate.resources.readBytes,
      estimatedWriteBytes: estimate.resources.writeBytes,
      minFeeStroops: estimate.minFee.totalFeeStroops,
      recommendedFeeStroops: estimate.recommendedFee.totalFeeStroops,
      maxFeeStroops: estimate.maxFee.totalFeeStroops,
      optimizationHints: estimate.optimizationHints,
      networkPassphrase: getNetworkPassphrase(),
    })
  } catch (err) {
    // Non-fatal — analytics persistence should not block the response
    console.error('[fee-estimate] Failed to persist estimate:', err)
  }

  return buildResponse(estimate, simulationMode, jobId)
})

function buildResponse(
  estimate: FeeEstimate,
  simulationMode: 'live' | 'static',
  jobId: number | null
) {
  return NextResponse.json({
    minFeeXlm: estimate.minFee.totalFeeXlm,
    recommendedFeeXlm: estimate.recommendedFee.totalFeeXlm,
    maxFeeXlm: estimate.maxFee.totalFeeXlm,
    minFeeStroops: estimate.minFee.totalFeeStroops.toString(),
    recommendedFeeStroops: estimate.recommendedFee.totalFeeStroops.toString(),
    maxFeeStroops: estimate.maxFee.totalFeeStroops.toString(),
    feeBreakdown: {
      baseFeeStroops: estimate.recommendedFee.baseFeeStroops.toString(),
      resourceFeeStroops: estimate.recommendedFee.resourceFeeStroops.toString(),
    },
    resources: {
      cpuInstructions: estimate.resources.cpuInstructions.toString(),
      memoryBytes: estimate.resources.memoryBytes.toString(),
      ledgerReads: estimate.resources.ledgerReads,
      ledgerWrites: estimate.resources.ledgerWrites,
      readBytes: estimate.resources.readBytes.toString(),
      writeBytes: estimate.resources.writeBytes.toString(),
      eventsSizeBytes: estimate.resources.eventsSizeBytes.toString(),
      transactionSizeBytes: estimate.resources.transactionSizeBytes.toString(),
    },
    optimizationHints: estimate.optimizationHints.map((h) => ({
      category: h.category,
      severity: h.severity,
      message: h.message,
      estimatedSavingsStroops: h.estimatedSavingsStroops.toString(),
      estimatedSavingsXlm: stroopsToXlm(h.estimatedSavingsStroops),
    })),
    estimatedSavingsXlm: stroopsToXlm(estimate.estimatedSavingsStroops),
    simulationMode,
    jobId,
    simulatedAt: estimate.simulatedAt,
  })
}
