export const ACCESS_TOKEN_COOKIE = 'tc_access_token'
export const REFRESH_TOKEN_COOKIE = 'tc_refresh_token'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
export const NONCE_TTL_SECONDS = 5 * 60

// RBAC: User Roles
export type UserRole = 'freelancer' | 'client' | 'admin'

// RBAC: Permissions
export type Permission =
  // Project permissions
  | 'project:create'
  | 'project:view'
  | 'project:update'
  | 'project:delete'
  // Milestone permissions
  | 'milestone:view'
  | 'milestone:submit'
  | 'milestone:approve'
  | 'milestone:reject'
  // Escrow permissions
  | 'escrow:view'
  | 'escrow:fund'
  | 'escrow:release'
  | 'escrow:refund'
  // Contract permissions
  | 'contract:view'
  | 'contract:create'
  | 'contract:update'
  // Dispute permissions
  | 'dispute:create'
  | 'dispute:view'
  | 'dispute:resolve'
  // Admin permissions
  | 'admin:users_manage'
  | 'admin:contracts_freeze'
  | 'admin:system_oversight'
  // Activity log permissions
  | 'activity:view'
  // Payment ledger & reconciliation permissions
  | 'ledger:view'
  | 'ledger:export'
  | 'reconciliation:view'
  | 'reconciliation:run'
  | 'reconciliation:resolve'
  // General permissions
  | 'reputation:view'
  | 'reviews:create'
  | 'reviews:view'

// Role-based permission mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  freelancer: [
    'project:view',
    'milestone:view',
    'milestone:submit',
    'escrow:view',
    'contract:view',
    'dispute:create',
    'dispute:view',
    'activity:view',
    'ledger:view',
    'ledger:export',
    'reputation:view',
    'reviews:create',
    'reviews:view',
  ],
  client: [
    'project:create',
    'project:view',
    'project:update',
    'project:delete',
    'milestone:view',
    'milestone:approve',
    'milestone:reject',
    'escrow:view',
    'escrow:fund',
    'escrow:release',
    'escrow:refund',
    'contract:view',
    'contract:create',
    'contract:update',
    'dispute:create',
    'dispute:view',
    'activity:view',
    'ledger:view',
    'ledger:export',
    'reputation:view',
    'reviews:create',
    'reviews:view',
  ],
  admin: [
    // Admin has all permissions
    'project:create',
    'project:view',
    'project:update',
    'project:delete',
    'milestone:view',
    'milestone:submit',
    'milestone:approve',
    'milestone:reject',
    'escrow:view',
    'escrow:fund',
    'escrow:release',
    'escrow:refund',
    'contract:view',
    'contract:create',
    'contract:update',
    'dispute:create',
    'dispute:view',
    'dispute:resolve',
    'activity:view',
    'admin:users_manage',
    'admin:contracts_freeze',
    'admin:system_oversight',
    'ledger:view',
    'ledger:export',
    'reconciliation:view',
    'reconciliation:run',
    'reconciliation:resolve',
    'reputation:view',
    'reviews:create',
    'reviews:view',
  ],
}

// Helper function to check if a role has a specific permission
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

// Helper function to check if a role has any of the specified permissions
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

// Helper function to check if a role has all of the specified permissions
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}
