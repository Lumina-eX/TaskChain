// lib/db.ts
//
// Lazy-initialised Neon serverless client.
// The client is created once and reused across requests in the same
// function instance. This matches the pattern already used in the repo
// (see git message: "fix: lazy-init db client").
//
// Usage:
//   import { sql } from "@/lib/db";
//   const rows = await sql` SELECT * FROM projects WHERE id = ${id}`;

import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
          "Copy env.example to .env and fill in your Neon connection string.",
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

// Re-exported as `sql` so call-sites read naturally:
//   const rows = await sql` SELECT … `
export const sql = new Proxy({} as ReturnType<typeof neon>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
  apply(_target, _thisArg, args: unknown[]) {
    return (getDb() as unknown as (a: unknown[]) => unknown)(...args);
  },
}) as ReturnType<typeof neon>;

// -------------- Project Recommendation Service ----------------
// The following code implements a basic recommendation engine.
// It is intentionally placed here because this module already exports
// the shared database client, and the service layer can call `sql`.
//
// Required indexes (add via migration):
//   CREATE INDEX idx_projects_status_created ON projects(status, created_at DESC);
//   CREATE INDEX idx_projects_category ON projects(category_id);
//   CREATE INDEX idx_projects_budget ON projects(budget_min, budget_max);
//   CREATE INDEX idx_project_skills_project ON project_skills(project_id);
//   CREATE INDEX idx_project_skills_skill ON project_skills(skill_id);
//   CREATE INDEX idx_freelancer_skills_freelancer ON freelancer_skills(freelancer_id);
//   CREATE INDEX idx_freelancer_skills_skill ON freelancer_skills(skill_id);
//   CREATE INDEX idx_project_history_freelancer_status ON project_history(freelancer_id, status);

export type RecommendationResult = {
  projects: Array<Record<string, unknown>>;
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
};

// Simple in-memory cache with TTL (works within a single serverless instance).
const cache = new Map<string, { data: RecommendationResult; expiresAt: number }>();
const CACHE_UTL_MS = 60_000; // 1 minute
const MAX_CACHE_ENTRIES = 100;

function setCache(key: string, data: RecommendationResult) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest entry (Map iteration is insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_UTL_MS });
}

function formatResult(
  rows: Array<Record<string, unknown>>,
  page: number,
  pageSize: number,
): RecommendationResult {
  if (rows.length === 0) {
    return { projects: [], totalCount: 0, hasMore: false, page, pageSize };
  }
  const totalCount = Number(rows[0].total_count) || 0;
  const projects = rows.map((row) => {
    const { total_count: _total_count, ...rest } = row;
    void _total_count;
    return rest;
  });
  const hasMore = page * pageSize < totalCount;
  return { projects, totalCount, hasMore, page, pageSize };
}

/**
 * Returns paginated project recommendations for a freelancer.
 *
 * Security note: The API layer must verify that the authenticated user
 * matches `userId` before calling this function. This function does not
 * perform authentication/authorisation itself.
 */
