// app/api/proposals/[id]/route.ts
//
// Issue #216 — Proposal Management API.
//
// PATCH  /api/proposals/:id — owning freelancer edits content (status → updated),
//                             or the project's client moves the status
//                             (under_review / accepted / rejected).
// DELETE /api/proposals/:id — owning freelancer withdraws the proposal.
//
// GET    /api/proposals/:id — kept unchanged from the client proposal
//                             dashboard (#213), which shares this path.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { AuthContext } from "@/lib/auth/middleware";
import { readAccessToken, verifyAccessToken } from "@/lib/auth/session";
import { db as sql } from "@/lib/proposals/db";
import {
  listProposalsForClient,
  listProposalsForFreelancer,
} from "@/lib/proposals/service";
import {
  UUIDSchema,
  withProposalAuth,
  UpdateProposalSchema,
  canTransition,
  deleteProposal,
  fail,
  failOne,
  findProposalWithProject,
  findUserByWallet,
  isEditable,
  ok,
  updateProposalContent,
  updateProposalStatus,
  zodErrors,
} from "@/lib/proposals";

type RouteContext = { params: Promise<{ id: string }> };

function parseProposalId(raw: string): string | null {
  const result = UUIDSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ─── PATCH ─────────────────────────────────────────────────────────────────

export const PATCH = withProposalAuth<RouteContext>(
  async (req: NextRequest, auth: AuthContext, context: RouteContext): Promise<NextResponse> => {
    const { id: rawId } = await context.params;
    const proposalId = parseProposalId(rawId);
    if (!proposalId) {
      return failOne(400, "INVALID_PROPOSAL_ID", "Proposal ID must be a valid UUID");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return failOne(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    const parsed = UpdateProposalSchema.safeParse(body);
    if (!parsed.success) return fail(422, zodErrors(parsed.error));
    const { status: nextStatus, ...content } = parsed.data;

    try {
      const user = await findUserByWallet(auth.walletAddress);
      if (!user) return failOne(404, "USER_NOT_FOUND", "User not found");

      const found = await findProposalWithProject(proposalId);
      if (!found) return failOne(404, "PROPOSAL_NOT_FOUND", "Proposal not found");
      const { proposal, clientId } = found;

      // ── Client review decision (status change) ──
      if (nextStatus) {
        if (clientId !== user.id) {
          return failOne(403, "FORBIDDEN", "Only the project's client can change a proposal's status");
        }
        if (!canTransition(proposal.status, nextStatus)) {
          return failOne(
            409,
            "INVALID_STATUS_TRANSITION",
            `Cannot move a proposal from '${proposal.status}' to '${nextStatus}'`,
          );
        }
        const updated = await updateProposalStatus(proposal, nextStatus);
        if (!updated) {
          return failOne(409, "PROPOSAL_CHANGED", "The proposal was modified concurrently; reload and retry");
        }
        return ok(updated);
      }

      // ── Freelancer content edit ──
      if (user.role !== "freelancer" || proposal.freelancerId !== user.id) {
        return failOne(403, "FORBIDDEN", "Only the freelancer who created this proposal can edit it");
      }
      if (!isEditable(proposal.status)) {
        return failOne(
          409,
          "PROPOSAL_NOT_EDITABLE",
          `A proposal that is '${proposal.status}' can no longer be updated`,
        );
      }

      // Milestone totals are checked against the merged budget, since either
      // side of the comparison may be omitted from the PATCH body.
      const budget = content.budget ?? proposal.budget;
      const milestones = content.milestones ?? proposal.milestones;
      const milestoneTotal = milestones.reduce((sum, m) => sum + m.amount, 0);
      if (milestoneTotal > budget + 1e-9) {
        return fail(422, [
          {
            code: "VALIDATION_ERROR",
            field: "milestones",
            message: "milestone amounts cannot exceed the proposal budget",
          },
        ]);
      }

      const updated = await updateProposalContent(proposal, content);
      if (!updated) {
        return failOne(409, "PROPOSAL_NOT_EDITABLE", "This proposal can no longer be updated");
      }
      return ok(updated);
    } catch (err) {
      console.error(`[PATCH /api/proposals/${proposalId}]`, err);
      return failOne(500, "PROPOSAL_UPDATE_FAILED", "Failed to update proposal");
    }
  },
);

// ─── DELETE ────────────────────────────────────────────────────────────────

export const DELETE = withProposalAuth<RouteContext>(
  async (_req: NextRequest, auth: AuthContext, context: RouteContext): Promise<NextResponse> => {
    const { id: rawId } = await context.params;
    const proposalId = parseProposalId(rawId);
    if (!proposalId) {
      return failOne(400, "INVALID_PROPOSAL_ID", "Proposal ID must be a valid UUID");
    }

    try {
      const user = await findUserByWallet(auth.walletAddress);
      if (!user) return failOne(404, "USER_NOT_FOUND", "User not found");

      const found = await findProposalWithProject(proposalId);
      if (!found) return failOne(404, "PROPOSAL_NOT_FOUND", "Proposal not found");
      const { proposal } = found;

      // Restricted to the freelancer who created it.
      if (user.role !== "freelancer" || proposal.freelancerId !== user.id) {
        return failOne(403, "FORBIDDEN", "Only the freelancer who created this proposal can delete it");
      }
      // An accepted proposal is part of an agreement and cannot be withdrawn.
      if (proposal.status === "accepted") {
        return failOne(409, "PROPOSAL_ACCEPTED", "An accepted proposal cannot be deleted");
      }

      const deleted = await deleteProposal(proposal);
      if (!deleted) {
        return failOne(409, "PROPOSAL_ACCEPTED", "An accepted proposal cannot be deleted");
      }
      return ok({ id: proposal.id, deleted: true });
    } catch (err) {
      console.error(`[DELETE /api/proposals/${proposalId}]`, err);
      return failOne(500, "PROPOSAL_DELETE_FAILED", "Failed to delete proposal");
    }
  },
);

// ─── GET (client proposal dashboard, #213) ─────────────────────────────────

async function resolveUser(request: NextRequest) {
  const token = readAccessToken(request);
  if (!token) return null;
  const verified = verifyAccessToken(token);
  if (!verified) return null;

  const rows = (await sql`
    SELECT id, role FROM users
    WHERE wallet_address = ${verified.walletAddress}
    LIMIT 1
  `) as { id: string; role: "freelancer" | "client" | "admin" }[];

  return rows[0] ?? null;
}

export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "client" || user.role === "admin") {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    const proposals = await listProposalsForClient(user.id, projectId, {
      status: (request.nextUrl.searchParams.get("status") as any) ?? "all",
      sortBy: (request.nextUrl.searchParams.get("sortBy") as any) ?? "recent",
      sortDir: (request.nextUrl.searchParams.get("sortDir") as any) ?? "desc",
      search: request.nextUrl.searchParams.get("search") ?? undefined,
    });
    return NextResponse.json({ proposals });
  }

  const proposals = await listProposalsForFreelancer(user.id);
  return NextResponse.json({ proposals });
}
