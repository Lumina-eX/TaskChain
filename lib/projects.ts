// lib/projects.ts
//
// Service layer for project CRUD operations.
//
// All DB access goes through this file so route handlers stay thin and
// the logic is independently testable. Each function returns plain objects
// (never raw Neon result proxies) so callers can safely serialise them.
//
// Column mapping:
//   DB snake_case  ←→  JS camelCase (done manually — no ORM)

import { sql } from "@/lib/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ProjectStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface Project {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  budgetUsdc: number;
  status: ProjectStatus;
  milestoneCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  clientId: string;
  title: string;
  description?: string;
  budgetUsdc: number;
  milestoneCount?: number;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  budgetUsdc?: number;
  status?: ProjectStatus;
  milestoneCount?: number;
}

export interface ListProjectsFilter {
  clientId?: string;
  status?: ProjectStatus;
  limit?: number;
  offset?: number;
}

// ─── Row → domain mapper ───────────────────────────────────────────────────

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id:             row.id as string,
    clientId:       row.client_id as string,
    title:          row.title as string,
    description:    (row.description as string | null) ?? null,
    budgetUsdc:     Number(row.budget_usdc),
    status:         row.status as ProjectStatus,
    milestoneCount: Number(row.milestone_count),
    createdAt:      (row.created_at as Date).toISOString(),
    updatedAt:      (row.updated_at as Date).toISOString(),
  };
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Creates a new project row and returns the full persisted record.
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const rows = await sql`
    INSERT INTO projects (
      client_id,
      title,
      description,
      budget_usdc,
      milestone_count
    )
    VALUES (
      ${input.clientId},
      ${input.title},
      ${input.description ?? null},
      ${input.budgetUsdc},
      ${input.milestoneCount ?? 0}
    )
    RETURNING *
  `;
  return rowToProject(rows[0] as Record<string, unknown>);
}

/**
 * Returns a paginated list of projects, optionally filtered by clientId
 * and/or status. Ordered by created_at descending (newest first).
 */
export async function listProjects(filter: ListProjectsFilter = {}): Promise<Project[]> {
  const limit  = Math.min(filter.limit  ?? 20, 100); // hard cap at 100
  const offset = filter.offset ?? 0;

  // Build WHERE clauses dynamically. Neon's tagged-template approach requires
  // all placeholders to appear in the literal at build time, so we branch
  // into four possible queries rather than building a string.
  let rows: Record<string, unknown>[];

  if (filter.clientId && filter.status) {
    rows = await sql`
      SELECT * FROM projects
      WHERE  client_id = ${filter.clientId}
        AND  status    = ${filter.status}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    ` as Record<string, unknown>[];
  } else if (filter.clientId) {
    rows = await sql`
      SELECT * FROM projects
      WHERE  client_id = ${filter.clientId}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    ` as Record<string, unknown>[];
  } else if (filter.status) {
    rows = await sql`
      SELECT * FROM projects
      WHERE  status = ${filter.status}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    ` as Record<string, unknown>[];
  } else {
    rows = await sql`
      SELECT * FROM projects
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    ` as Record<string, unknown>[];
  }

  return rows.map(rowToProject);
}

/**
 * Returns a single project by ID, or null if not found.
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await sql`
    SELECT * FROM projects
    WHERE  id = ${id}
    LIMIT  1
  ` as Record<string, unknown>[];

  if (rows.length === 0) return null;
  return rowToProject(rows[0]);
}

/**
 * Applies a partial update to a project and returns the updated record.
 * Returns null if no project with that ID exists.
 *
 * Only fields present in `input` are updated; everything else is left alone.
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Project | null> {
  // Build a SET clause from only the provided fields.
  // We use a small helper to avoid sending UPDATE with an empty SET.
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined)          { fields.push("title");           values.push(input.title); }
  if (input.description !== undefined)    { fields.push("description");     values.push(input.description); }
  if (input.budgetUsdc !== undefined)     { fields.push("budget_usdc");     values.push(input.budgetUsdc); }
  if (input.status !== undefined)         { fields.push("status");          values.push(input.status); }
  if (input.milestoneCount !== undefined) { fields.push("milestone_count"); values.push(input.milestoneCount); }

  if (fields.length === 0) {
    // Nothing to update — just fetch and return the current record.
    return getProjectById(id);
  }

  // Neon tagged templates do not support dynamic column names as parameters,
  // so we build the SET clause as a safe interpolated string. Column names
  // come from our own controlled list above — no user input reaches them.
  const setClause = fields
    .map((col, i) => `${col} = $${i + 1}`)
    .join(", ");

  // We fall back to the neon() function directly here because the tagged-
  // template helper cannot accept a fully dynamic query string. The
  // parameterised values array keeps us safe from SQL injection.
  const { neon: neonFn } = await import("@neondatabase/serverless");
  const directSql = neonFn(process.env.DATABASE_URL!);
  const rows = await directSql(
    `UPDATE projects
     SET    ${setClause},
            updated_at = NOW()
     WHERE  id = $${fields.length + 1}
     RETURNING *`,
    [...values, id],
  ) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  return rowToProject(rows[0]);
}

/**
 * Deletes a project by ID. Returns true if a row was deleted, false if
 * no project with that ID existed.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM projects
    WHERE  id = ${id}
    RETURNING id
  ` as Record<string, unknown>[];

  return rows.length > 0;
}