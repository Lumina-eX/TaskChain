export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withAuthCtx } from "@/lib/auth/middleware";
import {
  ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES,
  MAX_DISPUTE_EVIDENCE_FILE_SIZE,
  MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH,
} from "@/lib/validations";
import {
  computeFileHash,
  readEncryptedFile,
  removeEncryptedFile,
  storeEncryptedFile,
} from "@/lib/security/fileEncryption";

type RouteContext = { params: Promise<{ id: string }> };
type AuthLike = { walletAddress: string };
type UserRow = { id: string | number; role: string };
type DisputeAccessRow = {
  id: string | number;
  client_id: string | number;
  freelancer_id: string | number | null;
};
type EvidenceRow = {
  id: string | number;
  file_url: string;
  file_name: string;
  file_type?: string | null;
  mime_type?: string | null;
  encryption_iv?: string | null;
  file_path?: string | null;
};
type DisputeAccess = {
  user: UserRow;
  dispute: DisputeAccessRow;
};

async function getDisputeAccess(
  disputeId: string,
  walletAddress: string,
): Promise<DisputeAccess | NextResponse> {
  const users = (await sql`
    SELECT id, role FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `) as UserRow[];
  const user = users[0];
  if (!user)
    return NextResponse.json(
      { error: "User not found", code: "USER_NOT_FOUND" },
      { status: 404 },
    );

  const disputes = (await sql`
    SELECT d.id, j.client_id, j.freelancer_id
    FROM disputes d
    JOIN jobs j ON d.job_id = j.id
    WHERE d.id = ${disputeId}
    LIMIT 1
  `) as DisputeAccessRow[];
  const dispute = disputes[0];
  if (!dispute)
    return NextResponse.json(
      { error: "Dispute not found", code: "DISPUTE_NOT_FOUND" },
      { status: 404 },
    );

  const userId = String(user.id);
  const isParticipant =
    String(dispute.client_id) === userId ||
    String(dispute.freelancer_id) === userId;
  if (user.role !== "admin" && !isParticipant) {
    return NextResponse.json(
      { error: "Access denied", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  return { user, dispute };
}

function isAccessResponse(
  value: DisputeAccess | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

function validateEvidenceFiles(files: File[]) {
  const errors: { filename: string; reason: string }[] = [];

  for (const file of files) {
    if (!file.size || file.size <= 0) {
      errors.push({ filename: file.name, reason: "File is empty" });
      continue;
    }
    if (file.size > MAX_DISPUTE_EVIDENCE_FILE_SIZE) {
      errors.push({
        filename: file.name,
        reason: `File exceeds ${MAX_DISPUTE_EVIDENCE_FILE_SIZE / (1024 * 1024)} MB limit`,
      });
      continue;
    }
    if (
      !ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_DISPUTE_EVIDENCE_MIME_TYPES)[number],
      )
    ) {
      errors.push({
        filename: file.name,
        reason: `File type "${file.type || "unknown"}" is not allowed`,
      });
    }
  }

  return errors;
}

function parseEvidencePagination(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get("limit") ?? "20");
  const rawOffset = Number(searchParams.get("offset") ?? "0");
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  return { limit, offset };
}

async function logEvidenceAction(
  action: "evidence_upload" | "evidence_view" | "evidence_delete",
  userId: string | number,
  disputeId: string,
  details: Record<string, unknown> = {},
  evidenceId?: string | number,
) {
  try {
    await sql`
      INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, details)
      VALUES (
        ${userId},
        ${action},
        ${"dispute_evidence"},
        ${evidenceId ? String(evidenceId) : disputeId},
        ${JSON.stringify({ dispute_id: disputeId, ...details })}
      )
    `;
  } catch {
    // best-effort audit logging; the evidence operation should still succeed if logging is unavailable
  }
}

export const GET = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    const { id } = await context.params;
    try {
      const access = await getDisputeAccess(id, auth.walletAddress);
      if (isAccessResponse(access)) return access;

      const { limit, offset } = parseEvidencePagination(
        request.nextUrl.searchParams,
      );

      const totalRows = ((await sql`
      SELECT COUNT(*)::int AS total
      FROM dispute_evidence
      WHERE dispute_id = ${id} AND COALESCE(is_removed, FALSE) = FALSE
    `) ?? []) as Array<{ total: number }>;
      const total = totalRows[0]?.total ?? 0;

      const evidenceRows =
        (await sql`
      SELECT de.id, de.dispute_id, de.file_url, de.file_name, de.file_type,
             de.uploaded_by, de.description, de.created_at,
             de.mime_type, de.file_size, de.file_hash, u.username as uploaded_by_username
      FROM dispute_evidence de
      JOIN users u ON u.id = de.uploaded_by
      WHERE de.dispute_id = ${id} AND COALESCE(de.is_removed, FALSE) = FALSE
      ORDER BY de.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `) ?? [];

      const evidence = Array.isArray(evidenceRows) ? evidenceRows : [];

      await logEvidenceAction(
        "evidence_view",
        access.user.id,
        id,
        { limit, offset, total, requested_by: access.user.role },
        undefined,
      );

      return NextResponse.json(
        {
          evidence,
          pagination: {
            limit,
            offset,
            total,
            nextOffset:
              offset + evidence.length < total
                ? offset + evidence.length
                : null,
            hasMore: offset + evidence.length < total,
          },
        },
        { status: 200 },
      );
    } catch {
      return NextResponse.json(
        { error: "Failed to load evidence", code: "EVIDENCE_LIST_FAILED" },
        { status: 500 },
      );
    }
  },
);

