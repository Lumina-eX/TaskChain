export const dynamic = "force-dynamic";

/**
 * GET  /api/notifications/preferences
 *   Returns the authenticated user's current notification preferences.
 *   If no row exists yet, the platform defaults are returned.
 *
 * PUT  /api/notifications/preferences
 *   Merges the supplied fields with existing preferences and persists them.
 *   All request body fields are optional; only supplied fields are updated.
 *
 * DELETE /api/notifications/preferences
 *   Resets the authenticated user's preferences back to platform defaults.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  withAuth,
  AuthContext,
  resolveUserIdByWallet,
} from "@/lib/auth/middleware";
import {
  enforceRateLimit,
  buildRateLimitKey,
} from "@/lib/security/rateLimit";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  resetNotificationPreferences,
  NotificationPreferencesError,
  DIGEST_VALUES,
} from "@/lib/notification-preferences";

// ─── Validation schema ────────────────────────────────────────────────────────

const UpdatePreferencesSchema = z
  .object({
    // Per-category — in-app
    milestonesInApp: z.boolean().optional(),
    paymentsInApp:   z.boolean().optional(),
    disputesInApp:   z.boolean().optional(),
    deadlinesInApp:  z.boolean().optional(),

    // Per-category — email
    milestonesEmail: z.boolean().optional(),
    paymentsEmail:   z.boolean().optional(),
    disputesEmail:   z.boolean().optional(),
    deadlinesEmail:  z.boolean().optional(),

    // Global channel switches
    emailEnabled:  z.boolean().optional(),
    pushEnabled:   z.boolean().optional(),
    inAppEnabled:  z.boolean().optional(),

    // Delivery cadence
    digest: z.enum(["instant", "daily", "weekly"] as [
      (typeof DIGEST_VALUES)[number],
      ...(typeof DIGEST_VALUES)[number][],
    ]).optional(),
  })
  .strict(); // reject unknown fields

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveUser(
  request: NextRequest,
  auth: AuthContext,
  namespace: string,
  rateLimitCount: number,
): Promise<{ userId: number } | NextResponse> {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, namespace, auth.walletAddress),
    limit: rateLimitCount,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const userId = await resolveUserIdByWallet(auth.walletAddress);
  if (userId === null) {
    return NextResponse.json(
      { error: "Platform user not found for this wallet", code: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  return { userId };
}

// ─── GET /api/notifications/preferences ──────────────────────────────────────

export const GET = withAuth(
  async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    const resolved = await resolveUser(
      request,
      auth,
      "notifications:preferences:get",
      60,
    );
    if (resolved instanceof NextResponse) return resolved;
    const { userId } = resolved;

    try {
      const preferences = await getNotificationPreferences(userId);
      return NextResponse.json(
        { preferences },
        { status: 200, headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (err) {
      if (err instanceof NotificationPreferencesError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        );
      }
      console.error("[GET /api/notifications/preferences]", err);
      return NextResponse.json(
        {
          error: "Failed to fetch notification preferences",
          code: "PREFERENCES_FETCH_FAILED",
        },
        { status: 503 },
      );
    }
  },
);

// ─── PUT /api/notifications/preferences ──────────────────────────────────────

export const PUT = withAuth(
  async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    const resolved = await resolveUser(
      request,
      auth,
      "notifications:preferences:put",
      30,
    );
    if (resolved instanceof NextResponse) return resolved;
    const { userId } = resolved;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        { status: 400 },
      );
    }

    const parsed = UpdatePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        {
          error: "Request body must include at least one preference field",
          code: "EMPTY_UPDATE",
        },
        { status: 400 },
      );
    }

    try {
      const preferences = await updateNotificationPreferences(
        userId,
        parsed.data,
      );
      return NextResponse.json({ preferences }, { status: 200 });
    } catch (err) {
      if (err instanceof NotificationPreferencesError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        );
      }
      console.error("[PUT /api/notifications/preferences]", err);
      return NextResponse.json(
        {
          error: "Failed to update notification preferences",
          code: "PREFERENCES_UPDATE_FAILED",
        },
        { status: 503 },
      );
    }
  },
);

// ─── DELETE /api/notifications/preferences ────────────────────────────────────

export const DELETE = withAuth(
  async (request: NextRequest, auth: AuthContext): Promise<NextResponse> => {
    const resolved = await resolveUser(
      request,
      auth,
      "notifications:preferences:delete",
      10,
    );
    if (resolved instanceof NextResponse) return resolved;
    const { userId } = resolved;

    try {
      const preferences = await resetNotificationPreferences(userId);
      return NextResponse.json(
        {
          message: "Notification preferences reset to defaults",
          preferences,
        },
        { status: 200 },
      );
    } catch (err) {
      if (err instanceof NotificationPreferencesError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        );
      }
      console.error("[DELETE /api/notifications/preferences]", err);
      return NextResponse.json(
        {
          error: "Failed to reset notification preferences",
          code: "PREFERENCES_RESET_FAILED",
        },
        { status: 503 },
      );
    }
  },
);
