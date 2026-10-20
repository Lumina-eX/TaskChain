import { NextRequest, NextResponse } from "next/server";
import { readAccessToken, verifyAccessToken } from "@/lib/auth/session";
import { UUIDSchema } from "@/lib/proposals";
import { db as sql } from "@/lib/proposals/db";
import { updateProposalStatus } from "@/lib/proposals/service";
import type { ProposalStatus } from "@/lib/proposals/types";

type RouteContext = { params: Promise<{ id: string }> };
const REVIEW_STATUSES = ["pending", "shortlisted", "accepted", "rejected"] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const token = readAccessToken(request);
  const verified = token ? verifyAccessToken(token) : null;
  if (!verified) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUIDSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("status" in body) ||
    typeof body.status !== "string" ||
    !REVIEW_STATUSES.includes(body.status as (typeof REVIEW_STATUSES)[number])
  ) {
    return NextResponse.json({ error: "A valid review status is required" }, { status: 422 });
  }

  try {
    const users = (await sql`
      SELECT id, role FROM users
      WHERE wallet_address = ${verified.walletAddress}
      LIMIT 1
    `) as { id: string; role: string }[];
    const user = users[0];
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role !== "client" && user.role !== "admin") {
      return NextResponse.json({ error: "Only clients can review proposals" }, { status: 403 });
    }

    const proposal = await updateProposalStatus(
      id,
      user.id,
      body.status as Extract<ProposalStatus, "pending" | "shortlisted" | "accepted" | "rejected">
    );
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") {
      return NextResponse.json(
        { error: "Only pending or shortlisted proposals can be changed" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "PROPOSAL_CHANGED") {
      return NextResponse.json(
        { error: "Proposal changed concurrently; reload and retry" },
        { status: 409 }
      );
    }
    console.error(`[PATCH /api/proposals/${id}/review]`, error);
    return NextResponse.json({ error: "Failed to update proposal" }, { status: 500 });
  }
}
