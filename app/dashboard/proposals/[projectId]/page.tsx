import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db as sql } from "@/lib/proposals/db";
import { verifyAccessToken } from "@/lib/auth/session";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/constants";
import { ProposalList } from "@/components/proposals";

export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const jar = await cookies();
  const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) redirect("/login");

  const verified = verifyAccessToken(token);
  if (!verified) redirect("/login");

  const users = (await sql`
    SELECT id, role FROM users
    WHERE wallet_address = ${verified.walletAddress}
    LIMIT 1
  `) as { id: string; role: string }[];

  const user = users[0];
  if (!user) notFound();

  const isClient = user.role === "client" || user.role === "admin";
  const isFreelancer = user.role === "freelancer";
  if (!isClient && !isFreelancer) notFound();

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Proposals</h1>
        <p className="text-sm text-muted-foreground">
          {isClient
            ? "Review, filter, and manage freelancer proposals."
            : "Your submitted proposals and their status."}
        </p>
      </header>
      <ProposalList projectId={projectId} readOnly={!isClient} />
    </div>
  );
}