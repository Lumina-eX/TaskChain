/**
 * POST /api/escrow/create
 *
 * Deploy a new escrow contract for a project.
 * The authenticated user must be the client (project owner).
 *
 * Body:
 *   projectId            string (UUID)
 *   freelancerId         string (UUID)
 *   freelancerWalletAddress string
 *   totalAmount          string  e.g. "500.00"
 *   currency             string  e.g. "USDC"
 *   terms?               string
 *   milestones?          Array<{ title, amount, description?, dueDate? }>
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import {
  escrowService,
  EscrowError,
  escrowErrorToHttpStatus,
  EscrowAlreadyExistsError,
} from '@/lib/escrow'

export const POST = withAuth(async (request: NextRequest, auth) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

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

  try {
    const result = await escrowService.createEscrow({
      projectId: body.projectId as string,
      clientId,
      freelancerId: body.freelancerId as string,
      clientWalletAddress: auth.walletAddress,
      freelancerWalletAddress: body.freelancerWalletAddress as string,
      totalAmount: body.totalAmount as string,
      currency: (body.currency as string) ?? 'USDC',
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
})
