// app/api/projects/[id]/proposals/route.ts
//
// Issue #216 — Proposal Management API.
//
// POST /api/projects/:id/proposals  — freelancer submits a proposal
// GET  /api/projects/:id/proposals  — list proposals (?status=&page=&pageSize=)
//
// The dynamic segment is `[id]` (not `[projectId]`) because Next.js requires
// sibling segments to share one name and app/api/projects/[id] already exists.
// It is the project id.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { AuthContext } from "@/lib/auth/middleware";
import {
  CreateProposalSchema,
  ListProposalsQuerySchema,
  UUIDSchema,
  withProposalAuth,
  fail,
  failOne,
  findActiveProposal,
  findProject,
  findUserByWallet,
  insertProposal,
  isUniqueViolation,
  listProposals,
  ok,
  zodErrors,
} from "@/lib/proposals";

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST ──────────────────────────────────────────────────────────────────

export const POST = withProposalAuth<RouteContext>(
  async (req: NextRequest, auth: AuthContext, context: RouteContext): Promise<NextResponse> => {
    const { id: rawId } = await context.params;
    const idResult = UUIDSchema.safeParse(rawId);
    if (!idResult.success) {
      return failOne(400, "INVALID_PROJECT_ID", "Project ID must be a valid UUID");
    }
    const projectId = idResult.data;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return failOne(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    // Validation errors: clear, field-level messages (422).
    const parsed = CreateProposalSchema.safeParse(body);
    if (!parsed.success) return fail(422, zodErrors(parsed.error));

    try {
      // Authorization: only authenticated freelancers may submit.
      const user = await findUserByWallet(auth.walletAddress);
      if (!user) return failOne(404, "USER_NOT_FOUND", "User not found");
      if (user.role !== "freelancer") {
        return failOne(403, "FORBIDDEN", "Only freelancers can submit proposals");
      }

      const project = await findProject(projectId);
      if (!project) return failOne(404, "PROJECT_NOT_FOUND", "Project not found");
      if (project.client_id === user.id) {
        return failOne(403, "FORBIDDEN", "You cannot submit a proposal to your own project");
      }
      if (project.status !== "open") {
        return failOne(409, "PROJECT_NOT_OPEN", "This project is not accepting proposals");
      }

      // Duplicate prevention: one active proposal per freelancer per project.
      const existing = await findActiveProposal(projectId, user.id);
      if (existing) {
        return failOne(
          409,
          "DUPLICATE_PROPOSAL",
          "You already have an active proposal for this project. Update it instead.",
        );
      }

      const proposal = await insertProposal(projectId, user.id, parsed.data);
      return ok(proposal, 201);
    } catch (err) {
      // Race: a concurrent insert tripped uq_project_proposals_active.
      if (isUniqueViolation(err)) {
        return failOne(
          409,
          "DUPLICATE_PROPOSAL",
          "You already have an active proposal for this project. Update it instead.",
        );
      }
      console.error(`[POST /api/projects/${projectId}/proposals]`, err);
      return failOne(500, "PROPOSAL_CREATE_FAILED", "Failed to create proposal");
    }
  },
);

// ─── GET ───────────────────────────────────────────────────────────────────

export const GET = withProposalAuth<RouteContext>(
  async (req: NextRequest, auth: AuthContext, context: RouteContext): Promise<NextResponse> => {
    const { id: rawId } = await context.params;
    const idResult = UUIDSchema.safeParse(rawId);
    if (!idResult.success) {
      return failOne(400, "INVALID_PROJECT_ID", "Project ID must be a valid UUID");
    }
    const projectId = idResult.data;

    const params = req.nextUrl.searchParams;
    const query = ListProposalsQuerySchema.safeParse({
      status: params.get("status") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });
    if (!query.success) return fail(400, zodErrors(query.error));

    try {
      const user = await findUserByWallet(auth.walletAddress);
      if (!user) return failOne(404, "USER_NOT_FOUND", "User not found");

      const project = await findProject(projectId);
      if (!project) return failOne(404, "PROJECT_NOT_FOUND", "Project not found");

      // The project's client (and admins) review every proposal; a
      // freelancer only ever sees their own. Anyone else is forbidden.
      const isOwnerOrAdmin = project.client_id === user.id || user.role === "admin";
      if (!isOwnerOrAdmin && user.role !== "freelancer") {
        return failOne(403, "FORBIDDEN", "You do not have access to these proposals");
      }

      const page = await listProposals({
        projectId,
        status: query.data.status,
        freelancerId: isOwnerOrAdmin ? undefined : user.id,
        page: query.data.page,
        pageSize: query.data.pageSize,
      });
      // Empty state: `proposals: []` with total 0 — still a 200 success.
      return ok(page);
    } catch (err) {
      console.error(`[GET /api/projects/${projectId}/proposals]`, err);
      return failOne(500, "PROPOSALS_FETCH_FAILED", "Failed to fetch proposals");
    }
  },
);
