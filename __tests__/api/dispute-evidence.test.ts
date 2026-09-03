import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/disputes/[id]/evidence/route";
import { GET as downloadEvidence } from "@/app/api/disputes/[id]/evidence/[evidenceId]/route";

vi.mock("@/lib/auth/session", () => ({
  readAccessToken: vi.fn().mockReturnValue("token"),
  verifyAccessToken: vi
    .fn()
    .mockReturnValue({ walletAddress: "GABC", jti: "jti-1" }),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

vi.mock("@/lib/security/fileEncryption", () => ({
  computeFileHash: vi.fn().mockReturnValue("dummy-hash"),
  storeEncryptedFile: vi
    .fn()
    .mockResolvedValue({ iv: "dummy-iv", filePath: "/tmp/evidence-file" }),
  readEncryptedFile: vi.fn().mockResolvedValue(Buffer.from("file-content")),
  removeEncryptedFile: vi.fn().mockResolvedValue(undefined),
}));

import { sql } from "@/lib/db";

type SqlMock = ReturnType<typeof vi.fn>;

function queueSql(responses: unknown[]) {
  const mock = sql as unknown as SqlMock;
  for (const response of responses) {
    mock.mockResolvedValueOnce(response);
  }
}

function makeContext(disputeId = "42", evidenceId = "9") {
  return { params: Promise.resolve({ id: disputeId, evidenceId }) };
}

function makeGetRequest(url: string) {
  return new NextRequest(new Request(url));
}

function makePostRequest(url: string, files: File[], description = "") {
  const formData = new FormData();
  for (const file of files) {
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode("content").buffer),
    });
    formData.append("files", file);
  }
  if (description) formData.append("description", description);
  return {
    nextUrl: new URL(url),
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  (sql as unknown as SqlMock).mockReset();
});

describe("GET /api/disputes/[id]/evidence", () => {
  it("returns 403 when the user is not a dispute participant or admin", async () => {
    queueSql([
      [{ id: 3, role: "client" }],
      [{ id: 42, client_id: 1, freelancer_id: 2 }],
    ]);

    const response = await GET(
      makeGetRequest("http://localhost/api/disputes/42/evidence"),
      makeContext(),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("returns evidence in chronological order for an authorized party", async () => {
    queueSql([
      [{ id: 1, role: "client" }],
      [{ id: 42, client_id: 1, freelancer_id: 2 }],
      [{ total: 1 }],
      [{ id: 9, file_name: "proof.pdf", created_at: "2026-01-01T00:00:00Z" }],
      [],
    ]);

    const response = await GET(
      makeGetRequest("http://localhost/api/disputes/42/evidence"),
      makeContext(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.evidence).toHaveLength(1);
    expect(body.evidence[0].file_name).toBe("proof.pdf");
  });

  it("includes pagination metadata when a limit is supplied", async () => {
    queueSql([
      [{ id: 1, role: "client" }],
      [{ id: 42, client_id: 1, freelancer_id: 2 }],
      [{ total: 14 }],
      [{ id: 9, file_name: "proof.pdf", created_at: "2026-01-01T00:00:00Z" }],
      [],
    ]);

    const response = await GET(
      makeGetRequest(
        "http://localhost/api/disputes/42/evidence?limit=10&offset=0",
      ),
      makeContext(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination).toMatchObject({
      limit: 10,
      offset: 0,
      total: 14,
      hasMore: true,
    });
    expect(body.evidence).toHaveLength(1);
  });
});

describe("POST /api/disputes/[id]/evidence", () => {
  it("rejects unsupported file types before storage", async () => {
    const request = makePostRequest(
      "http://localhost/api/disputes/42/evidence",
      [new File(["<script>"], "bad.html", { type: "text/html" })],
    );

    const response = await POST(request, makeContext());

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERRORS");
  });

  it("stores encrypted evidence metadata for authorized users", async () => {
    queueSql([
      [{ id: 1, role: "freelancer" }],
      [{ id: 42, client_id: 2, freelancer_id: 1 }],
      [
        {
          id: 9,
          file_name: "proof.pdf",
          file_hash: "dummy-hash",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      [],
    ]);

    const request = makePostRequest(
      "http://localhost/api/disputes/42/evidence",
      [new File(["content"], "proof.pdf", { type: "application/pdf" })],
      "Signed scope document",
    );

    const response = await POST(request, makeContext());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.evidence[0].file_name).toBe("proof.pdf");
    expect(body.evidence[0].file_hash).toBe("dummy-hash");
  });
});

describe("GET /api/disputes/[id]/evidence/[evidenceId]", () => {
  it("downloads encrypted evidence for an authorized participant", async () => {
    queueSql([
      [{ id: 1, role: "client" }],
      [{ id: 42, client_id: 1, freelancer_id: 2 }],
      [
        {
          id: 9,
          file_name: "proof.pdf",
          file_type: "application/pdf",
          mime_type: "application/pdf",
          encryption_iv: "dummy-iv",
          file_path: "/tmp/evidence-file",
        },
      ],
    ]);

    const response = await downloadEvidence(
      makeGetRequest("http://localhost/api/disputes/42/evidence/9?preview=0"),
      makeContext("42", "9"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="proof.pdf"',
    );
  });
});

describe("DELETE /api/disputes/[id]/evidence/[evidenceId]", () => {
  it("allows authorized participants to remove evidence records", async () => {
    queueSql([
      [{ id: 1, role: "client" }],
      [{ id: 42, client_id: 1, freelancer_id: 2 }],
      [
        {
          id: 9,
          file_path: "/tmp/evidence-file",
          dispute_id: 42,
          uploaded_by: 1,
          file_name: "proof.pdf",
        },
      ],
      [{ id: 9 }],
      [],
    ]);

    const { DELETE } =
      await import("@/app/api/disputes/[id]/evidence/[evidenceId]/route");
    const response = await DELETE(
      makeGetRequest("http://localhost/api/disputes/42/evidence/9"),
      makeContext("42", "9"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
