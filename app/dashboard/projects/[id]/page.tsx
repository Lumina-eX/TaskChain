"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Download, Loader2, AlertCircle, User, Wallet, Star, ShieldCheck,
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

interface UserInfo {
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  wallet_address: string | null;
  avg_rating?: number;
  total_reviews?: number;
}

interface EscrowInfo {
  escrow_address: string | null;
  escrow_status: string;
  funded_at: string | null;
  funding_tx_hash: string | null;
  total_amount: string;
  funded_amount: number;
  released_amount: number;
  progress_percent: number;
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
  client?: UserInfo | null;
  freelancer?: UserInfo | null;
  escrow?: EscrowInfo | null;
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
  
  // Sort milestones consistently by sort_order then due_date
  const sortedMilestones = [...milestones].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return dateA - dateB;
  });

  const completedMilestones = milestones.filter(
    (m) => m.status === "approved" || m.status === "paid"
  ).length;

  // Compute milestone-based progress per amount (or count as fallback)
  const totalMilestonesAmount = milestones.reduce((sum, m) => sum + parseFloat(m.amount || "0"), 0);
  const completedMilestonesAmount = milestones
    .filter((m) => m.status === "approved" || m.status === "paid")
    .reduce((sum, m) => sum + parseFloat(m.amount || "0"), 0);

  let milestoneProgress = 0;
  if (totalMilestonesAmount > 0) {
    milestoneProgress = Math.round((completedMilestonesAmount / totalMilestonesAmount) * 100);
  } else if (milestones.length > 0) {
    milestoneProgress = Math.round((completedMilestones / milestones.length) * 100);
  }

  // Escrow progress calculation
  const escrow = project.escrow;
  let progressPercent = milestoneProgress;
  let isEscrowBased = false;

  if (escrow && escrow.funded_amount > 0) {
    progressPercent = escrow.progress_percent;
    isEscrowBased = true;
  }

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
          <Card className="p-4 space-y-2 bg-card/50 border-border/40 flex flex-col justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Progress</p>
              <p className="text-2xl font-bold text-secondary">{progressPercent}%</p>
            </div>
            <div className="w-full bg-muted/40 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-secondary h-1.5 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {isEscrowBased ? "Escrow-secured" : "Milestone-weighted"}
            </p>
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

        {/* Escrow Details & Visualization Card */}
        {escrow && (
          <Card className="p-6 bg-card/45 border-border/30 backdrop-blur-md rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                  <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
                  <span>Escrow: <span className="text-foreground capitalize">{escrow.escrow_status.replace('_', ' ')}</span></span>
                </h3>
                {escrow.escrow_address && (
                  <p className="text-xs text-muted-foreground font-mono mt-1 break-all flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                    <span>Address: {escrow.escrow_address}</span>
                  </p>
                )}
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="text-xs text-muted-foreground uppercase tracking-wider block">Escrow Progress</span>
                <span className="text-3xl font-extrabold text-accent">{progressPercent}%</span>
              </div>
            </div>

            {/* Escrow Progress Bar */}
            <div className="space-y-2">
              <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden border border-border/20">
                <div 
                  className="bg-gradient-to-r from-secondary to-accent h-3 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercent}%` }} 
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Funded: {parseFloat(escrow.total_amount).toLocaleString()} {project.currency}</span>
                <span>Released: {escrow.released_amount.toLocaleString()} {project.currency} ({progressPercent}%)</span>
              </div>
            </div>
            
            {escrow.funding_tx_hash && (
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                Funding Tx: <span className="text-foreground">{escrow.funding_tx_hash}</span>
              </p>
            )}
          </Card>
        )}

        {/* Parties (Client & Freelancer) Responsive Card Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Client Card */}
          <Card className="p-5 bg-card/50 border-border/40 backdrop-blur-sm rounded-xl space-y-4 hover:border-border/80 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Client
              </span>
              <Badge variant="outline" className="text-[10px] text-accent border-accent/20 bg-accent/5">Owner</Badge>
            </div>
            
            <div className="flex items-center gap-4">
              {project.client?.avatar_url ? (
                <img 
                  src={project.client.avatar_url} 
                  alt={project.client.display_name || project.client.username} 
                  className="w-12 h-12 rounded-full object-cover border border-border/50"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-border/50 text-primary">
                  <User className="h-6 w-6" />
                </div>
              )}
              
              <div className="min-w-0 flex-1">
                <p className="font-bold text-lg leading-tight truncate">
                  {project.client?.display_name || "Anonymous Client"}
                </p>
                <p className="text-sm text-muted-foreground leading-normal truncate">
                  @{project.client?.username || "unknown"}
                </p>
              </div>
            </div>
            
            {project.client?.wallet_address && (
              <div className="pt-2 border-t border-border/20 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate" title={project.client.wallet_address}>
                  {project.client.wallet_address}
                </span>
              </div>
            )}
          </Card>

          {/* Freelancer Card */}
          <Card className="p-5 bg-card/50 border-border/40 backdrop-blur-sm rounded-xl space-y-4 hover:border-border/80 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-4 w-4 text-primary" />
                Freelancer
              </span>
              {project.freelancer ? (
                <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">Assigned</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/20 bg-yellow-500/5">Hiring</Badge>
              )}
            </div>
            
            {project.freelancer ? (
              <>
                <div className="flex items-center gap-4">
                  {project.freelancer.avatar_url ? (
                    <img 
                      src={project.freelancer.avatar_url} 
                      alt={project.freelancer.display_name || project.freelancer.username} 
                      className="w-12 h-12 rounded-full object-cover border border-border/50"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-border/50 text-primary">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                  
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg leading-tight truncate">
                      {project.freelancer.display_name || "Anonymous Freelancer"}
                    </p>
                    <p className="text-sm text-muted-foreground leading-normal truncate">
                      @{project.freelancer.username}
                    </p>
                  </div>
                </div>

                {/* Ratings & Reviews */}
                {project.freelancer.avg_rating !== undefined && project.freelancer.total_reviews !== undefined && (
                  <div className="flex items-center gap-1 text-sm bg-muted/30 w-fit px-2.5 py-1 rounded-md">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" />
                    <span className="font-semibold text-foreground">{Number(project.freelancer.avg_rating).toFixed(1)}</span>
                    <span className="text-muted-foreground text-xs">({project.freelancer.total_reviews} reviews)</span>
                  </div>
                )}
                
                {project.freelancer.wallet_address && (
                  <div className="pt-2 border-t border-border/20 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate" title={project.freelancer.wallet_address}>
                      {project.freelancer.wallet_address}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <User className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-sm">Hiring in progress</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  No freelancer is currently assigned to this project.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="milestones" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card/50 border-border/40 p-1">
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="milestones" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Project Milestones</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {completedMilestones} of {milestones.length} completed
                  {totalMilestonesAmount > 0 && ` (${milestoneProgress}% by value)`}
                </p>
              </div>
              {project.status === "in_progress" && (
                <Button onClick={() => setShowApprovalDialog(true)} className="group">
                  <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Approve All
                </Button>
              )}
            </div>

            {milestones.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No milestones for this project.
              </p>
            ) : (
              <div className="space-y-3">
                {sortedMilestones.map((m, i) => {
                  const mCfg = milestoneStatusConfig[m.status] ?? milestoneStatusConfig.pending;
                  return (
                    <div
                      key={m.id}
                      className="flex items-start justify-between p-4 rounded-lg border border-border/40 bg-card/50"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{m.title}</p>
                          {m.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{m.description}</p>
                          )}
                          {m.due_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Due {new Date(m.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="font-semibold">
                          ${parseFloat(m.amount).toLocaleString()} {m.currency}
                        </p>
                        <p className={`text-xs mt-1 ${mCfg.color}`}>{mCfg.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
