import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import {
  GET as listProposals,
  POST as createProposal,
} from "@/app/api/projects/[id]/proposals/route";
import {
  PATCH as updateProposal,
  DELETE as deleteProposal,
} from "@/app/api/proposals/[id]/route";
import { canTransition, isEditable } from "@/lib/proposals";

vi.mock("@/lib/auth/session", () => ({
  readAccessToken: vi.fn().mockReturnValue("token"),
  verifyAccessToken: vi
    .fn()
    .mockReturnValue({ walletAddress: "GABC", jti: "jti-1" }),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

// Always miss the cache so each test drives its own SQL responses.
vi.mock("@/lib/cache", () => ({
  cacheGet: vi.fn().mockReturnValue(undefined),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
}));

import { sql } from "@/lib/db";
import { readAccessToken } from "@/lib/auth/session";

type SqlMock = ReturnType<typeof vi.fn>;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
const FREELANCER_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ID = "55555555-5555-4555-8555-555555555555";

const freelancer = { id: FREELANCER_ID, role: "freelancer" };
const client = { id: CLIENT_ID, role: "client" };
const openProject = { id: PROJECT_ID, client_id: CLIENT_ID, status: "open" };

const validBody = {
  message: "I have built several Soroban escrow dApps and can deliver this.",
  budget: 1500,
  deliveryTime: 14,
  milestones: [
    { title: "Design", amount: 500 },
    { title: "Build", amount: 1000, dueInDays: 10 },
  ],
};

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    project_id: PROJECT_ID,
    freelancer_id: FREELANCER_ID,
    message: validBody.message,
    budget: "1500.000000",
    delivery_time: 14,
    milestones: validBody.milestones,
    status: "submitted",
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    project_client_id: CLIENT_ID,
    ...overrides,
  };
}

function queueSql(responses: unknown[]) {
  const mock = sql as unknown as SqlMock;
  for (const response of responses) mock.mockResolvedValueOnce(response);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const projectUrl = `http://localhost/api/projects/${PROJECT_ID}/proposals`;
const proposalUrl = `http://localhost/api/proposals/${PROPOSAL_ID}`;

beforeEach(() => {
  vi.clearAllMocks();
  (sql as unknown as SqlMock).mockReset();
  (readAccessToken as unknown as SqlMock).mockReturnValue("token");
});

describe("status lifecycle", () => {
  it("allows the defined transitions and blocks the rest", () => {
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("under_review", "accepted")).toBe(true);
    expect(canTransition("updated", "rejected")).toBe(true);
    expect(canTransition("accepted", "rejected")).toBe(false);
    expect(canTransition("rejected", "under_review")).toBe(false);
    expect(canTransition("under_review", "submitted")).toBe(false);
  });

  it("only treats undecided proposals as editable", () => {
    expect(isEditable("submitted")).toBe(true);
    expect(isEditable("under_review")).toBe(true);
    expect(isEditable("updated")).toBe(true);
    expect(isEditable("accepted")).toBe(false);
    expect(isEditable("rejected")).toBe(false);
  });
});

describe("POST /api/projects/[id]/proposals", () => {
  it("returns 401 in the standard envelope without authentication", async () => {
    (readAccessToken as unknown as SqlMock).mockReturnValueOnce(null);
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      data: null,
      errors: [{ code: "AUTH_REQUIRED", message: "Authentication is required" }],
    });
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 422 with field-level messages for invalid input", async () => {
    const res = await createProposal(
      jsonRequest(projectUrl, "POST", { message: "short", budget: -5 }),
      ctx(PROJECT_ID),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    const fields = body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["message", "budget", "deliveryTime"]));
  });

  it("rejects milestones that exceed the budget", async () => {
    const res = await createProposal(
      jsonRequest(projectUrl, "POST", { ...validBody, budget: 100 }),
      ctx(PROJECT_ID),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].field).toBe("milestones");
  });

  it("returns 403 when the caller is not a freelancer", async () => {
    queueSql([[client]]);
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the project does not exist", async () => {
    queueSql([[freelancer], []]);
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).errors[0].code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 409 for a duplicate active proposal", async () => {
    queueSql([[freelancer], [openProject], [{ id: PROPOSAL_ID }]]);
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).errors[0].code).toBe("DUPLICATE_PROPOSAL");
  });

  it("returns 409 when a concurrent insert hits the unique index", async () => {
    queueSql([[freelancer], [openProject], []]);
    (sql as unknown as SqlMock).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(409);
  });

  it("creates the proposal with status submitted", async () => {
    queueSql([[freelancer], [openProject], [], [proposalRow()]]);
    const res = await createProposal(jsonRequest(projectUrl, "POST", validBody), ctx(PROJECT_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.errors).toBeNull();
    expect(body.data).toMatchObject({
      id: PROPOSAL_ID,
      projectId: PROJECT_ID,
      freelancerId: FREELANCER_ID,
      budget: 1500,
      deliveryTime: 14,
      status: "submitted",
    });
  });
});

