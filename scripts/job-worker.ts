import { hostname } from 'os'
import { createJobHandlers, jobQueueService } from '@/lib/jobs'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Job worker cannot connect to the database.')
  process.exit(1)
}

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS) || 5_000
const BATCH_SIZE = Number(process.env.JOB_BATCH_SIZE) || 10
const WORKER_ID = process.env.JOB_WORKER_ID || `${hostname()}-${process.pid}`

async function startJobWorker() {
  console.log(`[JobWorker] Starting background job worker ${WORKER_ID}`)
  console.log(`[JobWorker] Poll interval ${POLL_INTERVAL_MS}ms, batch size ${BATCH_SIZE}`)
  const handlers = createJobHandlers()

  const run = async () => {
    try {
      const result = await jobQueueService.processBatch({ workerId: WORKER_ID, batchSize: BATCH_SIZE, handlers })
      if (result.claimed > 0) {
        console.log(
          `[JobWorker] Claimed ${result.claimed} — completed ${result.completed}, retried ${result.retried}, failed ${result.failed}`,
        )
      }
      if (result.errors.length > 0) console.error('[JobWorker] Errors:', result.errors)
    } catch (error) {
      console.error('[JobWorker] Poll cycle failed:', error)
    }
  }

  await run()
  const interval = setInterval(run, POLL_INTERVAL_MS)
  const shutdown = () => {
    console.log('[JobWorker] Shutting down...')
    clearInterval(interval)
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startJobWorker().catch((error) => {
  console.error('[FATAL JobWorker]', error)
  process.exit(1)
})
