// lib/notification-preferences.ts
//
// Service layer for notification-preference persistence.
// All DB access is centralised here so route handlers remain thin
// and the logic is independently testable.
//
// Column mapping (DB snake_case ↔ JS camelCase — no ORM):
//   milestones_in_app  ↔  milestonesInApp
//   payments_in_app    ↔  paymentsInApp
//   disputes_in_app    ↔  disputesInApp
//   deadlines_in_app   ↔  deadlinesInApp
//   milestones_email   ↔  milestonesEmail
//   payments_email     ↔  paymentsEmail
//   disputes_email     ↔  disputesEmail
//   deadlines_email    ↔  deadlinesEmail
//   email_enabled      ↔  emailEnabled
//   push_enabled       ↔  pushEnabled
//   in_app_enabled     ↔  inAppEnabled
//   digest             ↔  digest

import { sql } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DigestCadence = "instant" | "daily" | "weekly";

/**
 * Full set of notification preferences for a single user.
 *
 * Event-category toggles let users silence a whole event group on a
 * per-channel basis (e.g. disable deadline emails while keeping in-app
 * deadline alerts on).
 *
 * The global `emailEnabled` / `pushEnabled` / `inAppEnabled` switches act
 * as master overrides — if `emailEnabled` is false, no emails are sent
 * regardless of the per-category settings.
 */
export interface NotificationPreferences {
  // Per-category — in-app channel
  milestonesInApp: boolean;
  paymentsInApp: boolean;
  disputesInApp: boolean;
  deadlinesInApp: boolean;

  // Per-category — email channel
  milestonesEmail: boolean;
  paymentsEmail: boolean;
  disputesEmail: boolean;
  deadlinesEmail: boolean;

  // Global channel switches
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;

  // Delivery cadence
  digest: DigestCadence;
}

/** Subset of fields that a PUT request may update. All keys are optional. */
export type UpdateNotificationPreferencesInput =
  Partial<NotificationPreferences>;

// ─── Constants ───────────────────────────────────────────────────────────────

export const DIGEST_VALUES: readonly DigestCadence[] = [
  "instant",
  "daily",
  "weekly",
] as const;

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  milestonesInApp: true,
  paymentsInApp: true,
  disputesInApp: true,
  deadlinesInApp: true,

  milestonesEmail: true,
  paymentsEmail: true,
  disputesEmail: true,
  deadlinesEmail: false,

  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,

  digest: "daily",
};

// ─── Errors ──────────────────────────────────────────────────────────────────

export class NotificationPreferencesError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NotificationPreferencesError";
    this.code = code;
  }
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

type PrefsRow = Record<string, unknown>;

function mapRow(row: PrefsRow): NotificationPreferences {
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;

  return {
    milestonesInApp: bool(row.milestones_in_app, DEFAULT_PREFERENCES.milestonesInApp),
    paymentsInApp:   bool(row.payments_in_app,   DEFAULT_PREFERENCES.paymentsInApp),
    disputesInApp:   bool(row.disputes_in_app,   DEFAULT_PREFERENCES.disputesInApp),
    deadlinesInApp:  bool(row.deadlines_in_app,  DEFAULT_PREFERENCES.deadlinesInApp),

    milestonesEmail: bool(row.milestones_email,  DEFAULT_PREFERENCES.milestonesEmail),
    paymentsEmail:   bool(row.payments_email,    DEFAULT_PREFERENCES.paymentsEmail),
    disputesEmail:   bool(row.disputes_email,    DEFAULT_PREFERENCES.disputesEmail),
    deadlinesEmail:  bool(row.deadlines_email,   DEFAULT_PREFERENCES.deadlinesEmail),

    emailEnabled:    bool(row.email_enabled,     DEFAULT_PREFERENCES.emailEnabled),
    pushEnabled:     bool(row.push_enabled,      DEFAULT_PREFERENCES.pushEnabled),
    inAppEnabled:    bool(row.in_app_enabled,    DEFAULT_PREFERENCES.inAppEnabled),

    digest: DIGEST_VALUES.includes(row.digest as DigestCadence)
      ? (row.digest as DigestCadence)
      : DEFAULT_PREFERENCES.digest,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns the stored preferences for `userId`, or `DEFAULT_PREFERENCES`
 * when no row exists yet (first-visit / first-call).
 */
export async function getNotificationPreferences(
  userId: number,
): Promise<NotificationPreferences> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new NotificationPreferencesError(
      "INVALID_USER",
      "userId must be a positive integer",
    );
  }

  const rows = (await sql`
    SELECT
      milestones_in_app, payments_in_app, disputes_in_app, deadlines_in_app,
      milestones_email,  payments_email,  disputes_email,  deadlines_email,
      email_enabled, push_enabled, in_app_enabled,
      digest
    FROM notification_preferences
    WHERE user_id = ${userId}
    LIMIT 1
  `) as PrefsRow[];

  if (rows.length === 0) {
    return { ...DEFAULT_PREFERENCES };
  }

  return mapRow(rows[0]);
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Merges `input` with existing preferences and persists via INSERT … ON CONFLICT.
 * Returns the final stored preferences.
 */
export async function updateNotificationPreferences(
  userId: number,
  input: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new NotificationPreferencesError(
      "INVALID_USER",
      "userId must be a positive integer",
    );
  }

  // Merge new values onto existing (or defaults for first-time save).
  const current = await getNotificationPreferences(userId);
  const merged: NotificationPreferences = { ...current, ...input };

  await sql`
    INSERT INTO notification_preferences (
      user_id,
      milestones_in_app, payments_in_app, disputes_in_app, deadlines_in_app,
      milestones_email,  payments_email,  disputes_email,  deadlines_email,
      email_enabled, push_enabled, in_app_enabled,
      digest,
      updated_at
    )
    VALUES (
      ${userId},
      ${merged.milestonesInApp}, ${merged.paymentsInApp},
      ${merged.disputesInApp},   ${merged.deadlinesInApp},
      ${merged.milestonesEmail}, ${merged.paymentsEmail},
      ${merged.disputesEmail},   ${merged.deadlinesEmail},
      ${merged.emailEnabled}, ${merged.pushEnabled}, ${merged.inAppEnabled},
      ${merged.digest},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      milestones_in_app = EXCLUDED.milestones_in_app,
      payments_in_app   = EXCLUDED.payments_in_app,
      disputes_in_app   = EXCLUDED.disputes_in_app,
      deadlines_in_app  = EXCLUDED.deadlines_in_app,
      milestones_email  = EXCLUDED.milestones_email,
      payments_email    = EXCLUDED.payments_email,
      disputes_email    = EXCLUDED.disputes_email,
      deadlines_email   = EXCLUDED.deadlines_email,
      email_enabled     = EXCLUDED.email_enabled,
      push_enabled      = EXCLUDED.push_enabled,
      in_app_enabled    = EXCLUDED.in_app_enabled,
      digest            = EXCLUDED.digest,
      updated_at        = NOW()
  `;

  return merged;
}

/**
 * Resets a user's preferences back to the platform defaults by deleting
 * their row. The next GET will return DEFAULT_PREFERENCES.
 */
export async function resetNotificationPreferences(
  userId: number,
): Promise<NotificationPreferences> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new NotificationPreferencesError(
      "INVALID_USER",
      "userId must be a positive integer",
    );
  }

  await sql`
    DELETE FROM notification_preferences
    WHERE user_id = ${userId}
  `;

  return { ...DEFAULT_PREFERENCES };
}
