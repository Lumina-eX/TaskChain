import { NextRequest, NextResponse } from "next/server";
import { readAccessToken, verifyAccessToken } from "@/lib/auth/session";
import { db as sql } from "@/lib/proposals/db";
import {
  listProposalsForClient,
  listProposalsForFreelancer,
} from "@/lib/proposals/service";

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