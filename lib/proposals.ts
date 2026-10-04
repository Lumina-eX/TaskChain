// lib/proposals.ts
//
// Service layer for the Proposal Management API (issue #216).
//
// Route handlers in app/api/projects/[id]/proposals and app/api/proposals/[id]
// stay thin: validation schemas, the status state machine, the response
// envelope and all SQL live here.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/cache";
import { readAccessToken, verifyAccessToken } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/middleware";

// ─── Status lifecycle ───────────────────────────────────────────────────────

export const PROPOSAL_STATUSES = [
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "updated",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * Allowed status transitions. Anything not listed is blocked with 409.
 *
 *   submitted / updated ──► under_review ──► accepted | rejected
 *        │    ▲                  │
 *        │    └── freelancer edit (→ updated) ◄┘
 *        └──────────────────────────────────► accepted | rejected
 *
 * `accepted` and `rejected` are terminal.
 */
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  submitted: ["under_review", "updated", "accepted", "rejected"],
  updated: ["under_review", "updated", "accepted", "rejected"],
  under_review: ["updated", "accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return PROPOSAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A proposal is still "under review" (editable) until it is accepted/rejected. */
export function isEditable(status: ProposalStatus): boolean {
  return status === "submitted" || status === "under_review" || status === "updated";
}

// ─── Response envelope ──────────────────────────────────────────────────────
// Every endpoint returns { success, data, errors } (acceptance criterion).

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data, errors: null }, { status });
}

export function fail(status: number, errors: ApiError[]): NextResponse {
  return NextResponse.json({ success: false, data: null, errors }, { status });
}

export function failOne(status: number, code: string, message: string): NextResponse {
  return fail(status, [{ code, message }]);
}

/**
 * Same token checks as withAuthCtx in lib/auth/middleware, but the 401 uses
 * the { success, data, errors } envelope so every proposal endpoint responds
 * in one consistent shape.
 */
export function withProposalAuth<Ctx>(
  handler: (req: NextRequest, auth: AuthContext, context: Ctx) => Promise<NextResponse>,
) {
  return async (req: NextRequest, context: Ctx): Promise<NextResponse> => {
    const token = readAccessToken(req);
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) {
      return failOne(401, "AUTH_REQUIRED", "Authentication is required");
    }
    return handler(req, { walletAddress: payload.walletAddress, tokenJti: payload.jti }, context);
  };
}

/** Flattens a ZodError into field-level error entries with clear messages. */
export function zodErrors(error: z.ZodError): ApiError[] {
  return error.issues.map((issue) => ({
    code: "VALIDATION_ERROR",
    message: issue.message,
    field: issue.path.length ? issue.path.join(".") : undefined,
  }));
}

// ─── Validation schemas (Zod) ───────────────────────────────────────────────

export const UUIDSchema = z.string().uuid();

const MilestoneSchema = z.object({
  title: z
    .string({ required_error: "milestone title is required" })
    .trim()
    .min(1, "milestone title cannot be empty")
    .max(200, "milestone title must be 200 characters or fewer"),
  description: z
    .string()
    .max(1000, "milestone description must be 1000 characters or fewer")
    .optional(),
  amount: z
    .number({ invalid_type_error: "milestone amount must be a number" })
    .positive("milestone amount must be a positive number"),
  dueInDays: z
    .number()
    .int("milestone dueInDays must be an integer")
    .positive("milestone dueInDays must be a positive integer")
    .optional(),
});

const messageField = z
  .string({ required_error: "message is required", invalid_type_error: "message must be a string" })
  .trim()
  .min(20, "message must be at least 20 characters")
  .max(5000, "message must be 5000 characters or fewer");

const budgetField = z
  .number({ required_error: "budget is required", invalid_type_error: "budget must be a number" })
  .positive("budget must be a positive number")
  .max(1_000_000_000, "budget is too large");

const deliveryTimeField = z
  .number({
    required_error: "deliveryTime is required",
    invalid_type_error: "deliveryTime must be a number of days",
  })
  .int("deliveryTime must be a whole number of days")
  .min(1, "deliveryTime must be at least 1 day")
  .max(3650, "deliveryTime must be 3650 days or fewer");

const milestonesField = z
  .array(MilestoneSchema)
  .max(20, "a proposal can have at most 20 milestones");

/** Milestone amounts must not add up to more than the proposed budget. */
function milestonesWithinBudget(budget?: number, milestones?: { amount: number }[]): boolean {
  if (budget === undefined || !milestones?.length) return true;
  const total = milestones.reduce((sum, m) => sum + m.amount, 0);
  // Small epsilon guards against floating point noise on decimal amounts.
  return total <= budget + 1e-9;
}

