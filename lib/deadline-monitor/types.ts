export interface DeadlineCheckResult {
  /** Milestones for which an "upcoming deadline" reminder was sent this run. */
  remindersSent: number
  /** Milestones newly flagged as overdue (and notified) this run. */
  overdueFlagged: number
}

/** Milestone statuses that no longer need deadline tracking once reached. */
export const DEADLINE_EXEMPT_STATUSES = [
  'approved',
  'paid',
  'rejected',
  'disputed',
  'refunded',
  'expired',
  'auto_expired',
] as const

/** How far ahead of the due date to send a single "deadline approaching" reminder. */
export function getReminderWindowMs(): number {
  return 24 * 60 * 60 * 1000 // 24 hours
}
