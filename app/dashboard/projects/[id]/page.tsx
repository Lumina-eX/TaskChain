"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Download, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ApprovalDialog } from "@/components/dashboard/approval-dialog";
import { TimelineActivity } from "@/components/dashboard/timeline-activity";
import {
  EscrowStatusTracker,
  type EscrowStage,
} from "@/components/dashboard/escrow-status-tracker";
import { MilestoneProgressTracker } from "@/components/dashboard/milestone-progress-tracker";

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  due_date: string | null;
  status: string;
  sort_order: number;
}

interface ProjectDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  budget_max: string | null;
  currency: string;
  deadline: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; textColor: string }> = {
  draft:    { label: "Draft",           color: "bg-muted",          textColor: "text-muted-foreground" },
  open:     { label: "Open",            color: "bg-secondary/20",   textColor: "text-secondary" },
  in_progress: { label: "In Progress",  color: "bg-secondary/20",   textColor: "text-secondary" },
  completed:   { label: "Completed",    color: "bg-accent/20",      textColor: "text-accent" },
  cancelled:   { label: "Cancelled",    color: "bg-muted",          textColor: "text-muted-foreground" },
  disputed:    { label: "Disputed",     color: "bg-destructive/20", textColor: "text-destructive" },
};

const milestoneStatusConfig: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "text-muted-foreground" },
  in_progress: { label: "In Progress", color: "text-secondary" },
  submitted:   { label: "Submitted",   color: "text-amber-500" },
  approved:    { label: "Approved",    color: "text-accent" },
  rejected:    { label: "Rejected",    color: "text-destructive" },
  paid:        { label: "Paid",        color: "text-primary" },
};

const escrowStageMap: Record<string, EscrowStage> = {
  draft: "Funded", open: "Funded", in_progress: "In Progress",
  completed: "Released", disputed: "In Progress",
};

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [now] = useState(() => Date.now());

  const handleMilestoneStatusUpdate = async (milestoneId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update milestone status");
      }
      
      // Update local state dynamically
      setMilestones((prev) =>
        prev.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                status: newStatus,
              }
            : m
        )
      );

      // Trigger standard API re-fetch for absolute sync
      const resProj = await fetch(`/api/projects/${id}`, {
        headers: getAuthHeaders(),
      });
      if (resProj.ok) {
        const data = await resProj.json();
        setProject(data.project);
        setMilestones(data.milestones ?? []);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to update milestone status. Make sure you are authorized.");
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (!res.ok) {
          setError("Project not found or you don't have access.");
          return;
        }
        const data = await res.json();
        setProject(data.project);
        setMilestones(data.milestones ?? []);
      } catch {
        setError("Failed to load project.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading project…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error ?? "Project not found."}</p>
        <Link href="/dashboard/projects">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  const budget = parseFloat(project.budget_max ?? "0");
  const completedMilestones = milestones.filter(
    (m) => m.status === "approved" || m.status === "paid"
  ).length;
  const progress =
    milestones.length > 0
      ? Math.round((completedMilestones / milestones.length) * 100)
      : 0;
  const daysLeft = project.deadline
    ? Math.ceil((new Date(project.deadline).getTime() - now) / (1000 * 60 * 60 * 24))
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const statusCfg = statusConfig[project.status] ?? statusConfig.draft;
  const escrowStage = escrowStageMap[project.status] ?? "Funded";

  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <Link href="/dashboard/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{project.title}</h1>
              <p className="text-muted-foreground mt-2">{project.description}</p>
            </div>
          </div>
          <Badge className={`${statusCfg.color} ${statusCfg.textColor} border-0`}>
            {statusCfg.label}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Budget</p>
            <p className="text-2xl font-bold">
              {budget > 0 ? `$${budget.toLocaleString()}` : "—"}
            </p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Progress</p>
            <p className="text-2xl font-bold text-secondary">{progress}%</p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Milestones</p>
            <p className="text-2xl font-bold text-primary">
              {completedMilestones}/{milestones.length}
            </p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Deadline</p>
            <p className={`text-2xl font-bold ${isOverdue ? "text-destructive" : "text-accent"}`}>
              {daysLeft === null
                ? "—"
                : isOverdue
                ? `${Math.abs(daysLeft)}d ago`
                : `${daysLeft}d left`}
            </p>
          </Card>
        </div>

        <EscrowStatusTracker currentStage={escrowStage} />

        {/* Tabs */}
        <Tabs defaultValue="milestones" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card/50 border-border/40 p-1">
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="milestones" className="space-y-4 mt-6">
            <MilestoneProgressTracker
              milestones={milestones}
              onStatusUpdate={handleMilestoneStatusUpdate}
              userRole="client"
              contractAddress={project.contract_address || undefined}
            />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 mt-6">
            <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
            <TimelineActivity />
          </TabsContent>
        </Tabs>
      </div>

      <ApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        projectTitle={project.title}
        amount={budget}
      />
    </div>
  );
}