export async function getRecommendations({
  userId,
  page = 1,
  pageSize = 10,
}: {
  userId: number;
  page?: number;
  pageSize?: number;
}): Promise<RecommendationResult> {
  // Clamp inputs.
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const cacheKey = `${userId}:${safePage}:${safePageSize}`;

  // Try cache first.
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Get freelancer id and preferences.
  const freelancerRows = await sql`
    SELECT id, preferred_min_budget, preferred_max_budget, preferred_category_id
    FROM freelancers
    WHERE user_id = ${userId}
  `;

  let projects;
  if (freelancerRows.length === 0) {
    // No freelancer profile – fallback to recent projects.
    projects = await sql`
      SELECT *, COUNT(*) OVER () AS total_count
      FROM projects
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT ${safePageSize} OFFSET ${offset}
    `;
  } else {
    const freelancer = freelancerRows[0];
    const freelancerId = freelancer.id;

    // Main recommendation query.
    // The query computes a weighted score based on:
    //   - skill overlap (2 points per skill)
    //   - preferred category (1 point)
    //   - budget compatibility (1 point)
    //   - category of past completed projects (1 point)
    // Projects with score=0 are only included if they are recent (30 days)
    // to serve as a fallback when matches are insufficient.
    projects = await sql`
      WITH user_data AS (
        SELECT id, preferred_min_budget, preferred_max_budget, preferred_category_id
        FROM freelancers
        WHERE id = ${freelancerId}
      ),
      skill_match_counts AS (
        SELECT ps.project_id, COUNT(*) AS skill_count
        FROM project_skills ps
        JOIN freelancer_skills fs ON fs.skill_id = ps.skill_id
        JOIN user_data ud ON ud.id = fs.freelancer_id
        GROUP BY ps.project_id
      ),
      past_categories AS (
        SELECT DISTINCT p.category_id
        FROM project_history ph
        JOIN projects p ON pid.id = ph.project_id
        WHERE ph.freelancer_id = ${freelancerId}
          AND ph.status = 'completed'
      ),
      scored_projects AS (
        SELECT
          p.*,
          COALESCE(smc.skill_count, 0) * 2
            + CASE WHEN p.category_id = ud.preferred_category_id THEN 1 ELSE 0 END
            + CASE WHEN p.budget_min <= ud.preferred_max_budget
               AND p.budget_max >= ud.preferred_min_budget THEN 1 ELSE 0 END
            + CASE WHEN pc.category_id IS NOT NULL THEN 1 ELSE 0 END
          AS score,
          COUNT(*) OVER() AS total_count
        FROM projects p
        CROSS JOIN user_data ud
        LEFT JOIN skill_match_counts smc ON smc.project_id = p.id
        LEFT JOIN past_categories pc ON pc.category_id = p.category_id
        WHERE P.status = 'open'
          AND (
            COALESCE(smc.skill_count, 0) > 0
            OR p.category_id = ud.preferred_category_id
            OR (p.budget_min <= ud.preferred_max_budget
                AND p.budget_max >= ud.preferred_min_budget)
            OR pc.category_id IS NOT NULL
            OR p.created_at > NOW() - INTERVAL 30 days
          )
      )
      SELECT * FROM scored_projects
      ORDER BY score DESC, created_at DESC
      LIMIT ${safePageSize} OFFSET ${offset}
    `;
  }

  const result = formatResult(projects, safePage, safePageSize);
  setCache(cacheKey, result);

  // Basic logging/metrics for observability.
  console.log(
    `[recommendations] userId=${userId} page=${safePage} pageSize=${safePageSize} ` +
    `returned=${result.projects.length} totalCount=${result.totalCount} hasMore=${result.hasMore}`
  );

  return result;
}

// -------------- Proposal Shortlisting & Acceptance Concurrency Control ----------------
//
// This section implements the atomic workflow for shortlisting,
// accepting, and rejecting proposals. All mutations run inside a
// database transaction and rely on row-level locks + unique constraints
// to prevent race conditions.
//
// Required migration (idempotent duplicate-protection and single acceptance):
//   ALTER TABLE proposals ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
//   CREATE UNIQUE INDEX IF NOT EXISTS uq_proposals_idempotency
//     ON proposals(idempotency_key) WHERE idempotency_key IS NOT NULL;
//   CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_single_accept
//     ON proposals(project_id) WHERE status = 'accepted';
//   CREATE UNIQUE UNIQUE INDEX IF NOT EXISTS uq_contracts_project
//     ON contracts(project_id);

export type ProposalAction = "shortlist" | "accept" | "reject";

export type ProposalOutcome = {
  ok: boolean;
  code?: string;
  message?: string;
  proposalId?: number;
  projectId?: number;
  status?: string;
  contractId?: number;
  idempotent?: boolean;
};

const PROPOSAL_TRANSITIONS = {
  shortlist: ["submitted", "shortlisted"],
  accept: ["submitted", "shortlisted"],
  reject: ["submitted", "shortlisted"],
} as const satisfies Record<ProposalAction, readonly string[]>;

function isProposalAction(value: string): value is ProposalAction {
  return value === "shortlist" || value === "accept" || value === "reject";
}

export type ProposalActionParams = {
  proposalId: number;
  actorUserId: number;
  action: ProposalAction | string;
  idempotencyKey?: string | null;
};

/**
 * Applies a shortlist/accept/reject action atomically.
 *
 * Guarantees:
*   - Only the project owner (client) is allowed to mutate proposals.
 *   - Proposal status is validated before any write.
 *   - Acceptance is guarded by a partial unique index on (project_id)
 *     WHERE status = 'accepted', so concurrent acceptances cannot
 *     create multiple contracts for the same project.
 *   - Duplicate requests are deduplicated via idempotency_key.
 *   - All writes and audit logs are written in a single transaction.
 */
