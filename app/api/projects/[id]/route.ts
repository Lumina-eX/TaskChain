// app/api/projects/[id]/route.ts
//
// GET    /api/projects/:id  — fetch a single project
// PATCH  /api/projects/:id  — partial update
// DELETE /api/projects/:id  — soft/hard delete

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProjectById,
  updateProject,
  deleteProject,
  type ProjectStatus,
} from "@/lib/projects";

// ─── Shared ID validation ──────────────────────────────────────────────────

const UUIDSchema = z.string().uuid();

function parseId(raw: string): { id: string } | { error: NextResponse } {
  const result = UUIDSchema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: "Project ID must be a valid UUID" },
        { status: 400 },
      ),
    };
  }
  return { id: result.data };
}

// ─── PATCH validation schema ───────────────────────────────────────────────

const PROJECT_STATUS = ["open", "in_progress", "completed", "cancelled"] as const;

const UpdateProjectSchema = z
  .object({
    title: z
      .string()
      .min(1, "title cannot be empty")
      .max(200, "title must be 200 characters or fewer")
      .optional(),
    description: z
      .string()
      .max(2000, "description must be 2000 characters or fewer")
      .nullable()
      .optional(),
    budgetUsdc: z
      .number()
      .positive("budgetUsdc must be a positive number")
      .multipleOf(0.0000001, "budgetUsdc supports up to 7 decimal places")
      .optional(),
    status: z.enum(PROJECT_STATUS).optional(),
    milestoneCount: z
      .number()
      .int("milestoneCount must be an integer")
      .min(0)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for an update",
  });

// ─── Route context type (Next.js 15 App Router) ───────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET /api/projects/:id ─────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  context: RouteContext,
) {
  const { id: rawId } = await context.params;
  const parsed = parseId(rawId);
  if ("error" in parsed) return parsed.error;

  try {
    const project = await getProjectById(parsed.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (err) {
    console.error(`[GET /api/projects/${parsed.id}]`, err);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// ─── PATCH /api/projects/:id ───────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
) {
  const { id: rawId } = await context.params;
  const idParsed = parseId(rawId);
  if ("error" in idParsed) return idParsed.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = UpdateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const updated = await updateProject(idParsed.id, {
      ...parsed.data,
      status: parsed.data.status as ProjectStatus | undefined,
      description: parsed.data.description ?? undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH /api/projects/${idParsed.id}]`, err);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// ─── DELETE /api/projects/:id ──────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  context: RouteContext,
) {
  const { id: rawId } = await context.params;
  const parsed = parseId(rawId);
  if ("error" in parsed) return parsed.error;

  try {
    const deleted = await deleteProject(parsed.id);
    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`[DELETE /api/projects/${parsed.id}]`, err);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}