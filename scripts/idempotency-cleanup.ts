/**
 * scripts/idempotency-cleanup.ts
 *
 * Purges expired idempotency records. Run on a schedule (e.g. hourly cron,
 * Railway scheduled job or GitHub Actions) so the `idempotency_records` table
 * does not grow unbounded.
 *
 * Retention is controlled by `IDEMPOTENCY_TTL_HOURS` (default 24). The
 * `expires_at` column is set when a record is created/completed, so this script
 * simply deletes anything past its expiry.
 *
 * Usage:
 *   npx tsx scripts/idempotency-cleanup.ts
 *   # or
 *   pnpm idempotency:cleanup
 */

import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error(
    'FATAL: DATABASE_URL is not set. Cannot purge idempotency records.'
  )
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

async function purgeExpired(): Promise<void> {
  const deleted = (await sql`
    DELETE FROM idempotency_records
     WHERE expires_at <= NOW()
    RETURNING id
  `) as Array<{ id: string }>

  console.log(
    `\n✓ Idempotency cleanup complete — purged ${deleted.length} expired record(s).\n`
  )
}

purgeExpired().catch((err) => {
  console.error('\n✗ Idempotency cleanup failed:', err)
  process.exit(1)
})
