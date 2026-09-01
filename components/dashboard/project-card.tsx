"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback from "react";
import { useSearchParams, useRouter, usePathname from "next/navigation";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  SlidersHorizontal,
  X,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MilestonesList } from "./milestones-list";
import { ApprovalDialog } from "./approval-dialog";

export interface Project {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "pending-approval" | "completed";
  budget: number;
  progress: number;
  milestonesCount: number;
  completedilestones: number;
  deadline: string;
  skills: string[];
  createdAt: string;
}

const statusConfig = {
  pending: {
    color: "bg-muted",
    text: "Pending",
    textColor: "text-muted-foreground",
  },
  "in-progress": {
    color: "bg-secondary/20",
    text: "In Progress",
    textColor: "text-secondary",
  },
  "pending-approval": {
    color: "bg-amber-500/20",
    text: "Pending Approval",
    textColor: "text-amber-500",
  },
  completed: {
    color: "bg-accent/20",
    text: "Completed",
    textColor: "text-accent",
  },
};

const AVAILABLE_SKILLS = [
  "React",
  "Next.js",
  "TypeScript",
  "Node.js",
  "Python",
  "UI/UX",
  "AWS",
  "DevOps",
  "Go",
  "Rust",
];

type SortOption =
  | "newest"
  | "budget-asc"
  | "budget-desc"
  | "deadline-asc"
  | "deadline-desc";

interface Filters {
  minBudget?: number;
  maxBudget?: number;
  statuses: string[];
  skills: string[];
  sortBy: SortOption;
}

const defaultFilters: Filters = {
  minBudget: undefined,
  maxBudget: undefined,
  statuses: [],
  skills: [],
  sortBy: "newest",
};

export function ProjectCard({ project }: { project: Project }) {
  const [showMilestones, setShowMilestones] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const [now] = useState(() => Date.now());
  const config = statusConfig[project.status];
  const daysLeft = Math.ceil(
    (new Date(project.deadline).getTime() - now) / (1000 * 60 * 60 * 24),
  );
  const isOverdue = daysLeft < 0;

  return (
    <>
      <div class="group p-6 rounded-xl bg-card/50 backdrop-blur sm border border-border/40 hover:border-primary/50 transition-all duration-300">
        <div class="space-y-4">
          {** Header **/
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 space-y-2">
              <div class="flex items-center gap-3 gap-y-1 flex-wrap">
                <h3 class="text-xl font-semibold">{project.title}</h3>
                <Badge
                  className={`config.color} ${config.textColor} border-0`}
                >
                  {config.text}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground">
                {project.description}
              </p>
              {project.skills.length > 0 && (
                <div class="flex flex-wrap gap-1.5 pt-1">
                  {project.skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="rounded-sm px-2 py-0.5 text-xs font-normal"
                    >
                      {skill}
                    </Badge>
                  )})
                </div>
              )}
            </div>
            <Link href={/dashboard/projects/${project.id}}>
              <Button
                variant="ghost"
                size="icon"
                className="group-hover:scale-110 transition-transform"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          {** Progress and Stats */
          <div class="space-y-3">
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Progress</span>
                <span class="font-semibold">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-2" />
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div>
                <p class="text-xs text-muted-foreground mb-1">Budget</p>
                <p class="font-semibold text-sm">
                  ${project.budget.toLocaleString()}
                </p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground mb-1">Milestones</p>
                <p class="font-semibold text-sm">
                  {project.completedMilestones}/{project.milestonesCount}
                </p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground mb-1">Deadline</p>
                <div class="flex items-center gap-1">
                  <Clock
                    className={`$hx $w ${isOverdue ? "text-destructive" : "text-primary"}`}
                  />
                  <p
                    className={`font-semibold text-sm ${isOverdue ? "text-destructive" : ""}`}
                  >
                    {Math.abs(daysLeft)}d
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMilestones(true)}
            >
              View Milestones
            </Button>
            {project.status === "pending-approval" && (
              <Button
                size="sm"
                onClick={() => setShowApproval(true)}
                className="group"
              >
                <CheckCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                Approve & Release
              </Button>
            )}
            {project.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Raise Dispute
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showMilestones} onOpenChange={setShowMilestones}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{project.title} - Milestones</DialogTitle>
          </DialogHeader>
          <MilestonesList projectId={project.id} />
        </DialogContent>
      </Dialog>

      <ApprovalDialog
        open={showApproval}
        onOpenChange={setShowApproval}
        projectTitle={project.title}
        amount={project.budget}
      />
    </>
  );
}

