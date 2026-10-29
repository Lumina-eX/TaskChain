-- Migration: 011_notification_preferences
-- Creates the notification_preferences table so users can persist
-- their per-channel and delivery-digest settings server-side.
--
-- Each user has at most one row (UNIQUE constraint on user_id).
-- Missing rows are treated as default preferences by the service layer.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Per-event-category toggles (in-app channel)
  milestones_in_app    BOOLEAN NOT NULL DEFAULT TRUE,
  payments_in_app      BOOLEAN NOT NULL DEFAULT TRUE,
  disputes_in_app      BOOLEAN NOT NULL DEFAULT TRUE,
  deadlines_in_app     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Per-event-category toggles (email channel)
  milestones_email     BOOLEAN NOT NULL DEFAULT TRUE,
  payments_email       BOOLEAN NOT NULL DEFAULT TRUE,
  disputes_email       BOOLEAN NOT NULL DEFAULT TRUE,
  deadlines_email      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Global channel switches
  email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Delivery cadence: 'instant' | 'daily' | 'weekly'
  digest               TEXT    NOT NULL DEFAULT 'daily'
                        CHECK (digest IN ('instant', 'daily', 'weekly')),

  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_notification_prefs_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON notification_preferences (user_id);
