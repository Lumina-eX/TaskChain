import { Server } from '@stellar/stellar-sdk'
import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Worker cannot connect to the database.')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)
const server = new Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org')

const PLATFORM_ESCROW_ACCOUNT = process.env.ESCROW_ACCOUNT_ID || 'GBD2Z3PZ2L5KHTC4YQZKVH4A4XJ4Q5X6M7N8O9P0Q1R2S3T4U5V6W7X8'

async function createNotification(userId: number, title: string, message: string, type: string = 'info') {
  try {
    await sql`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (${userId}, ${title}, ${message}, ${type})
    `
    console.log(`[NOTIFICATION] Created for User #${userId}: ${title}`)
  } catch (error) {
    console.error(`[WORKER ERROR] Failed to create notification for User #${userId}:`, error)
  }
}

async function getJobById(jobId: number) {
  const jobs = await sql`
    SELECT j.*, c.wallet_address as client_wallet, f.wallet_address as freelancer_wallet 
    FROM jobs j
    JOIN users c ON j.client_id = c.id
    LEFT JOIN users f ON j.freelancer_id = f.id
    WHERE j.id = ${jobId}
  `
  return jobs[0] || null
}

async function getMilestoneById(milestoneId: number) {
  const milestones = await sql`
    SELECT m.*, j.client_id, j.freelancer_id, c.wallet_address as client_wallet, f.wallet_address as freelancer_wallet
    FROM milestones m
    JOIN jobs j ON m.job_id = j.id
    JOIN users c ON j.client_id = c.id
    LEFT JOIN users f ON j.freelancer_id = f.id
    WHERE m.id = ${milestoneId}
  `
  return milestones[0] || null
}

async function processPayment(record: any) {
  try {
    const transaction = await record.transaction()
    const memo = transaction.memo
    if (!memo) return

    const txHash = transaction.hash
    const amount = record.amount
    const currency = record.asset_type === 'native' ? 'XLM' : record.asset_code
    const from = record.from
    const to = record.to

    // Idempotency check
    const existingTx = await sql`SELECT id FROM escrow_transactions WHERE stellar_transaction_hash = ${txHash}`
    if (existingTx.length > 0) {
      console.log(`[WORKER] Transaction ${txHash} already processed. Skipping.`)
      return
    }

    if (memo.startsWith('JOB-')) {
      const jobId = parseInt(memo.replace('JOB-', ''), 10)
      if (isNaN(jobId)) return
      await handleJobPayment(jobId, record, txHash, amount, currency, from, to)
    } else if (memo.startsWith('MIL-')) {
      const milestoneId = parseInt(memo.replace('MIL-', ''), 10)
      if (isNaN(milestoneId)) return
      await handleMilestonePayment(milestoneId, record, txHash, amount, currency, from, to)
    }
  } catch (error) {
    console.error(`[WORKER ERROR] Failed to process payment record ${record.id}:`, error)
  }
}

async function handleJobPayment(jobId: number, record: any, txHash: string, amount: string, currency: string, from: string, to: string) {
  const job = await getJobById(jobId)
  if (!job) {
    console.warn(`[WORKER] Job #${jobId} not found for transaction ${txHash}`)
    return
  }

  const isDeposit = to === PLATFORM_ESCROW_ACCOUNT
  const isFromEscrow = from === PLATFORM_ESCROW_ACCOUNT

  if (isDeposit) {
    console.log(`[WORKER] Detected JOB DEPOSIT of ${amount} ${currency} for Job #${jobId}`)
    
    await sql`
      INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
      VALUES (${jobId}, ${txHash}, ${amount}, ${currency}, 'deposit', ${from}, ${to}, 'confirmed')
    `
    
    await sql`
      UPDATE jobs SET escrow_status = 'funded', status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId}
    `

    await createNotification(job.client_id, 'Escrow Funded', `You have successfully funded Job #${jobId} with ${amount} ${currency}.`, 'success')
    if (job.freelancer_id) {
      await createNotification(job.freelancer_id, 'Project Started', `Funding for Job #${jobId} is confirmed. You can now start working!`, 'info')
    }
  } else if (isFromEscrow) {
    const isRefund = to === job.client_wallet
    const isRelease = to === job.freelancer_wallet
    const type = isRefund ? 'refund' : (isRelease ? 'release' : 'dispute_resolution')

    console.log(`[WORKER] Detected JOB ${type.toUpperCase()} of ${amount} ${currency} for Job #${jobId}`)

    await sql`
      INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
      VALUES (${jobId}, ${txHash}, ${amount}, ${currency}, ${type}, ${from}, ${to}, 'confirmed')
    `

    if (isRelease) {
      await sql`
        UPDATE jobs SET escrow_status = 'released', status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId}
      `
      await createNotification(job.client_id, 'Payment Released', `Payment of ${amount} ${currency} for Job #${jobId} has been released.`, 'success')
      if (job.freelancer_id) {
        await createNotification(job.freelancer_id, 'Payment Received', `You have received ${amount} ${currency} for completing Job #${jobId}.`, 'success')
      }
    } else if (isRefund) {
      await sql`
        UPDATE jobs SET escrow_status = 'refunded', status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId}
      `
      await createNotification(job.client_id, 'Refund Received', `Refund of ${amount} ${currency} for Job #${jobId} has been processed.`, 'info')
      if (job.freelancer_id) {
        await createNotification(job.freelancer_id, 'Escrow Refunded', `Escrow for Job #${jobId} has been refunded to the client.`, 'warning')
      }
    }
  }
}

