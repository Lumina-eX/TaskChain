import { z } from 'zod'
import { sql } from '@/lib/db'
import {
  activityActionTypes,
  type ActivityLog,
  type ActivityLogPage,
  type ActivityActionType,
  type CreateActivityLogInput,
  type ListActivityLogsParams,
} from './types'

const uuidSchema = z.string().uuid()

function normalizeLimit(value: string | null): number {
  if (!value) return 50
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('limit must be an integer between 1 and 100')
  }
  return parsed
}

function normalizeOffset(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('offset must be a non-negative integer')
  }
  return parsed
}

function rowToLog(row: any): ActivityLog {
  return {
    id: row.id,
    actorId: row.actor_id,
    contractId: row.contract_id ?? null,
    projectId: row.project_id ?? null,
    milestoneId: row.milestone_id ?? null,
    disputeId: row.dispute_id ?? null,
    fileId: row.file_id ?? null,
    fileVersion: row.file_version ?? null,
    actionType: row.action_type,
    description: row.description,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    actorUsername: row.actor_username ?? null,
    actorWalletAddress: row.actor_wallet_address ?? null,
    projectTitle: row.project_title ?? null,
  }
}

export class ActivityService {
  async log(input: CreateActivityLogInput): Promise<ActivityLog> {
    const rows = await sql`
      INSERT INTO activity_logs (
        actor_id, contract_id, project_id, milestone_id, dispute_id,
        file_id, file_version,
        action_type, description, metadata
      )
      VALUES (
        ${input.actorId} ::uuid,
        ${input.contractId ?? null} ::uuid,
        ${input.projectId ?? null} ::uuid,
        ${input.milestoneId ?? null} ::uuid,
        ${input.disputeId ?? null} ::uuid,
        ${input.fileId ?? null} ::uuid,
        ${input.fileVersion ?? null},
        ${input.actionType} ::activity_action_type,
        ${input.description},
        ${JSON.stringify(input.metadata ?? {})} ::jsonb
      )
      RETURNING *
    `

    const [log] = await sql`
      SELECT l.*,
             u.username AS actor_username,
             u.wallet_address AS actor_wallet_address,
             p.title AS project_title
        FROM activity_logs l
        LEFT JOIN users u ON u.id = l.actor_id
        LEFT JOIN projects p ON p.id = l.project_id
       WHERE l.id = ${rows[0].id}
    `

    return rowToLog(log)
  }

  async list(
    params: ListActivityLogsParams,
    userId: string,
    userRole: string
  ): Promise<ActivityLogPage> {
    const limit = normalizeLimit(params.limitParam)
    const offset = normalizeOffset(params.offsetParam)

    if (params.contractId && !uuidSchema.safeParse(params.contractId).success) {
      throw new Error('contractId must be a valid UUID')
    }
    if (params.projectId && !uuidSchema.safeParse(params.projectId).success) {
      throw new Error('projectId must be a valid UUID')
    }
    if (params.actorId && !uuidSchema.safeParse(params.actorId).success) {
      throw new Error('actorId must be a valid UUID')
    }
    if (params.fileId && !uuidSchema.safeParse(params.fileId).success) {
      throw new Error('fileId must be a valid UUID')
    }
    if (
      params.actionType &&
      !activityActionTypes.includes(params.actionType as ActivityActionType)
    ) {
      throw new Error('actionType is not supported')
    }

    const isAdmin = userRole === 'admin'

    const countRows = await sql`
      SELECT COUNT(*)::int AS count_total
        FROM activity_logs l
        LEFT JOIN contracts c ON c.id = l.contract_id
       WHERE (${isAdmin}::boolean
              OR c.client_id = ${userId} ::uuid
              OR c.freelancer_id = ${userId} ::uuid
              OR l.actor_id = ${userId} ::uuid)
         AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
         AND (${params.projectId ?? null}::uuid IS NULL OR l.project_id = ${params.projectId ?? null}::uuid)
         AND (${params.actorId ?? null}::uuid IS NULL OR l.actor_id = ${params.actorId ?? null}::uuid)
         AND (${params.fileId ?? null}::uuid IS NULL OR l.file_id = ${params.fileId ?? null}::uuid)
         AND (${params.actionType ?? null}::activity_action_type IS NULL OR l.action_type = ${params.actionType ?? null}::activity_action_type)
    `
    const total = Number(countRows[0]?.count_total ?? 0)

    const rows = total > offset
      ? await sql`
          SELECT l.*,
                 u.username AS actor_username,
                 u.wallet_address AS actor_wallet_address,
                 p.title AS project_title
            FROM activity_logs l
            LEFT JOIN contracts c ON c.id = l.contract_id
            LEFT JOIN users u ON u.id = l.actor_id
            LEFT JOIN projects p ON p.id = l.project_id
           WHERE (${isAdmin}::boolean
                  OR c.client_id = ${userId} ::uuid
                  OR c.freelancer_id = ${userId} ::uuid
                  OR l.actor_id = ${userId} ::uuid)
             AND (${params.contractId ?? null}::uuid IS NULL OR l.contract_id = ${params.contractId ?? null}::uuid)
             AND (${params.projectId ?? null}::uuid IS NULL OR l.project_id = ${params.projectId ?? null}::uuid)
             AND (${params.actorId ?? null}::uuid IS NULL OR l.actor_id = ${params.actorId ?? null}::uuid)
             AND (${params.fileId ?? null}::uuid IS NULL OR l.file_id = ${params.fileId ?? null}::uuid)
             AND (${params.actionType ?? null}::activity_action_type IS NULL OR l.action_type = ${params.actionType ?? null}::activity_action_type)
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT ${limit}
          OFFSET ${offset}
        `
      : []

    const logs = rows.map(rowToLog)
    const nextOffset = offset + logs.length < total ? offset + logs.length : null

    return {
      logs,
      pagination: {
        limit,
        offset,
        total,
        nextOffset,
        hasMore: nextOffset !== null,
      },
    }
  }
}

export const activityService = new ActivityService()
