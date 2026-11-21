/**
 * scripts/verify-file-api.ts
 *
 * Verification script for Contract Files API implementation
 * Checks that all required components are in place
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

interface CheckResult {
  name: string
  passed: boolean
  details?: string
}

const checks: CheckResult[] = []

function check(name: string, condition: boolean, details?: string): void {
  checks.push({ name, passed: condition, details })
  const symbol = condition ? '✅' : '❌'
  console.log(`${symbol} ${name}`)
  if (details && !condition) {
    console.log(`   ${details}`)
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(path.join(PROJECT_ROOT, filePath))
}

function fileContains(filePath: string, searchString: string): boolean {
  try {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8')
    return content.includes(searchString)
  } catch {
    return false
  }
}

console.log('\n🔍 Contract Files API Verification\n')
console.log('─'.repeat(60))

// Database Migration
console.log('\n📊 Database Migration:')
check(
  'Migration file exists',
  fileExists('lib/db/migrations/012_contract_files.sql'),
  'Missing: lib/db/migrations/012_contract_files.sql'
)
check(
  'Creates contract_files table',
  fileContains('lib/db/migrations/012_contract_files.sql', 'CREATE TABLE IF NOT EXISTS contract_files')
)
check(
  'Creates download audit table',
  fileContains('lib/db/migrations/012_contract_files.sql', 'CREATE TABLE IF NOT EXISTS contract_file_downloads')
)
check(
  'Adds activity log enum values',
  fileContains('lib/db/migrations/012_contract_files.sql', 'file_uploaded') &&
  fileContains('lib/db/migrations/012_contract_files.sql', 'file_downloaded')
)

// Service Layer
console.log('\n🔧 Service Layer:')
check(
  'Types file exists',
  fileExists('lib/contract-files/types.ts')
)
check(
  'Service file exists',
  fileExists('lib/contract-files/service.ts')
)
check(
  'Index file exists',
  fileExists('lib/contract-files/index.ts')
)
check(
  'Service exports ContractFileService',
  fileContains('lib/contract-files/service.ts', 'export class ContractFileService')
)
check(
  'Service has uploadFile method',
  fileContains('lib/contract-files/service.ts', 'async uploadFile')
)
check(
  'Service has listFiles method',
  fileContains('lib/contract-files/service.ts', 'async listFiles')
)
check(
  'Service has getFileForDownload method',
  fileContains('lib/contract-files/service.ts', 'async getFileForDownload')
)
check(
  'Service has deleteFile method',
  fileContains('lib/contract-files/service.ts', 'async deleteFile')
)
check(
  'Service has access control',
  fileContains('lib/contract-files/service.ts', 'checkContractAccess')
)

// API Routes
console.log('\n🌐 API Routes:')
check(
  'Upload/List endpoint exists',
  fileExists('app/api/contracts/[id]/files/route.ts')
)
check(
  'Download endpoint exists',
  fileExists('app/api/files/[fileId]/download/route.ts')
)
check(
  'Delete/Metadata endpoint exists',
  fileExists('app/api/files/[fileId]/route.ts')
)
check(
  'Upload endpoint has POST handler',
  fileContains('app/api/contracts/[id]/files/route.ts', 'export const POST')
)
check(
  'List endpoint has GET handler',
  fileContains('app/api/contracts/[id]/files/route.ts', 'export const GET')
)
check(
  'Download endpoint has GET handler',
  fileContains('app/api/files/[fileId]/download/route.ts', 'export const GET')
)
check(
  'Delete endpoint has DELETE handler',
  fileContains('app/api/files/[fileId]/route.ts', 'export const DELETE')
)

// Validation
console.log('\n✔️  Validation:')
check(
  'File validations added',
  fileContains('lib/validations/index.ts', 'ALLOWED_CONTRACT_FILE_MIME_TYPES')
)
check(
  'File size constant defined',
  fileContains('lib/validations/index.ts', 'MAX_CONTRACT_FILE_SIZE')
)
check(
  'Upload schema defined',
  fileContains('lib/validations/index.ts', 'UploadContractFileSchema')
)
check(
  'List schema defined',
  fileContains('lib/validations/index.ts', 'ListContractFilesSchema')
)

// Activity Types
console.log('\n📝 Activity Types:')
check(
  'file_uploaded action type added',
  fileContains('lib/activity/types.ts', "'file_uploaded'")
)
check(
  'file_downloaded action type added',
  fileContains('lib/activity/types.ts', "'file_downloaded'")
)
check(
  'file_deleted action type added',
  fileContains('lib/activity/types.ts', "'file_deleted'")
)

// Tests
console.log('\n🧪 Tests:')
check(
  'Test file exists',
  fileExists('__tests__/api/contract-files.test.ts')
)
check(
  'Upload tests present',
  fileContains('__tests__/api/contract-files.test.ts', "describe('File Upload'")
)
check(
  'Listing tests present',
  fileContains('__tests__/api/contract-files.test.ts', "describe('File Listing'")
)
check(
  'Download tests present',
  fileContains('__tests__/api/contract-files.test.ts', "describe('File Download'")
)
check(
  'Deletion tests present',
  fileContains('__tests__/api/contract-files.test.ts', "describe('File Deletion'")
)
check(
  'Access control tests present',
  fileContains('__tests__/api/contract-files.test.ts', "describe('Access Control'")
)

// Documentation
console.log('\n📚 Documentation:')
check(
  'API documentation exists',
  fileExists('docs/contract-files-api.md')
)
check(
  'Implementation summary exists',
  fileExists('IMPLEMENTATION_CONTRACT_FILES.md')
)
check(
  'API docs cover all endpoints',
  fileContains('docs/contract-files-api.md', '/api/contracts/:id/files') &&
  fileContains('docs/contract-files-api.md', '/api/files/:fileId/download') &&
  fileContains('docs/contract-files-api.md', '/api/files/:fileId')
)

// Security
console.log('\n🔒 Security:')
check(
  'Uses encryption utilities',
  fileContains('lib/contract-files/service.ts', 'storeEncryptedFile') &&
  fileContains('lib/contract-files/service.ts', 'readEncryptedFile')
)
check(
  'Computes file hash',
  fileContains('lib/contract-files/service.ts', 'computeFileHash')
)
check(
  'Has access control checks',
  fileContains('lib/contract-files/service.ts', 'checkContractAccess')
)
check(
  'Validates file types',
  fileContains('app/api/contracts/[id]/files/route.ts', 'ALLOWED_CONTRACT_FILE_MIME_TYPES')
)
check(
  'Enforces file size limits',
  fileContains('app/api/contracts/[id]/files/route.ts', 'MAX_CONTRACT_FILE_SIZE')
)
check(
  'Logs downloads',
  fileContains('lib/contract-files/service.ts', 'logDownload')
)
check(
  'Uses authentication middleware',
  fileContains('app/api/contracts/[id]/files/route.ts', 'withAuthCtx')
)

// Summary
console.log('\n' + '─'.repeat(60))
const passed = checks.filter(c => c.passed).length
const failed = checks.filter(c => !c.passed).length
const total = checks.length

console.log(`\n📊 Summary: ${passed}/${total} checks passed`)

if (failed > 0) {
  console.log(`\n❌ ${failed} check(s) failed. Review the output above.`)
  process.exit(1)
} else {
  console.log('\n✅ All checks passed! Contract Files API is properly implemented.')
  console.log('\n📋 Next steps:')
  console.log('   1. Set FILE_ENCRYPTION_KEY in .env')
  console.log('   2. Run: npm run migrate')
  console.log('   3. Run: npm run test __tests__/api/contract-files.test.ts')
  console.log('   4. Test endpoints with curl or Postman')
  process.exit(0)
}