async function handleMilestonePayment(milestoneId: number, record: any, txHash: string, amount: string, currency: string, from: string, to: string) {
  const milestone = await getMilestoneById(milestoneId)
  if (!milestone) {
    console.warn(`[WORKER] Milestone #${milestoneId} not found for transaction ${txHash}`)
    return
  }

  const isDeposit = to === PLATFORM_ESCROW_ACCOUNT
  const isFromEscrow = from === PLATFORM_ESCROW_ACCOUNT

  if (isDeposit) {
    console.log(`[WORKER] Detected MILESTONE DEPOSIT of ${amount} ${currency} for Milestone #${milestoneId}`)
    
    await sql`
      INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
      VALUES (${milestone.job_id}, ${txHash}, ${amount}, ${currency}, 'deposit', ${from}, ${to}, 'confirmed')
    `
    
    await sql`
      UPDATE milestones SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${milestoneId}
    `

    await createNotification(milestone.client_id, 'Milestone Funded', `Milestone "${milestone.title}" funded with ${amount} ${currency}.`, 'success')
  } else if (isFromEscrow) {
    const isRefund = to === milestone.client_wallet
    const isRelease = to === milestone.freelancer_wallet
    const type = isRefund ? 'refund' : (isRelease ? 'release' : 'dispute_resolution')

    console.log(`[WORKER] Detected MILESTONE ${type.toUpperCase()} of ${amount} ${currency} for Milestone #${milestoneId}`)

    await sql`
      INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
      VALUES (${milestone.job_id}, ${txHash}, ${amount}, ${currency}, ${type}, ${from}, ${to}, 'confirmed')
    `

    if (isRelease) {
      await sql`
        UPDATE milestones SET status = 'released', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${milestoneId}
      `
      await createNotification(milestone.client_id, 'Milestone Released', `Payment for "${milestone.title}" has been released.`, 'success')
      if (milestone.freelancer_id) {
        await createNotification(milestone.freelancer_id, 'Milestone Payment Received', `You received ${amount} ${currency} for milestone "${milestone.title}".`, 'success')
      }

      // Check if all milestones are completed/released
      const allMilestones = await sql`SELECT status FROM milestones WHERE job_id = ${milestone.job_id}`
      const allReleased = allMilestones.every((m: any) => m.status === 'released')
      if (allReleased && allMilestones.length > 0) {
        await sql`
          UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${milestone.job_id} AND status != 'completed'
        `
        await createNotification(milestone.client_id, 'Project Completed', `All milestones for Job #${milestone.job_id} have been completed.`, 'success')
      }
    } else if (isRefund) {
      await sql`
        UPDATE milestones SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${milestoneId}
      `
      await createNotification(milestone.client_id, 'Milestone Refunded', `Refund for "${milestone.title}" processed.`, 'info')
    }
  }
}

async function startWorker() {
  console.log('[WORKER] Starting Stellar Blockchain Event Listener Service...')
  console.log(`[WORKER] Monitoring Escrow Account: ${PLATFORM_ESCROW_ACCOUNT}`)
  console.log(`[WORKER] Network: ${process.env.STELLAR_HORIZON_URL || 'Horizon Testnet'}`)

  try {
    // Check account existence
    await server.loadAccount(PLATFORM_ESCROW_ACCOUNT)
  } catch (err) {
    console.warn(`[WORKER WARNING] Could not load escrow account ${PLATFORM_ESCROW_ACCOUNT}. It may not exist on this network yet.`)
  }

  // Use streaming for real-time updates
  server.payments()
    .forAccount(PLATFORM_ESCROW_ACCOUNT)
    .cursor('now')
    .stream({
      onmessage: async (paymentRecord: any) => {
        if (paymentRecord.type === 'payment') {
          await processPayment(paymentRecord)
        }
      },
      onerror: (error: any) => {
        console.error('[WORKER ERROR] Stellar SDK Streaming Error:', error)
        // Streaming usually tries to reconnect automatically, but we log it.
      }
    })
    
  // Heartbeat
  setInterval(() => {
    console.log(`[WORKER HEARTBEAT] ${new Date().toISOString()} - Monitoring ${PLATFORM_ESCROW_ACCOUNT}...`)
  }, 60000)
}

process.on('SIGINT', () => {
  console.log('[WORKER] Gracefully shutting down...')
  process.exit(0)
})

startWorker().catch((err) => {
  console.error('[FATAL WORKER ERROR]', err)
  process.exit(1)
})

