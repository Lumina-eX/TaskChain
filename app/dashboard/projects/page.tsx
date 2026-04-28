"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Filter, ChevronRight, Loader2 } from "lucide-react";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [now] = useState(() => Date.now());

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
        }));
        setProjects(mapped);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === "all" || p.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    [projects, searchTerm, statusFilter]
  );

  return (
    <div className="p-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">All Projects</h1>
          <p className="text-muted-foreground mt-2">View and manage all your projects</p>
        </div>

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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 border-border/40">
              <Filter className="h-4 w-4 mr-2" />
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
              <Button variant="outline" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
