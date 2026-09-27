import { neon } from "@neondatabase/serverless";

let _client: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    _client = neon(url);
  }
  return _client;
}

// Cast to a simple callable-tagged-template type so Turbopack doesn't
// choke on the Proxy that lib/db.ts exports.
export const db = ((...args: unknown[]) =>
  (getClient() as unknown as (...a: unknown[]) => unknown)(...args)) as unknown as ReturnType<typeof neon>;