export async function applyProposalAction(
  params: ProposalActionParams
): Promise<ProposalOutcome> {
  const { proposalId, actorUserId, idempotencyKey } = params;
  const action = params.action;

  if (!isProposalAction(action)) {
    return { ok: false, code: "invalid_action", message: "Unknown proposal action." };
  }
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return { ok: false, code: "invalid_proposal_id", message: "Invalid proposal id." };
  }
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return { ok: false, code: "unauthorized", message: "Missing authenticated user." };
  }

  const nextStatus = action === "shortlist" ? "shortlisted" : action === "accept" ? "accepted" : "rejected";
  const allowedFrom = PROPOSAL_TRANSITIONS[action];

  try {
    return await sql.begin(async (tx) => {
      // Idempotency: short-circuit duplicate requests before any write.
      if (idempotencyKey) {
        const existing = await tx`
          SELECT id, project_id, status
          FROM proposals
          WHERE idempotency_key = ${idempotencyKey}
          LIMIT 1
        `;
        if (existing.length > 0) {
          const row = existing[0] as { id: number; project_id: number; status: string };
          return {
            ok: true,
            code: "idempotent_replay",
            message: "Request already processed.",
            proposalId: Number(row.id),
            projectId: Number(row.project_id),
            status: row.status,
            idempotent: true,
          };
        }
      }

      // Lock the proposal row and join the project to verify ownership.
      const proposalRows = await tx`
        SELECT p.id, p.project_id, p.status, pr.client_id
        FROM proposals p
        JOIN projects pr ON pr.id = p.project_id
        WHERE p.id = ${proposalId}
        FOR UPDATE OF p
      `;

      if (proposalRows.length === 0) {
        return { ok: false, code: "not_found", message: "Proposal not found." };
      }

      const proposal = proposalRows[0] as {
        id: number;
        project_id: number;
        status: string;
        client_id: number;
      };

      // Authorization: only the project owner may act on proposals.
      if (Number(proposal.client_id) !== Number(actorUserId)) {
        return {
          ok: false,
          code: "forbidden",
          message: "Only the project owner can modify proposals.",
          proposalId: Number(proposal.id),
          projectId: Number(proposal.project_id),
        };
      }

      // Status validation.
      if (!allowedFrom.includes(proposal.status)) {
        return {
          ok: false,
          code: "invalid_status",
          message: `Proposal is ${proposal.status} and cannot be ${action}.`,
          proposalId: Number(proposal.id),
          projectId: Number(proposal.project_id),
          status: proposal.status,
        };
      }

      // Apply the status transition. The partial unique index on
      // (project_id) WHERE status = 'accepted' guarantees at most one
      // accepted proposal per project even under concurrency.
      await tx`
        UPDATE proposals
        SET status = ${nextStatus},
            updated_at = NOW(),
            idempotency_key = COALESCE(${idempotencyKey ?? null}, idempotency_key)
        WHERE id = ${proposalId}
      `;

      let contractId: number | undefined;

      // On acceptance, create the contract and reject all other
      // pending/shortlisted proposals for the same project.
      if (action === "accept") {
        const contractRows = await tx`
          INSERT INTO contracts (project_id, proposal_id, client_id, freelancer_id, status, created_at)
          SELECT project_id, id, client_id, freelancer_id, 'active', NOW()
          FROM proposals
          WHERE id = ${proposalId}
          RETURNING id
        `;
        contractId = Number((contractRows[0] as { id: number }).id);

        const rejectedRows = await tx`
          UPDATE proposals
          SET status = 'rejected', updated_at = NOW()
          WHERE project_id = ${proposal.project_id}
            AND id <> ${proposalId}
            AND status IN ('submitted', 'shortlisted')
          RETURNING id
        `;

        for (const row of rejectedRows as Array<{ id: number }>) {
          await tx`
            INSERT INTO proposal_audit_logs
              (proposal_id, actor_id, action, previous_status, new_status, metadata)
            VALUES (${Number(row.id)}, ${actorUserId}, 'reject', 'submitted', 'rejected',
                        ${JSON.stringify({ reason: "auto_rejected_on_accept", projectId: proposal.project_id })})
            `;
        }
      }

      // Record the audit log for the primary action.
      await tx`
        INSERT INTO proposal_audit_logs
          (proposal_id, actor_id, action, previous_status, new_status, metadata)
        VALUES (${proposalId}, ${actorUserId}, ${action}, ${proposal.status}, ${nextStatus},
                ${JSON.stringify({ contractId: contractId ?? null })})
      `;

      return {
        ok: true,
        proposalId: Number(proposal.id),
        projectId: Number(proposal.project_id),
        status: nextStatus,
        contractId: contractId,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Postgres unique violation -> concurrency conflict.
    if (/duplicate key|unique constraint|23505/i.test(message)) {
      return {
        ok: false,
        code: "conflict",
        message: "Concurrent update conflict; please retry.",
        proposalId: proposalId,
      };
    }
    return {
      ok: false,
      code: "internal_error",
      message: "Unable to process proposal action.",
      proposalId: proposalId,
    };
  }
}
