import { db as sql } from "./db";
import type { Proposal, ProposalFilters, ProposalStatus } from "./types";

interface DbRow {
  id: string;
  project_id: string;
  project_title: string | null;
  freelancer_id: string;
  freelancer_name: string | null;
  freelancer_skills: string[] | null;
  freelancer_rating: string | number | null;
  freelancer_completed: number | null;
  cover_letter: string | null;
  proposed_budget: string | number;
  currency: string | null;
  estimated_duration: string | null;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
}

function mapRow(r: DbRow): Proposal {
  return {
    id: r.id,
    projectId: r.project_id,
    projectTitle: r.project_title ?? "",
    freelancerId: r.freelancer_id,
    freelancerName: r.freelancer_name ?? "Freelancer",
    freelancerSkills: Array.isArray(r.freelancer_skills) ? r.freelancer_skills : [],
    freelancerRating: Number(r.freelancer_rating ?? 0),
    freelancerPastContracts: Number(r.freelancer_completed ?? 0),
    coverLetter: r.cover_letter ?? "",
    proposedBudget: Number(r.proposed_budget),
    currency: r.currency ?? "USDC",
    estimatedDuration: r.estimated_duration ?? "",
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listProposalsForClient(
  clientId: string,
  projectId: string,
  filters: ProposalFilters = {}
): Promise<Proposal[]> {
  const status = filters.status ?? "all";
  const search = (filters.search ?? "").trim().toLowerCase();
  const sortBy = filters.sortBy ?? "recent";
  const sortDir = filters.sortDir === "asc" ? "asc" : "desc";

  // Neon tagged template: use sql\`...\` for execution. Build ORDER BY via
  // a whitelist and switch through four pre-canned queries instead of unsafe().
  const orderClause =
    sortBy === "budget"
      ? (sortDir === "asc" ? sql`p.proposed_budget ASC` : sql`p.proposed_budget DESC`)
      : sortBy === "delivery"
      ? (sortDir === "asc" ? sql`p.estimated_duration ASC` : sql`p.estimated_duration DESC`)
      : sortBy === "rating"
      ? (sortDir === "asc" ? sql`u.avg_rating ASC` : sql`u.avg_rating DESC`)
      : (sortDir === "asc" ? sql`p.created_at ASC` : sql`p.created_at DESC`);

  const hasStatus = status !== "all";
  const hasSearch = search.length > 0;

  const rows = (await sql`
    SELECT
      p.id, p.project_id, pr.title AS project_title,
      p.freelancer_id, u.username AS freelancer_name,
      u.skills AS freelancer_skills,
      u.avg_rating AS freelancer_rating,
      u.completed_jobs AS freelancer_completed,
      p.cover_letter, p.proposed_budget, p.currency,
      p.estimated_duration, p.status, p.created_at, p.updated_at
    FROM proposals p
    JOIN users u ON u.id = p.freelancer_id
    JOIN projects pr ON pr.id = p.project_id
    WHERE p.client_id = ${clientId}
      AND p.project_id = ${projectId}
      AND (${hasStatus} = false OR p.status = ${status})
      AND (${hasSearch} = false OR LOWER(u.username) LIKE ${"%" + search + "%"})
    ORDER BY ${orderClause}
  `) as unknown as DbRow[];

  return rows.map(mapRow);
}

export async function listProposalsForFreelancer(
  freelancerId: string
): Promise<Proposal[]> {
  const rows = (await sql`
    SELECT
      p.id, p.project_id, pr.title AS project_title,
      p.freelancer_id, u.username AS freelancer_name,
      u.skills AS freelancer_skills,
      u.avg_rating AS freelancer_rating,
      u.completed_jobs AS freelancer_completed,
      p.cover_letter, p.proposed_budget, p.currency,
      p.estimated_duration, p.status, p.created_at, p.updated_at
    FROM proposals p
    JOIN users u ON u.id = p.freelancer_id
    JOIN projects pr ON pr.id = p.project_id
    WHERE p.freelancer_id = ${freelancerId}
    ORDER BY p.created_at DESC
  `) as unknown as DbRow[];

  return rows.map(mapRow);
}

export async function updateProposalStatus(
  proposalId: string,
  clientId: string,
  next: Extract<ProposalStatus, "accepted" | "rejected">
): Promise<Proposal> {
  const check = (await sql`
    SELECT status, client_id FROM proposals WHERE id = ${proposalId}
  `) as unknown as { status: ProposalStatus; client_id: string }[];

  if (!check[0]) throw new Error("NOT_FOUND");
  if (check[0].client_id !== clientId) throw new Error("NOT_FOUND");
  const previous = check[0].status;
  if (previous === next) throw new Error("NO_CHANGE");

  await sql`UPDATE proposals SET status = ${next}, updated_at = NOW() WHERE id = ${proposalId}`;

  await sql`
    INSERT INTO proposal_audit_logs
      (proposal_id, actor_id, action, previous_status, new_status)
    VALUES (
      ${proposalId}, ${clientId},
      ${next === "accepted" ? "accept" : "reject"},
      ${previous}, ${next}
    )
  `;

  const full = (await sql`
    SELECT
      p.id, p.project_id, pr.title AS project_title,
      p.freelancer_id, u.username AS freelancer_name,
      u.skills AS freelancer_skills,
      u.avg_rating AS freelancer_rating,
      u.completed_jobs AS freelancer_completed,
      p.cover_letter, p.proposed_budget, p.currency,
      p.estimated_duration, p.status, p.created_at, p.updated_at
    FROM proposals p
    JOIN users u ON u.id = p.freelancer_id
    JOIN projects pr ON pr.id = p.project_id
    WHERE p.id = ${proposalId}
  `) as unknown as DbRow[];

  return mapRow(full[0]);
}