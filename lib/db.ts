import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true

// The client is created lazily on first use, not at module import time.
// This allows `next build` to evaluate this module in CI without DATABASE_URL.
let _client: NeonQueryFunction<false, false> | null = null

function getClient(): NeonQueryFunction<false, false> {
  if (_client) return _client
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set.\n' +
      '  • Local dev  : copy env.example → .env.local and add your Neon connection string.\n' +
      '  • Production : set DATABASE_URL in your Railway environment variables.'
    )
  }
  _client = neon(url)
  return _client
}

// sql is a tagged-template function that delegates to the lazy client.
// Usage: await sql`SELECT 1`  — identical to the original neon() client.
export const sql: NeonQueryFunction<false, false> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getClient()(strings, ...values)

// Also expose transaction support
;(sql as unknown as { transaction: unknown }).transaction = (...args: unknown[]) =>
  (getClient() as unknown as { transaction: (...a: unknown[]) => unknown }).transaction(...args)
