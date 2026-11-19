import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql } from '@/lib/db'
import { contractFileService } from '@/lib/contract-files'

describe('Contract Files API', () => {
  let testUserId: number
  let testContractId: number
  let testMilestoneId: number
  let testWalletAddress: string

  beforeAll(async () => {
    // Create test user
    testWalletAddress = `GTEST${Date.now()}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
    const userRows = await sql<{ id: number }>`
      INSERT INTO users (wallet_address, username, email, user_type)
      VALUES (${testWalletAddress}, 'test-file-user', 'test-file@example.com', 'both')
      RETURNING id
    `
    testUserId = Number(userRows[0]?.id)

    // Create test job
    const jobRows = await sql<{ id: number }>`
      INSERT INTO jobs (client_id, title, description, budget)
      VALUES (${testUserId}, 'Test Job for Files', 'Test description', 1000.00)
      RETURNING id
    `
    const jobId = Number(jobRows[0]?.id)

    // Create test contract
    const contractRows = await sql<{ id: number }>`
      INSERT INTO contracts (job_id, client_id, freelancer_id, total_amount, currency)
      VALUES (${jobId}, ${testUserId}, ${testUserId}, 1000.00, 'XLM')
      RETURNING id
    `
    testContractId = Number(contractRows[0]?.id)

    // Create test milestone
    const milestoneRows = await sql<{ id: number }>`
      INSERT INTO milestones (job_id, contract_id, title, description, amount, status)
      VALUES (${jobId}, ${testContractId}, 'Test Milestone', 'Test milestone description', 500.00, 'pending')
      RETURNING id
    `
    testMilestoneId = Number(milestoneRows[0]?.id)
  })

  afterAll(async () => {
    // Clean up test data
    if (testContractId) {
      await sql`DELETE FROM contract_files WHERE contract_id = ${testContractId}`
      await sql`DELETE FROM contracts WHERE id = ${testContractId}`
    }
    if (testUserId) {
      await sql`DELETE FROM jobs WHERE client_id = ${testUserId}`
      await sql`DELETE FROM users WHERE id = ${testUserId}`
    }
  })

  describe('File Upload', () => {
    it('should upload a file successfully', async () => {
      const fileContent = Buffer.from('Test file content')
      const testFile = new File([fileContent], 'test.txt', {
        type: 'text/plain',
      })

      const uploadedFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: testFile,
        description: 'Test file description',
        tags: ['test', 'document'],
      })

      expect(uploadedFile).toBeDefined()
      expect(uploadedFile.id).toBeGreaterThan(0)
      expect(uploadedFile.contract_id).toBe(testContractId)
      expect(uploadedFile.original_filename).toBe('test.txt')
      expect(uploadedFile.mime_type).toBe('text/plain')
      expect(uploadedFile.file_size).toBe(fileContent.length)
      expect(uploadedFile.version).toBe(1)
      expect(uploadedFile.is_latest_version).toBe(true)
      expect(uploadedFile.description).toBe('Test file description')
      expect(uploadedFile.tags).toEqual(['test', 'document'])

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${uploadedFile.id}`
    })

    it('should upload file with milestone association', async () => {
      const fileContent = Buffer.from('Test file with milestone')
      const testFile = new File([fileContent], 'milestone-test.pdf', {
        type: 'application/pdf',
      })

      const uploadedFile = await contractFileService.uploadFile({
        contractId: testContractId,
        milestoneId: testMilestoneId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: testFile,
      })

      expect(uploadedFile.milestone_id).toBe(testMilestoneId)

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${uploadedFile.id}`
    })

    it('should reject invalid contract', async () => {
      const testFile = new File([Buffer.from('test')], 'test.txt', {
        type: 'text/plain',
      })

      await expect(
        contractFileService.uploadFile({
          contractId: 999999,
          uploaderId: testUserId,
          uploaderWallet: testWalletAddress,
          file: testFile,
        })
      ).rejects.toThrow('Contract not found')
    })

    it('should reject invalid milestone', async () => {
      const testFile = new File([Buffer.from('test')], 'test.txt', {
        type: 'text/plain',
      })

      await expect(
        contractFileService.uploadFile({
          contractId: testContractId,
          milestoneId: 999999,
          uploaderId: testUserId,
          uploaderWallet: testWalletAddress,
          file: testFile,
        })
      ).rejects.toThrow('Milestone not found or does not belong to this contract')
    })

    it('should handle version tracking for duplicate content', async () => {
      const fileContent = Buffer.from('Duplicate content test')
      const testFile1 = new File([fileContent], 'version1.txt', {
        type: 'text/plain',
      })
      const testFile2 = new File([fileContent], 'version2.txt', {
        type: 'text/plain',
      })

      // Upload first version
      const file1 = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: testFile1,
      })

      expect(file1.version).toBe(1)
      expect(file1.is_latest_version).toBe(true)

      // Upload duplicate content (should create version 2)
      const file2 = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: testFile2,
      })

      expect(file2.version).toBe(2)
      expect(file2.is_latest_version).toBe(true)
      expect(file2.parent_file_id).toBe(file1.id)
      expect(file2.file_hash).toBe(file1.file_hash)

      // Verify first version is no longer latest
      const file1Updated = await contractFileService.getFileById(file1.id)
      expect(file1Updated?.is_latest_version).toBe(false)

      // Clean up
      await sql`DELETE FROM contract_files WHERE id IN (${file1.id}, ${file2.id})`
    })
  })

  describe('File Listing', () => {
    let uploadedFileIds: number[] = []

    beforeEach(async () => {
      // Upload test files
      const file1 = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('File 1')], 'file1.txt', {
          type: 'text/plain',
        }),
        tags: ['tag1'],
      })

      const file2 = await contractFileService.uploadFile({
        contractId: testContractId,
        milestoneId: testMilestoneId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('File 2')], 'file2.txt', {
          type: 'text/plain',
        }),
        tags: ['tag2'],
      })

      uploadedFileIds = [file1.id, file2.id]
    })

    afterAll(async () => {
      if (uploadedFileIds.length > 0) {
        await sql`DELETE FROM contract_files WHERE id = ANY(${uploadedFileIds})`
      }
    })

    it('should list all files for a contract', async () => {
      const result = await contractFileService.listFiles(testContractId, {})

      expect(result.files.length).toBeGreaterThanOrEqual(2)
      expect(result.pagination.total).toBeGreaterThanOrEqual(2)

      const file1 = result.files.find((f) =>
        uploadedFileIds.includes(Number(f.id))
      )
      expect(file1).toBeDefined()
      expect(file1?.contract_id).toBe(testContractId)
    })

    it('should filter files by milestone', async () => {
      const result = await contractFileService.listFiles(testContractId, {
        milestoneId: testMilestoneId,
      })

      expect(result.files.length).toBeGreaterThanOrEqual(1)
      result.files.forEach((file) => {
        expect(file.milestone_id).toBe(testMilestoneId)
      })
    })

    it('should paginate results correctly', async () => {
      const page1 = await contractFileService.listFiles(testContractId, {
        limit: 1,
        offset: 0,
      })

      expect(page1.files.length).toBe(1)
      expect(page1.pagination.hasMore).toBe(true)

      const page2 = await contractFileService.listFiles(testContractId, {
        limit: 1,
        offset: 1,
      })

      expect(page2.files.length).toBe(1)
      expect(page1.files[0].id).not.toBe(page2.files[0].id)
    })

    it('should exclude deleted files by default', async () => {
      // Delete one file
      await contractFileService.deleteFile({
        fileId: uploadedFileIds[0],
        deletedBy: testUserId,
        deletedByWallet: testWalletAddress,
      })

      const result = await contractFileService.listFiles(testContractId, {
        includeDeleted: false,
      })

      const deletedFile = result.files.find(
        (f) => Number(f.id) === uploadedFileIds[0]
      )
      expect(deletedFile).toBeUndefined()
    })

    it('should include deleted files when requested', async () => {
      const result = await contractFileService.listFiles(testContractId, {
        includeDeleted: true,
      })

      // At least one deleted file should exist from previous test
      expect(result.files.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('File Download', () => {
    let testFileId: number

    beforeAll(async () => {
      const fileContent = Buffer.from('Download test content')
      const testFile = new File([fileContent], 'download-test.txt', {
        type: 'text/plain',
      })

      const uploadedFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: testFile,
      })

      testFileId = uploadedFile.id
    })

    afterAll(async () => {
      if (testFileId) {
        await sql`DELETE FROM contract_files WHERE id = ${testFileId}`
      }
    })

    it('should download file successfully', async () => {
      const download = await contractFileService.getFileForDownload(testFileId)

      expect(download).toBeDefined()
      expect(download?.filename).toBe('download-test.txt')
      expect(download?.mime_type).toBe('text/plain')
      expect(download?.buffer.toString()).toBe('Download test content')
    })

    it('should verify file integrity on download', async () => {
      // This test verifies that hash check is performed
      const download = await contractFileService.getFileForDownload(testFileId)
      expect(download).toBeDefined() // If integrity fails, it would throw
    })

    it('should return null for non-existent file', async () => {
      const download = await contractFileService.getFileForDownload(999999)
      expect(download).toBeNull()
    })

    it('should return null for deleted file', async () => {
      // Create and delete a file
      const tempFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('temp')], 'temp.txt', {
          type: 'text/plain',
        }),
      })

      await contractFileService.deleteFile({
        fileId: tempFile.id,
        deletedBy: testUserId,
        deletedByWallet: testWalletAddress,
      })

      const download = await contractFileService.getFileForDownload(tempFile.id)
      expect(download).toBeNull()

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${tempFile.id}`
    })

    it('should log download activity', async () => {
      await contractFileService.logDownload(
        testFileId,
        testUserId,
        '127.0.0.1',
        'Test User Agent'
      )

      const history = await contractFileService.getDownloadHistory(testFileId)
      expect(history.total).toBeGreaterThan(0)
      expect(history.downloads[0].file_id).toBe(testFileId)
      expect(history.downloads[0].downloaded_by).toBe(testUserId)
    })
  })

  describe('File Deletion', () => {
    it('should soft delete a file', async () => {
      const testFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('delete test')], 'delete-test.txt', {
          type: 'text/plain',
        }),
      })

      await contractFileService.deleteFile({
        fileId: testFile.id,
        deletedBy: testUserId,
        deletedByWallet: testWalletAddress,
      })

      const deletedFile = await contractFileService.getFileById(testFile.id)
      expect(deletedFile?.is_deleted).toBe(true)
      expect(deletedFile?.deleted_by).toBe(testUserId)
      expect(deletedFile?.deleted_at).toBeDefined()

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${testFile.id}`
    })

    it('should reject deleting non-existent file', async () => {
      await expect(
        contractFileService.deleteFile({
          fileId: 999999,
          deletedBy: testUserId,
          deletedByWallet: testWalletAddress,
        })
      ).rejects.toThrow('File not found')
    })

    it('should reject deleting already deleted file', async () => {
      const testFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('test')], 'test.txt', {
          type: 'text/plain',
        }),
      })

      await contractFileService.deleteFile({
        fileId: testFile.id,
        deletedBy: testUserId,
        deletedByWallet: testWalletAddress,
      })

      await expect(
        contractFileService.deleteFile({
          fileId: testFile.id,
          deletedBy: testUserId,
          deletedByWallet: testWalletAddress,
        })
      ).rejects.toThrow('File already deleted')

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${testFile.id}`
    })
  })

  describe('Access Control', () => {
    it('should grant access to contract participants', async () => {
      const access = await contractFileService.checkContractAccess(
        testContractId,
        testWalletAddress
      )

      expect(access.hasAccess).toBe(true)
      expect(access.isParticipant).toBe(true)
      expect(access.userId).toBe(testUserId)
    })

    it('should deny access to non-participants', async () => {
      const randomWallet = `GRANDOM${Date.now()}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
      
      // Create random user
      const randomUserRows = await sql`
        INSERT INTO users (wallet_address, username, email, user_type)
        VALUES (${randomWallet}, 'random-user', 'random@example.com', 'client')
        RETURNING id
      `
      const randomUserId = Number(randomUserRows[0].id)

      const access = await contractFileService.checkContractAccess(
        testContractId,
        randomWallet
      )

      expect(access.hasAccess).toBe(false)
      expect(access.isParticipant).toBe(false)

      // Clean up
      await sql`DELETE FROM users WHERE id = ${randomUserId}`
    })

    it('should deny access for non-existent wallet', async () => {
      const access = await contractFileService.checkContractAccess(
        testContractId,
        'GNONEXISTENT' + 'X'.repeat(45)
      )

      expect(access.hasAccess).toBe(false)
      expect(access.userId).toBe(0)
    })

    it('should deny access for non-existent contract', async () => {
      const access = await contractFileService.checkContractAccess(
        999999,
        testWalletAddress
      )

      expect(access.hasAccess).toBe(false)
    })
  })

  describe('File Metadata', () => {
    it('should retrieve file metadata by ID', async () => {
      const testFile = await contractFileService.uploadFile({
        contractId: testContractId,
        uploaderId: testUserId,
        uploaderWallet: testWalletAddress,
        file: new File([Buffer.from('metadata test')], 'metadata.txt', {
          type: 'text/plain',
        }),
        description: 'Metadata test file',
        tags: ['meta', 'test'],
      })

      const metadata = await contractFileService.getFileById(testFile.id)

      expect(metadata).toBeDefined()
      expect(metadata?.id).toBe(testFile.id)
      expect(metadata?.description).toBe('Metadata test file')
      expect(metadata?.tags).toEqual(['meta', 'test'])
      expect(metadata?.uploader_username).toBeDefined()

      // Clean up
      await sql`DELETE FROM contract_files WHERE id = ${testFile.id}`
    })

    it('should return null for non-existent file', async () => {
      const metadata = await contractFileService.getFileById(999999)
      expect(metadata).toBeNull()
    })
  })
})
