/**
 * POST /api/escrow/create
 *
 * Deploy a new escrow contract for a project.
 * The authenticated user must be the client (project owner).
 *
 * Idempotency:
 *   Requires an "Idempotency-Key" header (or `idempotencyKey` body field) —
 *   a UUID or cryptographically random hash. Repeating the request with the
 *   same key returns the original response instead of deploying a second
 *   contract.
 *
 * Asset validation:
 *   The `currency` (and optional `tokenContractAddress`) must reference an
 *   allowlisted Stellar token for the active network. Unsupported, malformed,
 *   or mismatched assets are rejected with HTTP 422 before any contract is
 *   deployed.
 *
 * Body:
 *   projectId            string (UUID)
 *   freelancerId         string (UUID)
 *   freelancerWalletAddress string
 *   totalAmount          string  e.g. "500.00"
 *   currency             string  e.g. "USDC"
 *   tokenContractAddress? string (Soroban C... contract address)
 *   terms?               string
 *   milestones?          Array<{ title, amount, description?, dueDate? }>
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import {
  escrowService,
  EscrowError,
  escrowErrorToHttpStatus,
  EscrowAlreadyExistsError,
} from '@/lib/escrow'
import { assetAllowlist, AssetValidationError } from '@/lib/escrow/asset-allowlist'

export const POST = withAuth(withIdempotency('escrow_create', async (
  _request: NextRequest,
  auth: AuthContext,
  body: Record<string, unknown>
) => {
  // --- Resolve authenticated wallet to a DB user ---
  const users = await sql`
    SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1
  `
  if (users.length === 0) {
    return NextResponse.json(
      { error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' },
      { status: 401 }
    )
  }
  const clientId = users[0].id as string

  // --- Validate asset against the network allowlist before any deployment ---
  const currency = (body.currency as string) ?? 'USDC'
  const tokenContractAddress = body.tokenContractAddress as string | undefined
  try {
    await assetAllowlist.assertFundable({
      currency,
      tokenContractAddress,
      amount: body.totalAmount as string,
    })
  } catch (err) {
    if (err instanceof AssetValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 }
      )
    }
    throw err
  }

  try {
    const result = await escrowService.createEscrow({
      projectId: body.projectId as string,
      clientId,
      freelancerId: body.freelancerId as string,
      clientWalletAddress: auth.walletAddress,
      freelancerWalletAddress: body.freelancerWalletAddress as string,
      totalAmount: body.totalAmount as string,
      currency,
      terms: body.terms as string | undefined,
      milestones: body.milestones as Array<{
        title: string
        amount: string
        description?: string
        dueDate?: string
      }> | undefined,
    })

    return NextResponse.json(
      {
        contractId: result.contract.id,
        projectId: result.contract.projectId,
        escrowAddress: result.contract.escrowAddress,
        deployTxHash: result.deployTxHash,
        status: result.contract.status,
        escrowStatus: result.contract.escrowStatus,
        totalAmount: result.contract.totalAmount,
        currency: result.contract.currency,
        milestonesCreated: result.milestonesCreated,
        createdAt: result.contract.createdAt,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof EscrowAlreadyExistsError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          existingContractId: err.existingContractId,
        },
        { status: 409 }
      )
    }
    if (err instanceof EscrowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: escrowErrorToHttpStatus(err) }
      )
    }
    console.error('[escrow/create] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}))
