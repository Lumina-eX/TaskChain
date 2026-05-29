"use client";

import { useEffect, useState } from "react";
import { ProjectCard, type Project } from "@/components/dashboard/project-card";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Map DB status → UI status
function mapStatus(dbStatus: string): Project["status"] {
  const map: Record<string, Project["status"]> = {
    draft: "pending",
    open: "pending",
    in_progress: "in-progress",
    completed: "completed",
    cancelled: "completed",
    disputed: "in-progress",
  };
  return map[dbStatus] ?? "pending";
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();

      const mapped: Project[] = (data.projects ?? []).map((p: {
        id: string;
        title: string;
        description: string;
        status: string;
        budget_max: string | null;
        deadline: string | null;
        milestones_count: number;
        completed_milestones: number;
      }) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? "",
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
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const activeCount = projects.filter((p) => p.status === "in-progress").length;
  const pendingApprovalCount = projects.filter(
    (p) => p.status === "pending-approval"
  ).length;
  const totalEscrow = projects.reduce((sum, p) => sum + p.budget, 0);

  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground mt-2">
              Manage your projects and milestones
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="group"
            size="lg"
          >
            <Plus className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
            New Project
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Active Projects</p>
            <p className="text-3xl font-bold">{activeCount}</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Pending Approval</p>
            <p className="text-3xl font-bold text-secondary">{pendingApprovalCount}</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Total Escrow</p>
            <p className="text-3xl font-bold text-accent">
              ${totalEscrow.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-muted-foreground">No projects yet.</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) fetchProjects(); // refresh list after creating
        }}
      />
    </div>
  );
}