export const CreateProposalSchema = z
  .object({
    message: messageField,
    budget: budgetField,
    deliveryTime: deliveryTimeField,
    milestones: milestonesField.optional(),
  })
  .strict()
  .refine((d) => milestonesWithinBudget(d.budget, d.milestones), {
    message: "milestone amounts cannot exceed the proposal budget",
    path: ["milestones"],
  });

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

/**
 * PATCH body. Content fields are for the owning freelancer; `status` is for
 * the project's client (review decisions). Mixing both is rejected so each
 * request has exactly one actor.
 */
export const UpdateProposalSchema = z
  .object({
    message: messageField.optional(),
    budget: budgetField.optional(),
    deliveryTime: deliveryTimeField.optional(),
    milestones: milestonesField.optional(),
    status: z
      .enum(["under_review", "accepted", "rejected"], {
        errorMap: () => ({ message: "status must be one of: under_review, accepted, rejected" }),
      })
      .optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided for an update",
  })
  .refine(
    (d) =>
      d.status === undefined ||
      (d.message === undefined &&
        d.budget === undefined &&
        d.deliveryTime === undefined &&
        d.milestones === undefined),
    { message: "status cannot be changed in the same request as proposal content", path: ["status"] },
  );

export type UpdateProposalInput = z.infer<typeof UpdateProposalSchema>;

export const ListProposalsQuerySchema = z.object({
  status: z
    .enum(PROPOSAL_STATUSES, {
      errorMap: () => ({ message: `status must be one of: ${PROPOSAL_STATUSES.join(", ")}` }),
    })
    .optional(),
  page: z.coerce.number().int("page must be an integer").min(1, "page must be at least 1").default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be an integer")
    .min(1, "pageSize must be at least 1")
    .max(100, "pageSize must be 100 or fewer")
    .default(20),
});

// ─── Domain types & row mapping ─────────────────────────────────────────────

export interface ProposalMilestone {
  title: string;
  description?: string;
  amount: number;
  dueInDays?: number;
}

