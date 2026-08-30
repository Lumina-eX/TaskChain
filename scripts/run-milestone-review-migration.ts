import { neon } from '@neondatabase/serverless'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const sql = neon(DATABASE_URL)
  const migrationPath = path.join(__dirname, '..', 'lib', 'db', 'migrations', '008_milestone_submission_history.sql')

  try {
    console.log('🔄 Running milestone review migration...')
    
    // Read migration file
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
    
    // Execute migration
    await sql(migrationSQL)
    
    console.log('✅ Migration completed successfully!')
    console.log('')
    console.log('Created:')
    console.log('  - milestone_submission_history table')
    console.log('  - Extended milestones table with review columns')
    console.log('  - Indexes for performance')
    console.log('')
    console.log('You can now use the milestone review interface!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
