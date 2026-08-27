export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext, resolveUserIdByWallet } from "@/lib/auth/middleware";
import { sql } from "@/lib/db";

// ─── GET /api/conversations ─────────────────────────────────────────────────

/**
 * Returns all conversations for the authenticated user (as client or freelancer),
 * with the other party's info and the last message preview.
 */
export const GET = withAuth(async (_request: NextRequest, auth: AuthContext) => {
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress);
    if (userId === null) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const conversations = (await sql`
      SELECT
        c.id,
        c.contract_id,
        c.last_message,
        c.last_message_at,
        -- Contract title from jobs table via contracts
        COALESCE(j.title, 'Contract #' || c.contract_id) AS contract_title,
        -- Other party info
        CASE
          WHEN c.client_id = ${userId} THEN c.freelancer_id
          ELSE c.client_id
        END AS other_party_id,
        CASE
          WHEN c.client_id = ${userId} THEN fu.display_name
          ELSE cu.display_name
        END AS other_party_name,
        CASE
          WHEN c.client_id = ${userId} THEN fu.avatar_url
          ELSE cu.avatar_url
        END AS other_party_avatar,
        -- Unread count: messages not sent by this user after their last_read_at
        (
          SELECT COUNT(*)::int FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id != ${userId}
            AND (
              cp.last_read_at IS NULL
              OR m.created_at > cp.last_read_at
            )
        ) AS unread_count
      FROM conversations c
      JOIN users cu ON cu.id = c.client_id
      JOIN users fu ON fu.id = c.freelancer_id
      LEFT JOIN contracts ct ON ct.id = c.contract_id
      LEFT JOIN jobs j ON j.id = ct.job_id
      LEFT JOIN conversation_participants cp
        ON cp.conversation_id = c.id AND cp.user_id = ${userId}
      WHERE c.client_id = ${userId} OR c.freelancer_id = ${userId}
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `) as Array<{
      id: string;
      contract_id: string;
      contract_title: string;
      last_message: string | null;
      last_message_at: string | null;
      other_party_id: number;
      other_party_name: string | null;
      other_party_avatar: string | null;
      unread_count: number;
    }>;

    return NextResponse.json(
      {
        conversations: conversations.map((c) => ({
          id: c.id,
          contract_id: c.contract_id,
          contract_title: c.contract_title,
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          other_party_id: String(c.other_party_id),
          other_party_name: c.other_party_name ?? "Unknown",
          other_party_avatar: c.other_party_avatar,
          unread_count: Number(c.unread_count) || 0,
        })),
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[GET /api/conversations]", err);
    return NextResponse.json(
      { error: "Failed to load conversations", code: "CONVERSATIONS_FETCH_FAILED" },
      { status: 500 }
    );
  }
});

// ─── POST /api/conversations ────────────────────────────────────────────────

/**
 * Creates or retrieves an existing conversation for a contract.
 * Body: { contract_id: string }
 *
 * A conversation is unique per contract (one per contract).
 * Returns the conversation (existing or newly created).
 */
export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress);
    if (userId === null) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { contract_id } = body ?? {};

    if (!contract_id || typeof contract_id !== "string") {
      return NextResponse.json(
        { error: "contract_id is required", code: "MISSING_PARAM" },
        { status: 400 }
      );
    }

    // Fetch the contract to verify the user is a participant
    const contractRows = (await sql`
      SELECT id, client_id, freelancer_id FROM contracts
      WHERE id = ${contract_id}
      LIMIT 1
    `) as Array<{ id: string; client_id: number; freelancer_id: number | null }>;

    if (contractRows.length === 0) {
      return NextResponse.json(
        { error: "Contract not found", code: "CONTRACT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const contract = contractRows[0];
    const isParticipant =
      contract.client_id === userId || contract.freelancer_id === userId;

    if (!isParticipant) {
      return NextResponse.json(
        { error: "You are not a participant of this contract", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    if (!contract.freelancer_id) {
      return NextResponse.json(
        { error: "Cannot create a conversation until a freelancer is assigned", code: "NO_FREELANCER" },
        { status: 422 }
      );
    }

    // Upsert: find existing conversation or create one
    const existing = (await sql`
      SELECT id FROM conversations WHERE contract_id = ${contract_id} LIMIT 1
    `) as Array<{ id: string }>;

    if (existing.length > 0) {
      return NextResponse.json({ conversation_id: existing[0].id }, { status: 200 });
    }

    const created = (await sql`
      INSERT INTO conversations (contract_id, client_id, freelancer_id, created_at)
      VALUES (${contract_id}, ${contract.client_id}, ${contract.freelancer_id}, NOW())
      RETURNING id
    `) as Array<{ id: string }>;

    return NextResponse.json({ conversation_id: created[0].id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/conversations]", err);
    return NextResponse.json(
      { error: "Failed to create conversation", code: "CONVERSATION_CREATE_FAILED" },
      { status: 500 }
    );
  }
});
