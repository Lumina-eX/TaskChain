import { sql } from '@/lib/db'

export type AuditAction =
  | 'dispute.view'
  | 'dispute.update'
  | 'contract.freeze'
  | 'contract.unfreeze'
  | 'user.ban'
  | 'user.unban'

export type AuditResourceType = 'dispute' | 'contract' | 'user'

export interface AuditEntry {
  adminWallet: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: number
  details?: Record<string, unknown>
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await sql`
    INSERT INTO admin_audit_log (admin_wallet, action, resource_type, resource_id, details)
    VALUES (
      ${entry.adminWallet},
      ${entry.action},
      ${entry.resourceType},
      ${entry.resourceId},
      ${entry.details ? JSON.stringify(entry.details) : null}
    )
  `
}
