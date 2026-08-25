"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, ChevronRight, Loader2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  title: string;
  status: "pending" | "in-progress" | "pending-approval" | "completed";
  budget: number;
  progress: number;
  milestonesCount: number;
  completedMilestones: number;
  deadline: string;
}

interface ProjectResponse {
  projects: Project[];
  skills: string[];
  totalItems: number;
}

const statusConfig = {
  pending: { color: "bg-muted", text: "Pending", textColor: "text-muted-foreground" },
  "in-progress": { color: "bg-secondary/20", text: "In Progress", textColor: "text-secondary" },
  "pending-approval": { color: "bg-amber-500/20", text: "Pending Approval", textColor: "text-amber-500" },
  completed: { color: "bg-accent/20", text: "Completed", textColor: "text-accent" },
};

function mapStatus(dbStatus: string): Project["status"] {
  const map: Record<string, Project["status"]> = {
    draft: "pending", open: "pending",
    in_progress: "in-progress", completed: "completed",
    cancelled: "completed", disputed: "in-progress",
  };
  return map[dbStatus] ?? "pending";
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="Loading projects">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/50 p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [now] = useState(() => Date.now());

  // Filter state (initialised from URL query params so filters persist).
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [minBudget, setMinBudget] = useState(searchParams.get("minBudget") ?? "");
  const [maxBudget, setMaxBudget] = useState(searchParams.get("maxBudget") ?? "");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    searchParams.getAll("skills"),
  );
  const [sort, setSort] = useState(searchParams.get("sort") ?? "newest");
  const [order, setOrder] = useState(searchParams.get("order") ?? "desc");

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    statusFilter !== "all" ||
    minBudget !== "" ||
    maxBudget !== "" ||
    selectedSkills.length > 0;

  // Build the query string used for both the API call and the URL.
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("q", searchTerm.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (minBudget !== "") params.set("minBudget", minBudget);
    if (maxBudget !== "") params.set("maxBudget", maxBudget);
    selectedSkills.forEach((skill) => params.append("skills", skill));
    if (sort !== "newest") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    return params.toString();
  }, [searchTerm, statusFilter, minBudget, maxBudget, selectedSkills, sort, order]);

  // Keep the URL in sync with the applied filters (shareable / refreshable).
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const qs = params.toString();
    router.replace(qs ? `/dashboard/projects?${qs}` : "/dashboard/projects", {
      scroll: false,
    });
  }, [queryString, router]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects?${queryString}`, {
        headers: getAuthHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ProjectResponse;
      const mapped: Project[] = (data.projects ?? []).map((p: {
        id: string; title: string; status: string;
        budgetUsdc: number; milestoneCount: number; createdAt: string;
      }) => ({
        id: p.id,
        title: p.title,
        status: mapStatus(p.status),
        budget: Number(p.budgetUsdc ?? 0),
        progress: 0,
        milestonesCount: Number(p.milestoneCount ?? 0),
        completedMilestones: 0,
        deadline: p.createdAt
          ? new Date(p.createdAt).toISOString().split("T")[0]
          : new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      }));
      setProjects(mapped);
      setSkills(data.skills ?? []);
      setTotalItems(data.totalItems ?? mapped.length);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  // Debounced fetch — prevents excessive API calls during rapid input changes.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadProjects();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [loadProjects]);

  function toggleSkill(skill: string) {
    setSelectedSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill],
    );
  }

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("all");
    setMinBudget("");
    setMaxBudget("");
    setSelectedSkills([]);
    setSort("newest");
    setOrder("desc");
  }

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === "all" || p.status === statusFilter;
        const matchMin = minBudget === "" || p.budget >= parseFloat(minBudget);
        const matchMax = maxBudget === "" || p.budget <= parseFloat(maxBudget);
        return matchSearch && matchStatus && matchMin && matchMax;
      }),
    [projects, searchTerm, statusFilter, minBudget, maxBudget]
  );

  const filterPanel = (
    <div className="space-y-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Search</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">Status</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="pending-approval">Pending Approval</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Budget range (USDC)</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={minBudget}
            onChange={(e) => setMinBudget(e.target.value)}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-sm font-medium">Required skills</span>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills available yet.</p>
        ) : (
          <div className="grid gap-2">
            {skills.map((skill) => (
              <label key={skill} className="flex items-center gap-3 text-sm text-muted-foreground">
                <Checkbox
                  checked={selectedSkills.includes(skill)}
                  onCheckedChange={() => toggleSkill(skill)}
                />
                {skill}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Sort by</span>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="budget">Budget</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
          </SelectContent>
        </Select>
        {sort !== "newest" && (
          <Select value={order} onValueChange={setOrder}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">All Projects</h1>
            <p className="text-muted-foreground mt-2">View and manage all your projects</p>
          </div>
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && <Badge className="ml-2">{selectedSkills.length + (statusFilter !== "all" ? 1 : 0) + (minBudget !== "" || maxBudget !== "" ? 1 : 0) + (searchTerm.trim() ? 1 : 0)}</Badge>}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Desktop filter sidebar */}
          <aside className="hidden h-fit rounded-xl border border-border/40 bg-card/50 p-5 lg:sticky lg:top-24 lg:block">
            {filterPanel}
          </aside>

          {/* Mobile filter drawer */}
          {drawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto border-l border-border bg-background p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Filters</h2>
                  <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                {filterPanel}
                <Button className="mt-6 w-full" onClick={() => setDrawerOpen(false)}>
                  Show results
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/40 bg-card/50 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-muted-foreground">Showing</p>
                <p className="font-semibold">
                  {totalItems} project{totalItems === 1 ? "" : "s"} found
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="budget">Budget</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                  </SelectContent>
                </Select>
                {sort !== "newest" && (
                  <Select value={order} onValueChange={setOrder}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {loading ? (
              <LoadingRows />
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
                <p className="text-muted-foreground mb-4">
                  {totalItems === 0
                    ? "No projects yet."
                    : "No projects match your filters."}
                </p>
                {totalItems > 0 && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/40 bg-muted/20">
                      <tr>
                        <th className="px-6 py-4 text-left font-semibold">Project</th>
                        <th className="px-6 py-4 text-left font-semibold">Status</th>
                        <th className="px-6 py-4 text-left font-semibold">Progress</th>
                        <th className="px-6 py-4 text-left font-semibold">Budget</th>
                        <th className="px-6 py-4 text-left font-semibold">Milestones</th>
                        <th className="px-6 py-4 text-left font-semibold">Deadline</th>
                        <th className="px-6 py-4 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filtered.map((project) => {
                        const config = statusConfig[project.status];
                        const daysLeft = Math.ceil(
                          (new Date(project.deadline).getTime() - now) / (1000 * 60 * 60 * 24)
                        );
                        const isOverdue = daysLeft < 0;
                        return (
                          <tr key={project.id} className="hover:bg-primary/5 transition-colors">
                            <td className="px-6 py-4 font-semibold">{project.title}</td>
                            <td className="px-6 py-4">
                              <Badge className={`${config.color} ${config.textColor} border-0`}>
                                {config.text}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-xs">
                                  <div
                                    className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                                    style={{ width: `${project.progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground min-w-fit">
                                  {project.progress}%
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-semibold">
                              ${project.budget.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-semibold">
                              {project.completedMilestones}/{project.milestonesCount}
                            </td>
                            <td className="px-6 py-4">
                              <p className={isOverdue ? "text-destructive font-semibold" : ""}>
                                {isOverdue ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link href={`/dashboard/projects/${project.id}`}>
                                <Button variant="ghost" size="icon">
                                  <ChevronRight className="h-5 w-5" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
