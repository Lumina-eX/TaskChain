import { z } from 'zod'

// ─── Wallet ────────────────────────────────────────────────────────────────

const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/

export const WalletAddressSchema = z
  .string()
  .trim()
  .regex(STELLAR_ADDRESS_REGEX, 'Invalid Stellar wallet address')

export const WalletSignatureSchema = z.object({
  walletAddress: WalletAddressSchema,
  signature: z.string().trim().min(1).max(4096, 'Signature too long'),
  message: z.string().trim().min(1).max(512, 'Message too long'),
})

export const WalletTransactionSchema = z.object({
  walletAddress: WalletAddressSchema,
  txHash: z.string().trim().min(1).max(256, 'Transaction hash too long'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.enum(['XLM', 'USDC']).default('USDC'),
})

// ─── User ──────────────────────────────────────────────────────────────────

export const UserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  bio: z
    .string()
    .trim()
    .max(500, 'Bio must be 500 characters or fewer')
    .optional(),
  skills: z
    .array(z.string().trim().min(1))
    .max(20, 'You can add at most 20 skills')
    .optional(),
  hourlyRate: z
    .number()
    .nonnegative('Hourly rate cannot be negative')
    .optional(),
  walletAddress: WalletAddressSchema.optional(),
})

export const UserRoleSchema = z.enum(['client', 'freelancer', 'admin'])

export const UserAuthInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  nonce: z.string().trim().min(1).max(256),
  signature: z.string().trim().min(1).max(4096),
  message: z.string().trim().min(1).max(512).optional(),
})

// ─── Project ───────────────────────────────────────────────────────────────

const PROJECT_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES)

export const CreateProjectSchema = z.object({
  clientId: z
    .string({ required_error: 'clientId is required' })
    .uuid('clientId must be a valid UUID'),
  title: z
    .string({ required_error: 'title is required' })
    .min(1, 'title cannot be empty')
    .max(200, 'title must be 200 characters or fewer'),
  description: z
    .string()
    .max(2000, 'description must be 2000 characters or fewer')
    .optional(),
  budgetUsdc: z
    .number({ required_error: 'budgetUsdc is required' })
    .positive('budgetUsdc must be a positive number')
    .multipleOf(0.0000001, 'budgetUsdc supports up to 7 decimal places'),
  deadline: z.coerce
    .date()
    .min(new Date(), 'deadline must be in the future')
    .optional(),
  milestoneCount: z
    .number()
    .int('milestoneCount must be an integer')
    .min(0, 'milestoneCount cannot be negative')
    .optional(),
  freelancerId: z.string().uuid('freelancerId must be a valid UUID').optional(),
})

export const ListProjectsSchema = z.object({
  clientId: z.string().uuid('clientId must be a valid UUID').optional(),
  status: ProjectStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

// ─── Milestone ─────────────────────────────────────────────────────────────

const MILESTONE_STATUSES = ['pending', 'in_progress', 'submitted', 'approved', 'paid', 'disputed'] as const
const IMMUTABLE_MILESTONE_STATUSES = ['submitted', 'approved', 'paid'] as const

export const MilestoneStatusSchema = z.enum(MILESTONE_STATUSES)

export const IMMUTABLE_MILESTONE_STATUS_VALUES = IMMUTABLE_MILESTONE_STATUSES

export const CreateMilestoneSchema = z.object({
  project_id: z
    .string({ required_error: 'project_id is required' })
    .uuid('project_id must be a valid UUID'),
  title: z
    .string({ required_error: 'title is required' })
    .min(1, 'title cannot be empty')
    .max(200, 'title must be 200 characters or fewer'),
  description: z
    .string()
    .max(2000, 'description must be 2000 characters or fewer')
    .optional(),
  amount: z
    .number({ required_error: 'amount is required' })
    .positive('amount must be positive'),
  currency: z.enum(['XLM', 'USDC']).default('USDC'),
  due_date: z.coerce.date().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  deliverables: z.array(z.string().trim().min(1)).optional().default([]),
})

export const UpdateMilestoneSchema = z.object({
  title: z
    .string()
    .min(1, 'title cannot be empty')
    .max(200, 'title must be 200 characters or fewer')
    .optional(),
  description: z
    .string()
    .max(2000, 'description must be 2000 characters or fewer')
    .optional(),
  amount: z.number().positive('amount must be positive').optional(),
  currency: z.enum(['XLM', 'USDC']).optional(),
  due_date: z.coerce.date().optional(),
  sort_order: z.number().int().min(0).optional(),
  deliverables: z.array(z.string().trim().min(1)).optional(),
})

// ─── File Upload / Deliverables ───────────────────────────────────────────────

export const ALLOWED_DELIVERABLE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'text/plain',
  'text/csv',
  'application/json',
] as const

export const MAX_DELIVERABLE_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
export const MAX_DELIVERABLE_FILES_PER_BATCH = 10

export const ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES = [
  ...ALLOWED_DELIVERABLE_MIME_TYPES,
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
] as const

export const MAX_DISPUTE_EVIDENCE_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
export const MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH = 10

export const DeliverableMetadataSchema = z.object({
  id: z.string().uuid(),
  milestone_id: z.string().uuid(),
  uploader_id: z.string().uuid(),
  original_filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(127),
  file_size: z.number().int().positive(),
  file_hash: z.string().min(1),
  created_at: z.string().datetime(),
})

export type DeliverableMetadata = z.infer<typeof DeliverableMetadataSchema>

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UserProfileInput = z.infer<typeof UserProfileSchema>
export type WalletSignatureInput = z.infer<typeof WalletSignatureSchema>