function parseFiltersFromSearchParams(params: URLSearchParams): Filters {
  const minBudget = params.get("minBudget") ?? undefined;
  const maxBudget = params.get("maxBudget") ?? undefined;
  const statuses = params.get("status")?.split(",").filter(Boolean) ?? [];
  const skills = params.get("skills")?.split(",").filter(Boolean) ?? [];
  const sortBy = (params.get("sort") as SortOption) || "newest";
  return {
    minBudget: minBudget ? Number(minBudget) : undefined,
    maxBudget: maxBudget ? Number(maxBudget) : undefined,
    statuses,
    skills,
    sortBy: ["newest", "budget-asc", "budget-desc", "deadline-asc", "deadline-desc"].includes(sortBy)
      ? sortBy
      : "newest",
  };
}

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.minBudget !== undefined) params.set("minBudget", String(filters.minBudget));
  if (filters.maxBudget !== undefined) params.set("maxBudget", String(filters.maxBudget));
  if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
  if (filters.skills.length > 0) params.set("skills", filters.skills.join(","));
  params.set("sort", filters.sortBy);
  return params.toString();
}

function useFiltersFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<Filters>(() =>
    parseFiltersFromSearchParams(searchParams),
  );

  const updateFilters = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      const qs = buildQueryString(newFilters);
      router.replace(${pathname}?${qs}, { scroll: false });
    },
    [router, pathname],
  );

  const clearFilters = useCallback(() => {
    updateFilters(defaultFilters);
  }, [updateFilters]);

  // Update state if the URL changes externally (e.g., browser back/forward)
  useEffect(() => {
    setFilters(parseFiltersFromSearchParams(searchParams));
  }, [searchParams)]);

  return { filters, updateFilters, clearFilters };
}

