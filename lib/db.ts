// lib/db.ts
//
// Lazy-initialised Neon serverless client.
// The client is created once and reused across requests in the same
// function instance. This matches the pattern already used in the repo
// (see git message: "fix: lazy-init db client").
//
// Usage:
//   import { sql } from "@/lib/db";
//   const rows = await sql`SELECT * FROM projects WHERE id = ${id}`;

import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
          "Copy env.example to .env and fill in your Neon connection string.",
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

// Re-exported as `sql` so call-sites read naturally:
//   const rows = await sql`SELECT …`
export const sql = new Proxy({} as ReturnType<typeof neon>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
  apply(_target, _thisArg, args: unknown[]) {
    return (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as ReturnType<typeof neon>;