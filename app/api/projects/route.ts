// app/api/projects/route.ts
//
// POST /api/projects  — create a project
// GET  /api/projects  — list projects (with optional ?clientId= &status= &limit= &offset=)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProject,
  getAvailableProjectSkills,
  listProjects,
  type ProjectSortField,
  type ProjectSortOrder,
  type ProjectStatus,
} from "@/lib/projects";

// ─── Validation schemas ────────────────────────────────────────────────────

const PROJECT_STATUS = ["open", "in_progress", "completed", "cancelled"] as const;

const CreateProjectSchema = z.object({
  clientId: z
    .string({ required_error: "clientId is required" })
    .uuid("clientId must be a valid UUID"),
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title cannot be empty")
    .max(200, "title must be 200 characters or fewer"),
  description: z
    .string()
    .max(2000, "description must be 2000 characters or fewer")
    .optional(),
  budgetUsdc: z
    .number({ required_error: "budgetUsdc is required" })
    .positive("budgetUsdc must be a positive number")
    .multipleOf(0.0000001, "budgetUsdc supports up to 7 decimal places"),
  milestoneCount: z
    .number()
    .int("milestoneCount must be an integer")
    .min(0, "milestoneCount cannot be negative")
    .optional(),
});

const PROJECT_SORT_FIELDS = ["newest", "budget", "deadline"] as const;
const PROJECT_SORT_ORDERS = ["asc", "desc"] as const;

const ListProjectsSchema = z.object({
  clientId:  z.string().uuid("clientId must be a valid UUID").optional(),
  status:    z.enum(PROJECT_STATUS).optional(),
  minBudget: z.coerce.number().min(0).optional(),
  maxBudget: z.coerce.number().min(0).optional(),
  skills:    z.array(z.string().min(1).max(100)).optional(),
  sort:      z.enum(PROJECT_SORT_FIELDS).optional(),
  order:     z.enum(PROJECT_SORT_ORDERS).optional(),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  offset:    z.coerce.number().int().min(0).optional(),
});

// ─── POST /api/projects ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const project = await createProject(parsed.data);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}

// ─── GET /api/projects ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const parsed = ListProjectsSchema.safeParse({
    clientId:  searchParams.get("clientId")  ?? undefined,
    status:    searchParams.get("status")    ?? undefined,
    minBudget: searchParams.get("minBudget") ?? undefined,
    maxBudget: searchParams.get("maxBudget") ?? undefined,
    skills:    searchParams.getAll("skills"),
    sort:      searchParams.get("sort")      ?? undefined,
    order:     searchParams.get("order")     ?? undefined,
    limit:     searchParams.get("limit")     ?? undefined,
    offset:    searchParams.get("offset")    ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await listProjects({
      clientId:  parsed.data.clientId,
      status:    parsed.data.status as ProjectStatus | undefined,
      minBudget: parsed.data.minBudget,
      maxBudget: parsed.data.maxBudget,
      skills:    parsed.data.skills,
      sort:      parsed.data.sort as ProjectSortField | undefined,
      order:     parsed.data.order as ProjectSortOrder | undefined,
      limit:     parsed.data.limit,
      offset:    parsed.data.offset,
    });
    const skills = await getAvailableProjectSkills();
    return NextResponse.json({ ...result, skills });
  } catch (err) {
    console.error("[GET /api/projects]", err);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}