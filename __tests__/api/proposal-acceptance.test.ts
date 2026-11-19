import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  readAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  cacheGet: vi.fn().mockReturnValue(undefined),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
}));

import { sql } from "@/lib/db";
import { acceptProposal, updateProposalStatus } from "@/lib/proposals";

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;
const current = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: "11111111-1111-4111-8111-111111111111",
  status: "submitted",
} as never;

function statement(): string {
  return (sqlMock.mock.calls[0][0] as string[]).join(" ");
}

describe("proposal acceptance (#217)", () => {
  beforeEach(() => sqlMock.mockReset());

  it("creates contract, milestones and audit rows in ONE statement", async () => {
    sqlMock.mockResolvedValue([]);
    await acceptProposal(current);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const text = statement();
    expect(text).toContain("UPDATE project_proposals");
    expect(text).toContain("INSERT INTO contracts");
    expect(text).toContain("INSERT INTO milestones");
    expect(text).toContain("proposal_acceptance_audit_logs");
    expect(text).toContain("'unfunded'::escrow_status");
    expect(text).toContain("'pending_funding'::contract_status");
  });

  it("returns null when the proposal or project is no longer eligible", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await acceptProposal(current)).toBeNull();
  });

  it("surfaces the unique-violation when a second proposal is accepted", async () => {
    sqlMock.mockRejectedValue({ code: "23505" });
    await expect(acceptProposal(current)).rejects.toMatchObject({ code: "23505" });
  });

  it("status change to accepted goes through the atomic path", async () => {
    sqlMock.mockResolvedValue([]);
    await updateProposalStatus(current, "accepted");
    expect(statement()).toContain("INSERT INTO contracts");
  });

  it("rejecting does not create a contract", async () => {
    sqlMock.mockResolvedValue([]);
    await updateProposalStatus(current, "rejected");
    expect(statement()).not.toContain("INSERT INTO contracts");
  });
});