export interface Proposal {
  id: string;
  projectId: string;
  freelancerId: string;
  message: string;
  budget: number;
  deliveryTime: number;
  milestones: ProposalMilestone[];
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function rowToProposal(row: Record<string, unknown>): Proposal {
  const rawMilestones = row.milestones;
  const milestones =
    typeof rawMilestones === "string"
      ? (JSON.parse(rawMilestones) as ProposalMilestone[])
      : ((rawMilestones as ProposalMilestone[] | null) ?? []);
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    freelancerId: String(row.freelancer_id),
    message: row.message as string,
    budget: Number(row.budget),
    deliveryTime: Number(row.delivery_time),
    milestones,
    status: row.status as ProposalStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  role: string;
}

export interface ProjectRow {
  id: string;
  client_id: string;
  status: string;
}

export async function findUserByWallet(walletAddress: string): Promise<UserRow | null> {
  const rows = (await sql`
    SELECT id, role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  return { id: String(rows[0].id), role: String(rows[0].role) };
}

export async function findProject(projectId: string): Promise<ProjectRow | null> {
  const rows = (await sql`
    SELECT id, client_id, status FROM projects WHERE id = ${projectId} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  return {
    id: String(rows[0].id),
    client_id: String(rows[0].client_id),
    status: String(rows[0].status),
  };
}

export async function findProposalWithProject(
  proposalId: string,
): Promise<{ proposal: Proposal; clientId: string } | null> {
  const rows = (await sql`
    SELECT pp.*, p.client_id AS project_client_id
    FROM project_proposals pp
    JOIN projects p ON p.id = pp.project_id
    WHERE pp.id = ${proposalId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  return { proposal: rowToProposal(rows[0]), clientId: String(rows[0].project_client_id) };
}

/** Returns the freelancer's active (non-rejected) proposal on the project, if any. */
export async function findActiveProposal(
  projectId: string,
  freelancerId: string,
): Promise<{ id: string } | null> {
  const rows = (await sql`
    SELECT id FROM project_proposals
    WHERE project_id = ${projectId}
      AND freelancer_id = ${freelancerId}
      AND status <> 'rejected'
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows.length ? { id: String(rows[0].id) } : null;
}

// ─── Caching ────────────────────────────────────────────────────────────────
// List results are cached briefly per project. Each write bumps the
// project's version so stale pages are never served after a change within
// the same instance.

const LIST_CACHE_TTL_MS = 30_000;
const projectCacheVersion = new Map<string, number>();

function listCacheKey(projectId: string, parts: Array<string | number | undefined>): string {
  const version = projectCacheVersion.get(projectId) ?? 0;
  return `proposals:${projectId}:v${version}:${parts.map((p) => p ?? "*").join(":")}`;
}

export function invalidateProjectProposals(projectId: string): void {
  projectCacheVersion.set(projectId, (projectCacheVersion.get(projectId) ?? 0) + 1);
}

// ─── Mutations & queries ────────────────────────────────────────────────────

/** Postgres unique_violation — raised by uq_project_proposals_active. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function insertProposal(
  projectId: string,
  freelancerId: string,
  input: CreateProposalInput,
): Promise<Proposal> {
  const rows = (await sql`
    INSERT INTO project_proposals (
      project_id, freelancer_id, message, budget, delivery_time, milestones, status
    ) VALUES (
      ${projectId},
      ${freelancerId},
      ${input.message},
      ${input.budget},
      ${input.deliveryTime},
      ${JSON.stringify(input.milestones ?? [])}::jsonb,
      'submitted'
    )
    RETURNING *
  `) as Array<Record<string, unknown>>;
  invalidateProjectProposals(projectId);
  return rowToProposal(rows[0]);
}

export interface ListProposalsOptions {
  projectId: string;
  status?: ProposalStatus;
  /** When set, only this freelancer's proposals are returned. */
  freelancerId?: string;
  page: number;
  pageSize: number;
}

export interface ProposalPage {
  proposals: Proposal[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function listProposals(opts: ListProposalsOptions): Promise<ProposalPage> {
  const { projectId, status, freelancerId, page, pageSize } = opts;
  const key = listCacheKey(projectId, [status, freelancerId, page, pageSize]);
  const cached = cacheGet<ProposalPage>(key);
  if (cached) return cached;

  const offset = (page - 1) * pageSize;
  const statusFilter = status ?? null;
  const freelancerFilter = freelancerId ?? null;

  const rows = (await sql`
    SELECT pp.*, COUNT(*) OVER() AS total_count
    FROM project_proposals pp
    WHERE pp.project_id = ${projectId}
      AND (${statusFilter}::proposal_status IS NULL OR pp.status = ${statusFilter}::proposal_status)
      AND (${freelancerFilter}::uuid IS NULL OR pp.freelancer_id = ${freelancerFilter}::uuid)
    ORDER BY pp.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `) as Array<Record<string, unknown>>;

  // Empty state: a project with no proposals returns an empty list, not an error.
  const total = rows.length ? Number(rows[0].total_count) || 0 : 0;
  const result: ProposalPage = {
    proposals: rows.map(rowToProposal),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  };
  cacheSet(key, result, LIST_CACHE_TTL_MS);
  return result;
}

/**
 * Applies a freelancer content edit. The status moves to `updated`, and the
 * WHERE clause re-checks editability so a concurrent accept/reject wins.
 */
export async function updateProposalContent(
  current: Proposal,
  input: Omit<UpdateProposalInput, "status">,
): Promise<Proposal | null> {
  const message = input.message ?? current.message;
  const budget = input.budget ?? current.budget;
  const deliveryTime = input.deliveryTime ?? current.deliveryTime;
  const milestones = input.milestones ?? current.milestones;

  const rows = (await sql`
    UPDATE project_proposals
    SET message       = ${message},
        budget        = ${budget},
        delivery_time = ${deliveryTime},
        milestones    = ${JSON.stringify(milestones)}::jsonb,
        status        = 'updated',
        updated_at    = NOW()
    WHERE id = ${current.id}
      AND status IN ('submitted', 'under_review', 'updated')
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  invalidateProjectProposals(current.projectId);
  return rowToProposal(rows[0]);
}

/** Moves a proposal to `next`, guarded on the status it was read with. */
export async function updateProposalStatus(
  current: Proposal,
  next: ProposalStatus,
): Promise<Proposal | null> {
  const rows = (await sql`
    UPDATE project_proposals
    SET status = ${next}::proposal_status,
        updated_at = NOW()
    WHERE id = ${current.id}
      AND status = ${current.status}::proposal_status
    RETURNING *
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  invalidateProjectProposals(current.projectId);
  return rowToProposal(rows[0]);
}

export async function deleteProposal(proposal: Proposal): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM project_proposals
    WHERE id = ${proposal.id}
      AND status <> 'accepted'
    RETURNING id
  `) as Array<Record<string, unknown>>;
  if (rows.length) invalidateProjectProposals(proposal.projectId);
  return rows.length > 0;
}
