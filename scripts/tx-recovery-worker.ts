import { txRecoveryService } from '@/lib/tx-recovery'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Transaction recovery worker cannot connect to database.')
  process.exit(1)
}

const POLL_INTERVAL_MS = Number(process.env.TX_POLL_INTERVAL_MS) || 10_000

async function startTxRecoveryWorker() {
  console.log('[TxRecoveryWorker] Starting Web3 Transaction Recovery & Confirmation Service...')
  console.log(`[TxRecoveryWorker] Poll interval set to ${POLL_INTERVAL_MS}ms`)

  const runPollCycle = async () => {
    try {
      const result = await txRecoveryService.pollPendingQueue(50)
      if (result.processed > 0) {
        console.log(
          `[TxRecoveryWorker] Polled ${result.processed} tx(s) — Succeeded: ${result.succeeded}, Failed: ${result.failed}, Expired: ${result.expired}, Still Pending: ${result.stillPending}`
        )
      }
      if (result.errors.length > 0) {
        console.error('[TxRecoveryWorker] Errors during poll cycle:', result.errors)
      }
    } catch (err) {
      console.error('[TxRecoveryWorker] Unhandled poll cycle error:', err)
    }
  }

  // Initial execution
  await runPollCycle()

  // Recurring loop
  const intervalHandle = setInterval(runPollCycle, POLL_INTERVAL_MS)

  // Heartbeat logger every 60s
  setInterval(() => {
    console.log(`[TxRecoveryWorker HEARTBEAT] ${new Date().toISOString()} — Daemon active`)
  }, 60_000)

  const shutdown = () => {
    console.log('[TxRecoveryWorker] Gracefully shutting down...')
    clearInterval(intervalHandle)
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startTxRecoveryWorker().catch((err) => {
  console.error('[FATAL TxRecoveryWorker ERROR]', err)
  process.exit(1)
})
