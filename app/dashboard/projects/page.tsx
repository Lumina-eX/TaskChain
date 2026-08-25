"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Filter, ChevronRight, Loader2, X } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface Project {
  id: string;
  title: string;
  status: "pending" | "in-progress" | "pending-approval" | "completed";
  budget: number;
  progress: number;
  milestonesCount: number;
  completedMilestones: number;
  deadline: string;
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

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL state sync
  const initialSearch = searchParams.get("search") || "";
  const initialStatus = searchParams.get("status") || "all";
  const initialSort = searchParams.get("sort") || "latest";
  const initialMinBudget = searchParams.get("minBudget") || "";
  const initialMaxBudget = searchParams.get("maxBudget") || "";
  const initialSkills = searchParams.get("skills")?.split(",") || [];

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  // Local state for debouncing
  const [localSearch, setLocalSearch] = useState(initialSearch);
  const [localMinBudget, setLocalMinBudget] = useState(initialMinBudget);
  const [localMaxBudget, setLocalMaxBudget] = useState(initialMaxBudget);
  
  // Non-debounced state (immediate changes)
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [sortBy, setSortBy] = useState(initialSort);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initialSkills);

  const debouncedSearch = useDebounce(localSearch, 300);
  const debouncedMinBudget = useDebounce(localMinBudget, 500);
  const debouncedMaxBudget = useDebounce(localMaxBudget, 500);

  // Update URL parameters when filters change
  const updateQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (sortBy && sortBy !== "latest") params.set("sort", sortBy);
    if (debouncedMinBudget) params.set("minBudget", debouncedMinBudget);
    if (debouncedMaxBudget) params.set("maxBudget", debouncedMaxBudget);
    if (selectedSkills.length > 0) params.set("skills", selectedSkills.join(","));

    router.replace(`${pathname}?${params.toString()}`);
  }, [debouncedSearch, statusFilter, sortBy, debouncedMinBudget, debouncedMaxBudget, selectedSkills, pathname, router]);

  useEffect(() => {
    updateQueryString();
  }, [updateQueryString]);

  // Fetch projects
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects", {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const mapped: Project[] = (data.projects ?? []).map((p: any) => ({
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
          skills: p.skills || [], // fallback if skills not provided
        }));
        setProjects(mapped);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const clearFilters = () => {
    setLocalSearch("");
    setStatusFilter("all");
    setSortBy("latest");
    setLocalMinBudget("");
    setLocalMaxBudget("");
    setSelectedSkills([]);
    router.replace(pathname);
  };

  const filtered = useMemo(() => {
    let result = projects.filter((p) => {
      const matchSearch = p.title.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchMinBudget = !debouncedMinBudget || p.budget >= parseFloat(debouncedMinBudget);
      const matchMaxBudget = !debouncedMaxBudget || p.budget <= parseFloat(debouncedMaxBudget);
      
      const matchSkills = selectedSkills.length === 0 || 
        selectedSkills.every(skill => p.skills.includes(skill));

      return matchSearch && matchStatus && matchMinBudget && matchMaxBudget && matchSkills;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "budget-desc": return b.budget - a.budget;
        case "budget-asc": return a.budget - b.budget;
        case "deadline-desc": return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
        case "deadline-asc": return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case "latest": 
        default:
          return b.id.localeCompare(a.id);
      }
    });

    return result;
  }, [projects, debouncedSearch, statusFilter, debouncedMinBudget, debouncedMaxBudget, selectedSkills, sortBy]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  // Mock available skills for filtering UI since it might not be in API
  const availableSkills = ["React", "Node.js", "Python", "UI/UX", "Smart Contracts", "Stellar"];

  return (
    <div className="p-4 sm:p-8">
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">All Projects</h1>
          <p className="text-muted-foreground mt-2">View and manage all your projects</p>
        </div>

        {/* Desktop and Mobile Controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-10 border-border/40"
            />
          </div>
          
          <div className="hidden sm:flex gap-4">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48 border-border/40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Newest First</SelectItem>
                <SelectItem value="budget-desc">Budget (High to Low)</SelectItem>
                <SelectItem value="budget-asc">Budget (Low to High)</SelectItem>
                <SelectItem value="deadline-asc">Deadline (Closest)</SelectItem>
                <SelectItem value="deadline-desc">Deadline (Furthest)</SelectItem>
              </SelectContent>
            </Select>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="border-border/40">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filter Projects</SheetTitle>
                  <SheetDescription>Refine your project search</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Budget Range</label>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="Min" value={localMinBudget} onChange={(e) => setLocalMinBudget(e.target.value)} />
                      <Input type="number" placeholder="Max" value={localMaxBudget} onChange={(e) => setLocalMaxBudget(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Skills Required</label>
                    <div className="flex flex-wrap gap-2">
                      {availableSkills.map(skill => (
                        <Badge 
                          key={skill}
                          variant={selectedSkills.includes(skill) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleSkill(skill)}
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button variant="destructive" onClick={clearFilters} className="w-full">
                    Clear All Filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          
          {/* Mobile Filter & Sort Drawer (Sheet) */}
          <div className="sm:hidden flex gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full border-border/40">
                  <Filter className="h-4 w-4 mr-2" />
                  Sort & Filter
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh]">
                <SheetHeader>
                  <SheetTitle>Sort & Filter</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-6 overflow-y-auto pb-8">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="latest">Newest First</SelectItem>
                        <SelectItem value="budget-desc">Budget (High to Low)</SelectItem>
                        <SelectItem value="budget-asc">Budget (Low to High)</SelectItem>
                        <SelectItem value="deadline-asc">Deadline (Closest)</SelectItem>
                        <SelectItem value="deadline-desc">Deadline (Furthest)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Budget Range</label>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="Min" value={localMinBudget} onChange={(e) => setLocalMinBudget(e.target.value)} />
                      <Input type="number" placeholder="Max" value={localMaxBudget} onChange={(e) => setLocalMaxBudget(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Skills Required</label>
                    <div className="flex flex-wrap gap-2">
                      {availableSkills.map(skill => (
                        <Badge 
                          key={skill}
                          variant={selectedSkills.includes(skill) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleSkill(skill)}
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button variant="destructive" onClick={clearFilters} className="w-full">
                    Clear All Filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Active Filters Display */}
        {(debouncedMinBudget || debouncedMaxBudget || statusFilter !== "all" || selectedSkills.length > 0) && (
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="text-muted-foreground mr-2">Active Filters:</span>
            {statusFilter !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Status: {statusFilter} <X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} />
              </Badge>
            )}
            {(debouncedMinBudget || debouncedMaxBudget) && (
              <Badge variant="secondary" className="gap-1">
                Budget: {debouncedMinBudget || "0"} - {debouncedMaxBudget || "∞"} 
                <X className="h-3 w-3 cursor-pointer" onClick={() => { setLocalMinBudget(""); setLocalMaxBudget(""); }} />
              </Badge>
            )}
            {selectedSkills.map(skill => (
              <Badge key={skill} variant="secondary" className="gap-1">
                {skill} <X className="h-3 w-3 cursor-pointer" onClick={() => toggleSkill(skill)} />
              </Badge>
            ))}
            <Button variant="link" size="sm" onClick={clearFilters} className="text-xs h-auto p-0">
              Clear All
            </Button>
          </div>
        )}

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
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
