import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL

export const sql: ReturnType<typeof neon> = databaseUrl
  ? neon(databaseUrl)
  : ((() => {
      throw new Error('DATABASE_URL is not set')
    }) as ReturnType<typeof neon>)
