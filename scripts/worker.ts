import { Server } from '@stellar/stellar-sdk'
import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'


dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Worker cannot connect to the database.')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

const server = new Server('https://horizon-testnet.stellar.org')


const PLATFORM_ESCROW_ACCOUNT = process.env.ESCROW_ACCOUNT_ID || 'GBD2Z3PZ2L5KHTC4YQZKVH4A4XJ4Q5X6M7N8O9P0Q1R2S3T4U5V6W7X8' // Dummy Address

async function notifyUsers(jobId: number, message: string) {
 
  console.log(`[NOTIFICATION] Sending update for Job #${jobId}: ${message}`)

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

      
      await notifyUsers(jobId, `A deposit of ${amount} ${currency} has been confirmed in escrow.`)

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
         SET escrow_status = 'released', status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ${jobId} AND escrow_status != 'released'
       `
 
       
       await notifyUsers(jobId, `Payment of ${amount} ${currency} has been released from escrow. Contract marked as completed.`)
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
      onerror: (error) => {
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