export const POST = withAuthCtx(
  async (request: NextRequest, auth, context: RouteContext) => {
    const { id } = await context.params;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error: "Request body must be multipart/form-data",
          code: "INVALID_FORM_DATA",
        },
        { status: 400 },
      );
    }

    const files = Array.from(formData.entries())
      .filter((entry): entry is [string, File] => entry[1] instanceof File)
      .map(([, file]) => file);

    const description = String(formData.get("description") ?? "").trim();

    if (files.length === 0 && description.length === 0) {
      return NextResponse.json(
        {
          error: "Attach at least one evidence file or add a description",
          code: "NO_EVIDENCE",
        },
        { status: 400 },
      );
    }

    if (files.length > MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH) {
      return NextResponse.json(
        {
          error: `Cannot upload more than ${MAX_DISPUTE_EVIDENCE_FILES_PER_BATCH} files at once`,
          code: "TOO_MANY_FILES",
        },
        { status: 422 },
      );
    }

    const validationErrors = validateEvidenceFiles(files);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "Some files failed validation",
          code: "VALIDATION_ERRORS",
          details: validationErrors,
        },
        { status: 422 },
      );
    }

    try {
      const access = await getDisputeAccess(id, auth.walletAddress);
      if (isAccessResponse(access)) return access;

      const inserted = [];

      if (files.length === 0) {
        const rows = (await sql`
        INSERT INTO dispute_evidence (dispute_id, file_url, file_name, file_type, uploaded_by, description)
        VALUES (${id}, ${"note-only"}, ${"Evidence note"}, ${"note"}, ${access.user.id}, ${description})
        RETURNING id, dispute_id, file_url, file_name, file_type, uploaded_by, description,
                  created_at, mime_type, file_size, file_hash
      `) as EvidenceRow[];
        const evidence = rows[0];
        inserted.push(evidence);
      }

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileHash = computeFileHash(buffer);
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const storedFilename = `${randomUUID()}.${ext}`;
        const { iv, filePath } = await storeEncryptedFile(
          buffer,
          storedFilename,
        );

        const rows = (await sql`
        INSERT INTO dispute_evidence
          (dispute_id, file_url, file_name, file_type, uploaded_by, description,
           stored_filename, mime_type, file_size, file_hash, encryption_iv, file_path)
        VALUES
          (${id}, ${`dispute-evidence://${storedFilename}`}, ${file.name}, ${file.type || "application/octet-stream"},
           ${access.user.id}, ${description || null}, ${storedFilename}, ${file.type || "application/octet-stream"},
           ${file.size}, ${fileHash}, ${iv}, ${filePath})
        RETURNING id, dispute_id, file_url, file_name, file_type, uploaded_by, description,
                  created_at, mime_type, file_size, file_hash
      `) as EvidenceRow[];
        const evidence = rows[0];
        inserted.push(evidence);
      }

      await sql`UPDATE disputes SET status = 'under_review', updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND status = 'open'`;

      for (const evidence of inserted) {
        await logEvidenceAction(
          "evidence_upload",
          access.user.id,
          id,
          {
            evidence_id: String(evidence.id),
            file_name: evidence.file_name,
            description: evidence.description ?? null,
            file_hash: evidence.file_hash ?? null,
          },
          evidence.id,
        );
      }

      return NextResponse.json({ evidence: inserted }, { status: 201 });
    } catch {
      return NextResponse.json(
        { error: "Failed to submit evidence", code: "EVIDENCE_UPLOAD_FAILED" },
        { status: 500 },
      );
    }
  },
);

export async function downloadEvidence(
  request: NextRequest,
  auth: AuthLike,
  disputeId: string,
  evidenceId: string,
) {
  try {
    const access = await getDisputeAccess(disputeId, auth.walletAddress);
    if (isAccessResponse(access)) return access;

    const rows = (await sql`
      SELECT id, file_url, file_name, file_type, mime_type, encryption_iv, file_path
      FROM dispute_evidence
      WHERE id = ${evidenceId} AND dispute_id = ${disputeId} AND COALESCE(is_removed, FALSE) = FALSE
      LIMIT 1
    `) as EvidenceRow[];
    const evidence = rows[0];
    if (!evidence)
      return NextResponse.json(
        { error: "Evidence not found", code: "EVIDENCE_NOT_FOUND" },
        { status: 404 },
      );

    await logEvidenceAction(
      "evidence_view",
      access.user.id,
      disputeId,
      { evidence_id: evidenceId, file_name: evidence.file_name },
      evidence.id,
    );

    if (!evidence.file_path || !evidence.encryption_iv) {
      return NextResponse.redirect(new URL(evidence.file_url, request.url));
    }

    const plaintext = await readEncryptedFile(
      evidence.file_path,
      evidence.encryption_iv,
    );

    const preview = request.nextUrl.searchParams.get("preview") === "1";
    const disposition = preview ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(plaintext), {
      status: 200,
      headers: {
        "Content-Type":
          evidence.mime_type ||
          evidence.file_type ||
          "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${evidence.file_name}"`,
        "Content-Length": String(plaintext.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to download evidence",
        code: "EVIDENCE_DOWNLOAD_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function deleteEvidence(
  request: NextRequest,
  auth: AuthLike,
  disputeId: string,
  evidenceId: string,
) {
  try {
    const access = await getDisputeAccess(disputeId, auth.walletAddress);
    if (isAccessResponse(access)) return access;

    const rows = (await sql`
      SELECT id, dispute_id, file_path, uploaded_by, file_name
      FROM dispute_evidence
      WHERE id = ${evidenceId} AND dispute_id = ${disputeId} AND COALESCE(is_removed, FALSE) = FALSE
      LIMIT 1
    `) as Array<{
      id: string | number;
      dispute_id: string | number;
      file_path?: string | null;
      uploaded_by: string | number;
      file_name: string;
    }>;
    const evidence = rows[0];
    if (!evidence) {
      return NextResponse.json(
        { error: "Evidence not found", code: "EVIDENCE_NOT_FOUND" },
        { status: 404 },
      );
    }

    const userId = String(access.user.id);
    const isUploader = String(evidence.uploaded_by) === userId;
    const isParticipant =
      String(access.dispute.client_id) === userId ||
      String(access.dispute.freelancer_id) === userId;
    if (access.user.role !== "admin" && !isUploader && !isParticipant) {
      return NextResponse.json(
        { error: "Access denied", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    await sql`
      UPDATE dispute_evidence
      SET is_removed = TRUE
      WHERE id = ${evidenceId} AND dispute_id = ${disputeId}
    `;

    if (evidence.file_path && typeof removeEncryptedFile === "function") {
      await removeEncryptedFile(evidence.file_path);
    }

    await logEvidenceAction(
      "evidence_delete",
      access.user.id,
      disputeId,
      { evidence_id: evidenceId, file_name: evidence.file_name },
      evidence.id,
    );

    return NextResponse.json(
      { success: true, evidenceId: evidence.id },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to remove evidence", code: "EVIDENCE_DELETE_FAILED" },
      { status: 500 },
    );
  }
}