describe("GET /api/projects/[id]/proposals", () => {
  it("returns an empty list for a project with no proposals", async () => {
    queueSql([[client], [openProject], []]);
    const res = await listProposals(jsonRequest(projectUrl, "GET"), ctx(PROJECT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.proposals).toEqual([]);
    expect(body.data.pagination).toMatchObject({ total: 0, hasMore: false, page: 1, pageSize: 20 });
  });

  it("paginates results for the project client", async () => {
    queueSql([[client], [openProject], [{ ...proposalRow(), total_count: "3" }]]);
    const res = await listProposals(
      jsonRequest(`${projectUrl}?page=1&pageSize=1&status=submitted`, "GET"),
      ctx(PROJECT_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.proposals).toHaveLength(1);
    expect(body.data.pagination).toMatchObject({ total: 3, totalPages: 3, hasMore: true });
  });

  it("rejects an unknown status filter", async () => {
    const res = await listProposals(jsonRequest(`${projectUrl}?status=bogus`, "GET"), ctx(PROJECT_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].field).toBe("status");
  });

  it("returns 403 for a client who does not own the project", async () => {
    queueSql([[{ id: OTHER_ID, role: "client" }], [openProject]]);
    const res = await listProposals(jsonRequest(projectUrl, "GET"), ctx(PROJECT_ID));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/proposals/[id]", () => {
  it("returns 404 for an unknown proposal", async () => {
    queueSql([[freelancer], []]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { budget: 1200 }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(404);
  });

  it("returns 403 when another freelancer edits the proposal", async () => {
    queueSql([[{ id: OTHER_ID, role: "freelancer" }], [proposalRow()]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { budget: 1600 }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(403);
  });

  it("blocks edits once the proposal is accepted", async () => {
    queueSql([[freelancer], [proposalRow({ status: "accepted" })]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { budget: 1600 }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).errors[0].code).toBe("PROPOSAL_NOT_EDITABLE");
  });

  it("checks milestone totals against the stored budget on partial edits", async () => {
    queueSql([[freelancer], [proposalRow()]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { budget: 1000 }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(422);
  });

  it("lets the owner edit and marks the proposal updated", async () => {
    queueSql([[freelancer], [proposalRow()], [proposalRow({ budget: "1600", status: "updated" })]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { budget: 1600 }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ budget: 1600, status: "updated" });
  });

  it("lets the project client accept a proposal", async () => {
    queueSql([[client], [proposalRow({ status: "under_review" })], [proposalRow({ status: "accepted" })]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { status: "accepted" }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("accepted");
  });

  it("blocks invalid status transitions", async () => {
    queueSql([[client], [proposalRow({ status: "rejected" })]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { status: "accepted" }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).errors[0].code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("does not let the freelancer change the status", async () => {
    queueSql([[freelancer], [proposalRow()]]);
    const res = await updateProposal(jsonRequest(proposalUrl, "PATCH", { status: "accepted" }), ctx(PROPOSAL_ID));
    expect(res.status).toBe(403);
  });

  it("rejects mixing status and content in one request", async () => {
    const res = await updateProposal(
      jsonRequest(proposalUrl, "PATCH", { status: "accepted", budget: 10 }),
      ctx(PROPOSAL_ID),
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/proposals/[id]", () => {
  it("returns 400 for a malformed id", async () => {
    const res = await deleteProposal(jsonRequest("http://localhost/api/proposals/abc", "DELETE"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for anyone but the creating freelancer", async () => {
    queueSql([[client], [proposalRow()]]);
    const res = await deleteProposal(jsonRequest(proposalUrl, "DELETE"), ctx(PROPOSAL_ID));
    expect(res.status).toBe(403);
  });

  it("refuses to delete an accepted proposal", async () => {
    queueSql([[freelancer], [proposalRow({ status: "accepted" })]]);
    const res = await deleteProposal(jsonRequest(proposalUrl, "DELETE"), ctx(PROPOSAL_ID));
    expect(res.status).toBe(409);
  });

  it("deletes the owner's proposal", async () => {
    queueSql([[freelancer], [proposalRow()], [{ id: PROPOSAL_ID }]]);
    const res = await deleteProposal(jsonRequest(proposalUrl, "DELETE"), ctx(PROPOSAL_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { id: PROPOSAL_ID, deleted: true },
      errors: null,
    });
  });
});
