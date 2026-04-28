/**
 * scripts/migrate.ts
 *
 * Applies pending SQL migration files from lib/db/migrations/ against the
 * Neon Postgres database in filename order (001_…, 002_…, …).
 *
 * Uses the WebSocket-based Pool driver so it can run arbitrary multi-statement
 * SQL inside a real BEGIN/COMMIT transaction — the HTTP neon() driver cannot
 * do this because it only supports non-interactive (pre-batched) transactions.
 *
 * Safe to re-run: applied filenames are recorded in `schema_migrations` and
 * skipped on subsequent runs.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Required env var:
 *   DATABASE_URL  — Neon connection string, e.g.
 *                   postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Pool, neonConfig } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

// ── Env loading ───────────────────────────────────────────────────────────────
// __dirname is not available in ESM (which tsx uses by default).
// Reconstruct it from import.meta.url instead.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Project root = one level up from scripts/
const PROJECT_ROOT = path.resolve(__dirname, '..')

const envCandidates = [
  path.join(PROJECT_ROOT, '.env.local'),  // Next.js local overrides (gitignored)
  path.join(PROJECT_ROOT, '.env'),        // CI / Railway / plain dotenv
]

console.log('\n── Env file search ──────────────────────────────────────────')
let loadedFrom: string | null = null
for (const candidate of envCandidates) {
  const exists = fs.existsSync(candidate)
  console.log(`  ${exists ? '✓ found  ' : '✗ missing'} ${candidate}`)
  if (exists && !loadedFrom) {
    dotenv.config({ path: candidate })
    loadedFrom = candidate
  }
}

if (loadedFrom) {
  console.log(`\n  Loaded env from: ${loadedFrom}`)
} else {
  console.log('\n  No .env file found — relying on environment variables already in shell.')
}
console.log('─────────────────────────────────────────────────────────────\n')

// ── DATABASE_URL check ────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error(
    '✗ FATAL: DATABASE_URL is not set.\n\n' +
    '  Checklist:\n' +
    '  1. Does the file exist?  Expected one of:\n' +
    `       ${envCandidates.join('\n       ')}\n` +
    '  2. Is it named exactly ".env" or ".env.local" (no extra extension)?\n' +
    '     On Windows, Explorer can hide extensions — verify in the terminal:\n' +
    `       dir /a "${PROJECT_ROOT}"\n` +
    '  3. Does the file contain a line like:\n' +
    '       DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require\n' +
    '  4. No quotes around the value — dotenv does not strip them by default.\n'
  )
  process.exit(1)
}

// ── WebSocket polyfill ────────────────────────────────────────────────────────
// Pool (WebSocket driver) needs a WS constructor in Node.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
neonConfig.webSocketConstructor = require('ws')

const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'lib', 'db', 'migrations')

async function runMigrations() {
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    // ── 1. Ensure tracking table exists ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // ── 2. Fetch already-applied filenames ────────────────────────────────
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations'
    )
    const applied = new Set(rows.map((r) => r.filename))

    // ── 3. Collect pending migration files ───────────────────────────────
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort() // lexicographic: 001_ before 002_

    const pending = files.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log('✓ No new migrations to apply.')
      return
    }

    // ── 4. Apply each pending file inside its own transaction ─────────────
    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file)
      const sql = fs.readFileSync(filePath, 'utf-8').trim()

      console.log(`  apply  ${file} …`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        )
        await client.query('COMMIT')
        console.log(`  done   ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration "${file}" failed and was rolled back.\n${err}`)
      }
    }

    console.log(`\n✓ Applied ${pending.length} migration(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

runMigrations().catch((err) => {
  console.error('\n✗ Migration failed:', err)
  process.exit(1)
})
