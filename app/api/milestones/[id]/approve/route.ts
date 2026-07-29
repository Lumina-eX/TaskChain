export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAnyRbac, RbacContext } from '@/lib/auth/rbacMiddleware'
import { sql } from '@/lib/db'
import { activityService } from '@/lib/activity'
import { escrowService } from '@/lib/escrow/service'

export const POST = withAnyRbac(['milestone:approve', 'milestone:reject'], async (request: NextRequest, auth: RbacContext) => {
  const id = request.nextUrl.pathname.split('/').at(-2)

  try {
    const body = await request.json().catch(() => ({}))
    const { action, rejection_reason, signedXdr } = body

    if (!action || !['build', 'approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: "Field 'action' must be 'build', 'approve', or 'reject'", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json(
        { error: "Field 'rejection_reason' is required when rejecting", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (action === 'approve' && !signedXdr) {
      return NextResponse.json(
        { error: "Field 'signedXdr' is required when approving", code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const [milestone] = await sql`
      SELECT m.*, c.client_id, c.escrow_address, c.id AS cid
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })
    }

    if (!milestone.contract_id || milestone.client_id !== auth.userId) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    // ---- action: 'build' ----
    if (action === 'build') {
      if (milestone.status !== 'submitted') {
        return NextResponse.json(
          { error: `Cannot build approval: milestone status is '${milestone.status}'`, code: 'INVALID_STATUS' },
          { status: 422 }
        )
      }
      if (!milestone.escrow_address) {
        return NextResponse.json(
          { error: 'No escrow contract deployed for this milestone', code: 'NO_ESCROW_CONTRACT' },
          { status: 422 }
        )
      }

      try {
        const result = await escrowService.buildMilestoneApproval({
          contractId: milestone.cid,
          milestoneId: milestone.id,
          callerWalletAddress: auth.walletAddress,
        })

        return NextResponse.json({
          unsignedXdr: result.unsignedXdr,
          txStatus: result.txStatus,
        })
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || 'Failed to build approval transaction', code: 'BUILD_FAILED' },
          { status: 502 }
        )
      }
    }

    // ---- action: 'approve' ----
    if (action === 'approve') {
      if (milestone.status !== 'submitted') {
        return NextResponse.json(
          { error: `Cannot approve a milestone with status '${milestone.status}'`, code: 'INVALID_STATUS' },
          { status: 422 }
        )
      }
      if (!milestone.escrow_address) {
        return NextResponse.json(
          { error: 'No escrow contract deployed for this milestone', code: 'NO_ESCROW_CONTRACT' },
          { status: 422 }
        )
      }

      try {
        const result = await escrowService.submitMilestoneApproval({
          contractId: milestone.cid,
          milestoneId: milestone.id,
          signedXdr,
          callerWalletAddress: auth.walletAddress,
        })

        if (result.txStatus === 'failed') {
          return NextResponse.json(
            { error: 'Approval transaction failed on-chain', code: 'TX_FAILED', txHash: result.txHash },
            { status: 502 }
          )
        }

        activityService.log({
          actorId: auth.userId,
          milestoneId: id,
          contractId: milestone.cid,
          actionType: 'milestone_approved',
          description: `Milestone "${result.milestone?.title ?? milestone.title}" approved via Soroban`,
          metadata: { txHash: result.txHash, action: 'approve' },
        }).catch((err: unknown) => console.error('[activity] Failed to log milestone approval:', err))

        return NextResponse.json({
          milestone: result.milestone,
          txHash: result.txHash,
          txStatus: result.txStatus,
        })
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || 'Failed to submit approval transaction', code: 'SUBMIT_FAILED' },
          { status: 502 }
        )
      }
    }

    // ---- action: 'reject' ----
    const [updated] = await sql`
      UPDATE milestones SET
        status           = 'rejected',
        approved_at      = NULL,
        rejection_reason = ${rejection_reason},
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    activityService.log({
      actorId: auth.userId,
      milestoneId: id,
      contractId: milestone.cid,
      actionType: 'milestone_rejected',
      description: `Milestone "${updated.title}" rejected: "${rejection_reason}"`,
      metadata: { action, rejection_reason: rejection_reason ?? null },
    }).catch((err: unknown) => console.error('[activity] Failed to log milestone rejection:', err))

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to process milestone action', code: 'MILESTONE_ACTION_FAILED' }, { status: 500 })
  }
})