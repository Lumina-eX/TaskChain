export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext, resolveUserIdByWallet } from "@/lib/auth/middleware";
import { sql } from "@/lib/db";

// ─── GET /api/messages?conversation_id=<id> ────────────────────────────────

/**
 * Returns all messages in a conversation.
 * The caller must be a participant of the conversation.
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress);
    if (userId === null) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const conversationId = request.nextUrl.searchParams.get("conversation_id");
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id is required", code: "MISSING_PARAM" },
        { status: 400 }
      );
    }

    // Verify the user is a participant in this conversation
    const participation = (await sql`
      SELECT id FROM conversations
      WHERE id = ${conversationId}
        AND (client_id = ${userId} OR freelancer_id = ${userId})
      LIMIT 1
    `) as Array<{ id: string }>;

    if (participation.length === 0) {
      return NextResponse.json(
        { error: "Conversation not found or access denied", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const messages = (await sql`
      SELECT
        m.id,
        m.content,
        m.sender_id,
        m.created_at,
        u.display_name AS sender_name,
        u.avatar_url   AS sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at ASC
    `) as Array<{
      id: string;
      content: string;
      sender_id: string;
      created_at: string;
      sender_name: string | null;
      sender_avatar: string | null;
    }>;

    return NextResponse.json(
      {
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender_id: String(m.sender_id),
          created_at: m.created_at,
          sender_name: m.sender_name ?? "Unknown",
          sender_avatar: m.sender_avatar,
        })),
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[GET /api/messages]", err);
    return NextResponse.json(
      { error: "Failed to load messages", code: "MESSAGES_FETCH_FAILED" },
      { status: 500 }
    );
  }
});

// ─── POST /api/messages ────────────────────────────────────────────────────

/**
 * Sends a new message in a conversation.
 * Body: { conversation_id: string; content: string }
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
    const { conversation_id, content } = body ?? {};

    if (!conversation_id || typeof conversation_id !== "string") {
      return NextResponse.json(
        { error: "conversation_id is required", code: "MISSING_PARAM" },
        { status: 400 }
      );
    }

    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        { error: "content must not be empty", code: "INVALID_CONTENT" },
        { status: 400 }
      );
    }

    if (trimmed.length > 4000) {
      return NextResponse.json(
        { error: "content exceeds maximum length of 4000 characters", code: "CONTENT_TOO_LONG" },
        { status: 400 }
      );
    }

    // Verify participant
    const participation = (await sql`
      SELECT id FROM conversations
      WHERE id = ${conversation_id}
        AND (client_id = ${userId} OR freelancer_id = ${userId})
      LIMIT 1
    `) as Array<{ id: string }>;

    if (participation.length === 0) {
      return NextResponse.json(
        { error: "Conversation not found or access denied", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Insert message
    const inserted = (await sql`
      INSERT INTO messages (conversation_id, sender_id, content, created_at)
      VALUES (${conversation_id}, ${userId}, ${trimmed}, NOW())
      RETURNING id, conversation_id, sender_id, content, created_at
    `) as Array<{
      id: string;
      conversation_id: string;
      sender_id: string;
      content: string;
      created_at: string;
    }>;

    // Update last_message_at on conversation
    await sql`
      UPDATE conversations
      SET last_message_at = NOW(), last_message = ${trimmed.slice(0, 200)}
      WHERE id = ${conversation_id}
    `;

    const user = (await sql`
      SELECT display_name, avatar_url FROM users WHERE id = ${userId} LIMIT 1
    `) as Array<{ display_name: string | null; avatar_url: string | null }>;

    const msg = inserted[0];
    return NextResponse.json(
      {
        message: {
          id: msg.id,
          content: msg.content,
          sender_id: String(msg.sender_id),
          created_at: msg.created_at,
          sender_name: user[0]?.display_name ?? "Unknown",
          sender_avatar: user[0]?.avatar_url ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/messages]", err);
    return NextResponse.json(
      { error: "Failed to send message", code: "MESSAGE_SEND_FAILED" },
      { status: 500 }
    );
  }
});