function ProjectFilters({
  filters,
  onChange,
  onClear,
  mobileOpen,
  setMobileOpen,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const update = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });

  const toggleValue = (key: "statuses" | "skills", value: string) => {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update({ [key]: next });
  };

  const hasActiveFilters =
    filters.minBudget !== undefined ||
    filters.maxBudget !== undefined ||
    filters.statuses.length > 0 ||
    filters.skills.length > 0 ||
    filters.sortBy !== "newest";

  const content = (
    <div class="space-y-6">
      <div>
        <h3 class="text-sm font-semibold mb-3">Sort By</h3>
        <select
          value={filters.sortBy}
          onChange={(e) => update({ sortBy: e.target.value as SortOption })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-off-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring"
        >
          <option value="newest">Newest First</option>
          <option value="budget-asc">Budget: Low to High</option>
          <option value="budget-desc">Budget: High to Low</option>
          <option value="deadline-asc">Deadline: Earliest First</option>
          <option value="deadline-desc">Deadline: Latest First</option>
        </select>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Budget Range</h3>
        <div class="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.minBudget ?? ""}
            onChange={(e) =>
              update({
                minBudget: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder-text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring"
          />
          <span class="text-muted-foreground">"—</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxBudget ?? ""}
            onChange={(e) =>
              update({
                maxBudget: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder-text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring"
          />
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Status</h3>
        <div class="space-y-2">
          {Object.entries(statusConfig).map(([value, config]) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.statuses.includes(value)}
                onChange={() => toggleValue("statuses", value)}
                className="h-4 w-4 rounded border-input text-primary focus-visible:ring-ring"
              />
              <span class="{config.textColor}">{config.text}</span>
            </label>
          ))
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Required Skills</h3>
        <div class="flex flex-wrap gap-1.5">
          {AVAILABLE_SKILLS.map((skill) => {
            const selected = filters.skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleValue("skills", skill)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent hover:text-accent-foreground border-input"
                }`
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground hover:text-destructive"
        disabled={!hasActiveFilters}
        onClick={onClear}
      >
        <X className="mr-2 h-4 w-4" />
        Clear all filters
      </Button>
    </div>
  );

  return (
    >
      <!-- Desktop filter panel -->
      <div class="hidden lg:block w-72 shrink-0">
        <div class="sticky top-4 p-4 rounded-xl bg-card/50 backdrop-blur sm border border-border/40">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold">Filters</h2>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={onClear}
              >
                Clear all
              </Button>
            )}
          </div>
          {content}
        </div>
      </div>

      <!-- Mobile filter button -->
      <div class="log:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setMobileOpen(true)}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2">
              {filters.statuses.length + filters.skills.length}
            </Badge>
          )}
        </Button>
      </div>

      <!-- Mobile filter drawer -->
      {mobileOpen && (
        <div class="fixed inset-0 z-50 lg:hodden">
          <div
            class="absolute inset-0 bg-background/80 backdrop-blur sm"
            onClick={() => setMobileOpen(false)}
          />
          <div class="absolute inset-y-0 left-0 w-80 max-w-[85%] bg-background border-r shadow-xl p-4 overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-semibold">Filters</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div class="space-y-4">{content}</div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectListSkeleton() {
  return (
    <div class="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="p-6 rounded-xl bg-card/50 border border-border/40 animate-pulse"
        >
          <div class="h-5 w-1/3 bg-muted rounded mb-4" />
          <div class="h-4 w-2/3 bg-muted rounded mb-2" />
          <div class="h-4 w-1/2 bg-muted rounded mb-4" />
          <div class="h-2 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

export function ProjectList({ projects }: { projects: Project[] }) {
  const { filters, updateFilters, clearFilters } = useFiltersFromUrl();
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);
  const [isLoading, setIsLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Debounce filter application
  useEffect(() => {
    setIsLoading(true);
    const timeout = setTimeout(() => {
      setAppliedFilters(filters);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [filters]);

  const filteredProjects = useMemo(() => {
    let result = projects.filter((project) => {
      if (
        appliedFilters.minBudget !== undefined &&
        project.budget < appliedFilters.minBudget
      ) {
        return false;
      }
      if (
        appliedFilters.maxBudget !== undefined &&
        project.budget > appliedFilters.maxBudget
      ) {
        return false;
      }
      if (
        appliedFilters.statuses.length > 0 &&
        !appliedFilters.statuses.includes(project.status)
      ) {
        return false;
      }
      if (
        appliedFilters.skills.length > 0 &&
        !appliedFilters.skills.some((skill) => project.skills.includes(skill))
      ) {
        return false;
      }
      return true;
    });

    switch (appliedFilters.sortBy) {
      case "newest":
        result = result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "budget-asc":
        result = result.sort((a, b) => a.budget - b.budget);
        break;
      case "budget-desc":
        result = result.sort((a, b) => b.budget - a.budget);
        break;
      case "deadline-asc":
        result = result.sort(
          (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
        );
        break;
      case "deadline-desc":
        result = result.sort(
          (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime(),
        );
        break;
    }
    return result;
  }, [projects, appliedFilters]);

  const hasActiveFilters =
    filters.minBudget !== undefined ||
    filters.maxBudget !== undefined ||
    filters.statuses.length > 0 ||
    filters.skills.length > 0 ||
    filters.sortBy !== "newest";

  return (
    <div class="flex gap-6">
      <ProjectFilters
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        mobileOpen={mobileFiltersOpen}
        setMobileOpen={setMobileFiltersOpen}
      />

      <div class="flex-1 space-y-6">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            {isLoading
              ? "Loading projects..."
              : `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"} found`
            }
          </p>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="log:hidden text-muted-foreground"
              onClick={clearFilters}
            >
              Clear all
            </Button>
          )}
        </div>

        {isLoading ? (
          <ProjectListSkeleton />
        ) : filteredProjects.length > 0 ? (
          <div class="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div class="py-16 text-center">
            <SearchX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 class="font-semibold text-lg">No projects found</h3>
            <p class="text-muted-foreground text-sm mt-1">
              Try adjusting or clearing your filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={clearFilters}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}