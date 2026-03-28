import { Server } from '@stellar/stellar-sdk'
import * as dotenv from 'dotenv'
import { sql } from '../lib/db'
import { NotificationService } from '../lib/notifications/service'

dotenv.config()

const server = new Server('https://horizon-testnet.stellar.org')

const PLATFORM_ESCROW_ACCOUNT = process.env.ESCROW_ACCOUNT_ID || 'GBD2Z3PZ2L5KHTC4YQZKVH4A4XJ4Q5X6M7N8O9P0Q1R2S3T4U5V6W7X8' // Dummy Address

async function notifyUsers(userId: number, type: any, data: any) {
  try {
    await NotificationService.send({
      userId,
      type,
      data,
    });
    console.log(`[WORKER] Internal notification sent for Job update.`);
  } catch (error) {
    console.error('[WORKER ERROR] Failed to send notification:', error);
  }
}

async function processPaymentEvent(record: any) {
  try {
    const transaction = await record.transaction()
    const memo = transaction.memo
    const isDeposit = record.to === PLATFORM_ESCROW_ACCOUNT
    const amount = record.amount
    const currency = record.asset_type === 'native' ? 'XLM' : record.asset_code

    if (isDeposit && memo) {
      const jobIdStr = memo.replace('JOB-', '')
      const jobId = parseInt(jobIdStr, 10)

      if (isNaN(jobId)) return

      console.log(`[WORKER] Detected DEPOSIT of ${amount} ${currency} for Job ${jobId}`)

      const existingTx = await sql`SELECT id FROM escrow_transactions WHERE stellar_transaction_hash = ${transaction.hash}`
      if (existingTx.length > 0) {
        console.log(`[WORKER] Transaction ${transaction.hash} already processed. Skipping.`)
        return
      }

      await sql`
        INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
        VALUES (${jobId}, ${transaction.hash}, ${amount}, ${currency}, 'deposit', ${record.from}, ${record.to}, 'confirmed')
      `

      await sql`
        UPDATE jobs 
        SET escrow_status = 'funded', status = 'in_progress', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId} AND escrow_status != 'funded'
      `

      // Fetch client and freelancer IDs for the job
      const jobInfo = await sql`SELECT client_id, freelancer_id, title FROM jobs WHERE id = ${jobId}`;
      if (jobInfo.length > 0) {
        const { client_id, freelancer_id, title } = jobInfo[0];
        // Notify both client and freelancer about the deposit
        await notifyUsers(client_id, 'funds_received', { jobTitle: title, amount, currency });
        if (freelancer_id) {
          await notifyUsers(freelancer_id, 'funds_received', { jobTitle: title, amount, currency });
        }
      }

    } else if (record.from === PLATFORM_ESCROW_ACCOUNT && memo) {
       const jobIdStr = memo.replace('JOB-', '')
       const jobId = parseInt(jobIdStr, 10)
 
       if (isNaN(jobId)) return
 
       console.log(`[WORKER] Detected RELEASE of ${amount} ${currency} for Job ${jobId}`)
 
       const existingTx = await sql`SELECT id FROM escrow_transactions WHERE stellar_transaction_hash = ${transaction.hash}`
       if (existingTx.length > 0) {
         console.log(`[WORKER] Transaction ${transaction.hash} already processed. Skipping.`)
         return
       }
 
       await sql`
         INSERT INTO escrow_transactions (job_id, stellar_transaction_hash, amount, currency, transaction_type, from_wallet, to_wallet, status)
         VALUES (${jobId}, ${transaction.hash}, ${amount}, ${currency}, 'release', ${record.from}, ${record.to}, 'confirmed')
       `
       
       await sql`
         UPDATE jobs 
         SET escrow_status = 'released',
             status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ${jobId} AND escrow_status != 'released'
       `
 
       // Notify freelancer about the release
       const jobInfo = await sql`SELECT freelancer_id, title FROM jobs WHERE id = ${jobId}`;
       if (jobInfo.length > 0 && jobInfo[0].freelancer_id) {
         await notifyUsers(jobInfo[0].freelancer_id, 'funds_released', { 
           jobTitle: jobInfo[0].title, 
           amount, 
           currency 
         });
       }
    }

  } catch (error) {
    console.error(`[WORKER ERROR] Failed to process payment record ${record.id}:`, error)
  }
}

async function startWorker() {
  console.log('[WORKER] Starting Stellar Blockchain Event Worker...')
  console.log(`[WORKER] Monitoring Escrow Account/Contract: ${PLATFORM_ESCROW_ACCOUNT}`)

  server.payments()
    .forAccount(PLATFORM_ESCROW_ACCOUNT)
    .cursor('now')
    .stream({
      onmessage: async (paymentRecord: any) => {
        if (paymentRecord.type === 'payment') {
          await processPaymentEvent(paymentRecord)
        }
      },
      onerror: (error: any) => {
        console.error('[WORKER ERROR] Stellar SDK Streaming Error:', error)
      }
    })
    
  setInterval(() => {
    console.log(`[WORKER HEARTBEAT] ${new Date().toISOString()} - Listening for events...`)
  }, 60000)
}

startWorker().catch((err) => {
  console.error('[FATAL WORKER ERROR]', err)
  process.exit(1)
})
