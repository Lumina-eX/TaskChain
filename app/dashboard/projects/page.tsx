"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Filter, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectStatus = "pending" | "in-progress" | "pending-approval" | "completed";

interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  budget: number;
  progress: number;
  milestonesCount: number;
  completedMilestones: number;
  deadline: string;
  createdAt: string;
  skills: string[];
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") ?? "";
    setSearchTerm(q);
    setDebouncedSearchTerm(q);
    if (params.get("status")) setStatusFilter(params.get("status")!);
    if (params.get("minBudget")) setMinBudget(params.get("minBudget")!);
    if (params.get("maxBudget")) setMaxBudget(params.get("maxBudget")!);
    const skillParams = (params.get("skills") ?? "").split(",").filter(Boolean);
    if (skillParams.length) setSelectedSkills(skillParams);
    if (params.get("sort")) setSortBy(params.get("sort")!);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (debouncedSearchTerm) params.set("q", debouncedSearchTerm);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (minBudget) params.set("minBudget", minBudget);
    if (maxBudget) params.set("maxBudget", maxBudget);
    if (selectedSkills.length) params.set("skills", selectedSkills.join(","));
    if (sortBy !== "newest") params.set("sort", sortBy);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [hydrated, debouncedSearchTerm, statusFilter, minBudget, maxBudget, selectedSkills, sortBy]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects", {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const mapped: Project[] = (data.projects ?? []).map((p: {
          id: string; title: string; status: string;
          budget_max: string | null; deadline: string | null;
          milestones_count: number; completed_milestones: number;
          created_at?: string | null; skills?: string[] | null;
          required_skills?: string[] | null;
        }) => ({
          id: p.id,
          title: p.title,
          status: mapStatus(p.status),
          budget: parseFloat(p.budget_max ?? "0"),
          progress:
            p.milestones_count > 0
              ? Math.round((p.completed_milestones / p.milestones_count) * 100)
              : 0,
          milestonesCount: p.milestones_count,
          completedMilestones: p.completed_milestones,
          deadline: p.deadline
            ? new Date(p.deadline).toISOString().split("T")[0]
            : new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
          createdAt: p.created_at ?? "",
          skills: Array.isArray(p.skills)
            ? p.skills
            : Array.isArray(p.required_skills)
              ? p.required_skills!
              : [],
        }));
        setProjects(mapped);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allSkills = useMemo(
    () => Array.from(new Set(projects.flatMap((p) => p.skills))).sort(),
    [projects]
  );

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (minBudget ? 1 : 0) +
    (maxBudget ? 1 : 0) +
    selectedSkills.length;

  const clearAllFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setStatusFilter("all");
    setMinBudget("");
    setMaxBudget("");
    setSelectedSkills([]);
    setSortBy("newest");
  };

  const filtered = useMemo(
    () => {
      const min = minBudget ? parseFloat(minBudget) : 0;
      const max = maxBudget ? parseFloat(maxBudget) : Infinity;
      return projects
        .filter((p) => {
          const matchSearch = p.title
            .toLowerCase()
            .includes(debouncedSearchTerm.toLowerCase());
          const matchStatus =
            statusFilter === "all" ||
            (statusFilter === "active"
              ? p.status !== "completed"
              : p.status === statusFilter);
          const matchBudget = p.budget >= min && p.budget <= max;
          const matchSkills =
            selectedSkills.length === 0 ||
            selectedSkills.every((skill) => p.skills.includes(skill));
          return matchSearch && matchStatus && matchBudget && matchSkills;
        })
        .sort((a, b) => {
          if (sortBy === "budget-asc") return a.budget - b.budget;
          if (sortBy === "budget-desc") return b.budget - a.budget;
          if (sortBy === "deadline-asc")
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          if (sortBy === "deadline-desc")
            return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() || 0 : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() || 0 : 0;
          return timeB - timeA || b.id.localeCompare(a.id);
        });
    },
    [projects, debouncedSearchTerm, statusFilter, minBudget, maxBudget, selectedSkills, sortBy]
  );

  return (
    <div className="p-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">All Projects</h1>
          <p className="text-muted-foreground mt-2">View and manage all your projects</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border/40"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setFiltersOpen((open) => !open)}
              className="sm:w-auto border-border/40"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="ml-2">{activeFilterCount}</Badge>
              )}
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-48 border-border/40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="budget-asc">Budget: Low to High</SelectItem>
                <SelectItem value="budget-desc">Budget: High to Low</SelectItem>
                <SelectItem value="deadline-asc">Deadline: Soonest</SelectItem>
                <SelectItem value="deadline-desc">Deadline: Latest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtersOpen && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full border-border/40">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="pending-approval">Pending Approval</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Min Budget</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={minBudget}
                    onChange={(e) => setMinBudget(e.target.value)}
                    className="border-border/40"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Budget</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="No limit"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)}
                    className="border-border/40"
                  />
                </div>
              </div>

              {allSkills.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Required Skills</label>
                  <div className="flex flex-wrap gap-2">
                    {allSkills.map((skill) => {
                      const isSelected = selectedSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() =>
                            setSelectedSkills((prev) =>
                              isSelected
                                ? prev.filter((s) => s !== skill)
                                : [...prev, skill]
                            )
                          }
                          className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border/40 hover:bg-muted/70"
                          }`}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={clearAllFilters} className="border-border/40">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear All Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects…
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

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {projects.length === 0
                ? "No projects yet."
                : "No projects match your filters."}
            </p>
            {projects.length > 0 && (
              <Button variant="outline" onClick={clearAllFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
