"use client";

import React, { useState, useTransition } from "react";
import {
  Clock,
  Play,
  FileUp,
  CheckCircle2,
  Award,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Lock,
  ChevronRight,
  ListFilter,
  Layers,
  LayoutGrid,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Loader2,
  Eye,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Milestone and overall types
export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  amount: string | number;
  currency: string;
  due_date: string | null;
  status: "pending" | "in_progress" | "submitted" | "approved" | "rejected" | "paid" | string;
  sort_order?: number;
  deliverables?: string[] | null | any; // Could be a JSON string or string array
  submitted_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
}

export type UserRole = "client" | "freelancer" | "admin";

interface MilestoneProgressTrackerProps {
  milestones: Milestone[];
  onStatusUpdate?: (milestoneId: string, newStatus: string, deliverablesData?: any) => Promise<void>;
  userRole?: UserRole;
  contractAddress?: string;
  isLoading?: boolean;
}

// Configs for milestone states
export const STATE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
    description: string;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-muted-foreground",
    bgColor: "bg-muted/10",
    borderColor: "border-muted-foreground/20",
    glowColor: "shadow-none",
    description: "Milestone created. Freelancer has not started work yet.",
  },
  in_progress: {
    label: "In Progress",
    icon: Play,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/30",
    glowColor: "shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]",
    description: "Freelancer is actively working on deliverables.",
  },
  submitted: {
    label: "Submitted",
    icon: FileUp,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    glowColor: "shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]",
    description: "Work completed & deliverables submitted. Awaiting client approval.",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    glowColor: "shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]",
    description: "Deliverables approved by client. Payment authorized for release.",
  },
  paid: {
    label: "Paid",
    icon: Award,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    glowColor: "shadow-[0_0_15px_-3px_rgba(139,92,246,0.2)]",
    description: "Funds released from escrow. Payout completed on-chain.",
  },
  rejected: {
    label: "Revision Requested",
    icon: AlertTriangle,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    glowColor: "shadow-[0_0_15px_-3px_rgba(244,63,94,0.2)]",
    description: "Client requested revisions on submitted deliverables.",
  },
};

const PIPELINE_ORDER = ["pending", "in_progress", "submitted", "approved", "paid"];

export function MilestoneProgressTracker({
  milestones: initialMilestones,
  onStatusUpdate,
  userRole = "client",
  contractAddress,
  isLoading = false,
}: MilestoneProgressTrackerProps) {
  // Allow local state for instant updates or simulator fallback
  const [milestonesList, setMilestonesList] = useState<Milestone[]>(initialMilestones);
  const [viewMode, setViewMode] = useState<"stepper" | "list" | "board">("list");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    initialMilestones[0]?.id || null
  );
  const [isPending, startTransition] = useTransition();
  const [simulationMode, setSimulationMode] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(userRole);

  // Sync state if initialMilestones change
  React.useEffect(() => {
    setMilestonesList(initialMilestones);
    if (!selectedMilestoneId && initialMilestones.length > 0) {
      setSelectedMilestoneId(initialMilestones[0].id);
    }
  }, [initialMilestones]);

  // Calculate dynamic stats
  const totalCount = milestonesList.length;
  const parsedAmounts = milestonesList.map((m) => parseFloat(String(m.amount)) || 0);
  const totalBudget = parsedAmounts.reduce((a, b) => a + b, 0);

  const completedCount = milestonesList.filter((m) => m.status === "approved" || m.status === "paid").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const paidAmount = milestonesList
    .filter((m) => m.status === "paid")
    .reduce((sum, m) => sum + (parseFloat(String(m.amount)) || 0), 0);

  const escrowLockedAmount = milestonesList
    .filter((m) => ["pending", "in_progress", "submitted", "approved", "rejected"].includes(m.status))
    .reduce((sum, m) => sum + (parseFloat(String(m.amount)) || 0), 0);

  const activeMilestone = milestonesList.find((m) => m.id === selectedMilestoneId) || milestonesList[0];

  // Handles updating the state of a milestone
  const handleTransition = async (milestoneId: string, targetStatus: string) => {
    // If not in simulation and props provided, use parent callback
    if (onStatusUpdate && !simulationMode) {
      await onStatusUpdate(milestoneId, targetStatus);
    } else {
      // Local updates for simulations
      setMilestonesList((prev) =>
        prev.map((m) => {
          if (m.id === milestoneId) {
            const nowStr = new Date().toISOString();
            return {
              ...m,
              status: targetStatus,
              submitted_at: targetStatus === "submitted" ? nowStr : m.submitted_at,
              approved_at: targetStatus === "approved" ? nowStr : m.approved_at,
              paid_at: targetStatus === "paid" ? nowStr : m.paid_at,
            };
          }
          return m;
        })
      );
    }
  };

  // Helper to parse deliverables
  const getDeliverablesList = (m: Milestone): string[] => {
    if (!m.deliverables) return [];
    if (Array.isArray(m.deliverables)) return m.deliverables;
    try {
      if (typeof m.deliverables === "string") {
        const parsed = JSON.parse(m.deliverables);
        return Array.isArray(parsed) ? parsed : [m.deliverables];
      }
    } catch {
      // fallback
    }
    return [String(m.deliverables)];
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-xl bg-muted/40 border border-border/20" />
        <div className="h-10 w-48 rounded bg-muted/40" />
        <div className="space-y-3">
          <div className="h-20 rounded-lg bg-muted/30 border border-border/10" />
          <div className="h-20 rounded-lg bg-muted/30 border border-border/10" />
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <Card className="p-8 text-center bg-card/30 border border-border/40 backdrop-blur-sm">
        <Clock className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
        <h3 className="text-lg font-semibold">No Milestones Listed</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          This contract does not have any milestones defined yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Overview Dashboard card */}
      <Card className="p-6 bg-card/30 backdrop-blur-md border border-border/30 rounded-2xl relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-transparent pointer-events-none" />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          {/* Progress chart representation */}
          <div className="space-y-3 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-border/40 pb-6 lg:pb-0 lg:pr-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-foreground">Project Progress</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Escrow-backed milestones</p>
              </div>
              <span className="text-3xl font-extrabold text-primary select-none">
                {progressPercent}%
              </span>
            </div>
            
            <div className="space-y-1.5">
              <Progress value={progressPercent} className="h-3 bg-muted/50 rounded-full" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{completedCount} of {totalCount} Completed</span>
                <span>Remaining: {totalCount - completedCount}</span>
              </div>
            </div>
          </div>

          {/* Money status details */}
          <div className="grid grid-cols-3 gap-4 col-span-1 lg:col-span-2 items-center">
            {/* Total Budget */}
            <div className="space-y-1 p-3 rounded-xl bg-muted/10 border border-border/10 hover:bg-muted/20 transition-all">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider font-semibold">Total Budget</span>
              </div>
              <p className="text-lg md:text-xl font-bold text-foreground truncate">
                ${totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Escrow Locked */}
            <div className="space-y-1 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Lock className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider font-semibold">In Escrow</span>
              </div>
              <p className="text-lg md:text-xl font-bold text-amber-300 truncate">
                ${escrowLockedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Paid / Released */}
            <div className="space-y-1 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-all">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Award className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider font-semibold">Paid Out</span>
              </div>
              <p className="text-lg md:text-xl font-bold text-emerald-300 truncate">
                ${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* View Controllers and Demo Panel toggles */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Toggle Mode buttons */}
        <div className="inline-flex p-1 rounded-lg bg-muted/40 border border-border/40 self-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("list")}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-semibold gap-1.5 transition-all",
              viewMode === "list" ? "bg-background text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="h-3.5 w-3.5" />
            Detailed Cards
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("stepper")}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-semibold gap-1.5 transition-all",
              viewMode === "stepper" ? "bg-background text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Pipeline Stepper
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("board")}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-semibold gap-1.5 transition-all",
              viewMode === "board" ? "bg-background text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban Board
          </Button>
        </div>

        {/* Demo settings toggles */}
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSimulationMode(!simulationMode)}
            className={cn(
              "text-xs gap-1.5 h-8 border-border/40 transition-all",
              simulationMode
                ? "bg-primary/20 border-primary text-primary hover:bg-primary/30"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings className={cn("h-3.5 w-3.5", simulationMode && "animate-spin")} />
            {simulationMode ? "Interactive Sim Active" : "Enable Sandbox"}
          </Button>

          {simulationMode && (
            <div className="inline-flex p-0.5 rounded-lg bg-muted/40 border border-border/40 h-8 items-center text-xs">
              <span className="px-2 text-muted-foreground select-none">Role:</span>
              {(["client", "freelancer"] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setCurrentUserRole(r)}
                  className={cn(
                    "px-2 py-1 rounded-md capitalize font-semibold transition-all h-6 flex items-center",
                    currentUserRole === r
                      ? "bg-background text-foreground shadow-sm font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. RENDERING VIEWS */}

      {/* VIEW A: DETAILED CARDS LIST VIEW */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {milestonesList.map((m, index) => {
            const config = STATE_CONFIG[m.status] || STATE_CONFIG.pending;
            const Icon = config.icon;
            const deliverables = getDeliverablesList(m);
            const formattedAmount = parseFloat(String(m.amount)).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            });

            return (
              <Card
                key={m.id}
                className={cn(
                  "p-5 bg-card/20 border-border/40 backdrop-blur-sm rounded-xl transition-all duration-300 hover:border-primary/40",
                  config.glowColor,
                  selectedMilestoneId === m.id && "ring-1 ring-primary/40 bg-card/30"
                )}
                onClick={() => setSelectedMilestoneId(m.id)}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left Side: Detail & Text */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center border shrink-0 mt-0.5 shadow-inner transition-transform duration-300 group-hover:scale-105",
                        config.color,
                        config.bgColor,
                        config.borderColor
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full">
                          #{index + 1}
                        </span>
                        <h4 className="font-bold text-base text-foreground leading-tight truncate">
                          {m.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] uppercase font-bold py-0.5 px-2.5 border shrink-0", config.color, config.bgColor, config.borderColor)}
                        >
                          {config.label}
                        </Badge>
                      </div>

                      {m.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 md:line-clamp-none font-medium leading-relaxed">
                          {m.description}
                        </p>
                      )}

                      {/* Deliverables summary */}
                      {deliverables.length > 0 && (
                        <div className="pt-2 pl-1">
                          <p className="text-xs text-muted-foreground/80 font-bold mb-1.5 flex items-center gap-1.5">
                            <CheckSquare className="h-3.5 w-3.5 text-primary/80" />
                            Deliverables Checklist:
                          </p>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            {deliverables.map((item, idx) => (
                              <li
                                key={idx}
                                className="text-xs text-muted-foreground flex items-center gap-2"
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", ["approved", "paid"].includes(m.status) ? "bg-emerald-400" : "bg-primary/50")} />
                                <span className="truncate">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Mini linear timeline tracker inside card */}
                      <div className="pt-4 pb-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5 font-bold uppercase tracking-wider">
                          <span>Progress Pipeline</span>
                          <span className={config.color}>{config.label}</span>
                        </div>
                        <div className="flex items-center gap-1 w-full bg-muted/10 p-1 rounded-full border border-border/20">
                          {PIPELINE_ORDER.map((stageName, sIdx) => {
                            const stageIndex = PIPELINE_ORDER.indexOf(stageName);
                            const activeStageIndex = PIPELINE_ORDER.indexOf(m.status === "rejected" ? "in_progress" : m.status);
                            
                            const isPast = stageIndex < activeStageIndex;
                            const isCurrent = m.status === stageName;
                            
                            return (
                              <div
                                key={stageName}
                                className={cn(
                                  "h-1.5 flex-1 rounded-full transition-all duration-500",
                                  isPast && "bg-emerald-500",
                                  isCurrent && (m.status === "rejected" ? "bg-rose-500" : "bg-primary"),
                                  !isPast && !isCurrent && "bg-muted-foreground/10"
                                )}
                                title={STATE_CONFIG[stageName]?.label}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Financials & Action Buttons */}
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 md:gap-3 pl-12 md:pl-0 pt-3 md:pt-0 border-t md:border-t-0 border-border/20 md:text-right shrink-0">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Amount</p>
                      <p className="text-lg font-black text-foreground">
                        ${formattedAmount} <span className="text-xs font-semibold text-primary">{m.currency}</span>
                      </p>
                      {m.due_date && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center md:justify-end gap-1 font-semibold">
                          <Calendar className="h-3 w-3" />
                          Due {new Date(m.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Action buttons inside Card */}
                    <div className="w-full md:w-auto">
                      <ActionButtons
                        milestone={m}
                        role={simulationMode ? currentUserRole : userRole}
                        onTransition={handleTransition}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* VIEW B: PIPELINE STEPPER VIEW */}
      {viewMode === "stepper" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stepper Side Navigation */}
          <Card className="lg:col-span-1 p-4 bg-card/20 border-border/40 backdrop-blur-sm rounded-xl space-y-2 max-h-[500px] overflow-y-auto">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
              Milestone Sequence
            </h4>
            {milestonesList.map((m, index) => {
              const config = STATE_CONFIG[m.status] || STATE_CONFIG.pending;
              const Icon = config.icon;
              const isSelected = selectedMilestoneId === m.id;

              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMilestoneId(m.id)}
                  className={cn(
                    "w-full p-3 rounded-lg flex items-center justify-between border text-left transition-all duration-200 hover:bg-muted/10",
                    isSelected
                      ? "bg-primary/10 border-primary/50 text-foreground font-bold shadow-[0_0_10px_-3px_rgba(99,102,241,0.15)]"
                      : "bg-transparent border-transparent text-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border text-xs font-black",
                        isSelected
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-muted/20 border-border/40 text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        ${parseFloat(String(m.amount)).toLocaleString()} {m.currency}
                      </p>
                    </div>
                  </div>

                  <div className={cn("p-1.5 rounded-full shrink-0 border", config.bgColor, config.borderColor, config.color)}>
                    <Icon className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </Card>

          {/* Stepper Detail View Panel */}
          {activeMilestone && (
            <Card className="lg:col-span-2 p-6 bg-card/30 border-border/30 backdrop-blur-md rounded-xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <TrendingUp className="h-32 w-32" />
              </div>

              {/* Title & Status Block */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/30 pb-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">
                    Active Milestone Details
                  </span>
                  <h3 className="text-2xl font-black text-foreground leading-tight">
                    {activeMilestone.title}
                  </h3>
                  {activeMilestone.due_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                      <Calendar className="h-3.5 w-3.5" />
                      Due on {new Date(activeMilestone.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <p className="text-2xl font-black text-foreground">
                    ${parseFloat(String(activeMilestone.amount)).toLocaleString()}{" "}
                    <span className="text-sm font-bold text-primary">{activeMilestone.currency}</span>
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs uppercase font-extrabold py-0.5 px-3 border mt-1.5",
                      STATE_CONFIG[activeMilestone.status]?.color || "text-muted-foreground",
                      STATE_CONFIG[activeMilestone.status]?.bgColor || "bg-muted/10",
                      STATE_CONFIG[activeMilestone.status]?.borderColor || "border-border/40"
                    )}
                  >
                    {STATE_CONFIG[activeMilestone.status]?.label || activeMilestone.status}
                  </Badge>
                </div>
              </div>

              {/* Massive Horizontal/Vertical visual Stepper for lifecycle stages */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Milestone Lifecycle Steps
                </h4>

                <ol className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-2 bg-muted/5 p-4 rounded-xl border border-border/40">
                  {PIPELINE_ORDER.map((stageName, index) => {
                    const stageConfig = STATE_CONFIG[stageName];
                    const StageIcon = stageConfig.icon;

                    const activeIndex = PIPELINE_ORDER.indexOf(
                      activeMilestone.status === "rejected" ? "in_progress" : activeMilestone.status
                    );
                    const isComplete = index < activeIndex;
                    const isCurrent = activeMilestone.status === stageName;
                    const isPending = index > activeIndex;

                    // Fetch timestamps
                    let timestamp: string | null = null;
                    if (stageName === "submitted") timestamp = activeMilestone.submitted_at;
                    if (stageName === "approved") timestamp = activeMilestone.approved_at;
                    if (stageName === "paid") timestamp = activeMilestone.paid_at;

                    return (
                      <li
                        key={stageName}
                        className="flex flex-1 items-center gap-3 md:flex-col md:items-center md:gap-2"
                      >
                        <div className="flex w-full items-center gap-3 md:flex-col md:gap-2">
                          <div
                            className={cn(
                              "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-300",
                              isComplete && "border-emerald-500 bg-emerald-500/20 text-emerald-400",
                              isCurrent &&
                                (activeMilestone.status === "rejected"
                                  ? "border-rose-500 bg-rose-500/20 text-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]"
                                  : "border-primary bg-primary/20 text-primary shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"),
                              isPending && "border-muted-foreground/30 bg-muted/10 text-muted-foreground"
                            )}
                          >
                            <StageIcon className="h-4.5 w-4.5" />
                          </div>

                          {index < PIPELINE_ORDER.length - 1 && (
                            <div
                              className={cn(
                                "h-0.5 flex-1 rounded-full md:h-0.5 md:w-full",
                                isComplete ? "bg-emerald-500" : "bg-border/40"
                              )}
                            />
                          )}
                        </div>

                        <div className="min-w-0 md:text-center">
                          <p
                            className={cn(
                              "text-xs font-bold uppercase tracking-wider",
                              isCurrent && "text-foreground",
                              isComplete && "text-emerald-400",
                              isPending && "text-muted-foreground/60"
                            )}
                          >
                            {stageConfig.label}
                          </p>
                          {timestamp && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium leading-tight">
                              {new Date(timestamp).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Description & Deliverables block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-primary/80" />
                    Milestone Details
                  </h4>
                  <div className="p-3.5 rounded-lg bg-muted/10 border border-border/20 min-h-[100px]">
                    <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                      {activeMilestone.description || "No description provided for this milestone."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <CheckSquare className="h-3.5 w-3.5 text-primary/80" />
                    Expected Deliverables
                  </h4>
                  <div className="p-3.5 rounded-lg bg-muted/10 border border-border/20 min-h-[100px] space-y-2">
                    {getDeliverablesList(activeMilestone).length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 italic p-2">
                        No custom deliverables checklist defined.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {getDeliverablesList(activeMilestone).map((deliv, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-muted-foreground/90 font-medium flex items-center gap-2.5"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span>{deliv}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons panel */}
              <div className="pt-4 border-t border-border/30 flex justify-end">
                <ActionButtons
                  milestone={activeMilestone}
                  role={simulationMode ? currentUserRole : userRole}
                  onTransition={handleTransition}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* VIEW C: KANBAN BOARD VIEW */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {PIPELINE_ORDER.map((stageKey) => {
            const stageConfig = STATE_CONFIG[stageKey];
            const ColumnIcon = stageConfig.icon;
            
            const columnMilestones = milestonesList.filter((m) => {
              if (stageKey === "in_progress") {
                return m.status === "in_progress" || m.status === "rejected";
              }
              return m.status === stageKey;
            });

            return (
              <div
                key={stageKey}
                className="flex flex-col rounded-xl border border-border/40 bg-card/10 p-3 space-y-3 min-h-[300px] max-h-[600px] overflow-y-auto"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-border/20 pb-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("p-1 rounded border", stageConfig.bgColor, stageConfig.borderColor, stageConfig.color)}>
                      <ColumnIcon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-foreground truncate uppercase tracking-wider">
                      {stageConfig.label}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] py-0 px-2 font-bold shrink-0">
                    {columnMilestones.length}
                  </Badge>
                </div>

                {/* Column Content */}
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {columnMilestones.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground/40 text-xs italic border border-dashed border-border/20 rounded-lg">
                      Empty
                    </div>
                  ) : (
                    columnMilestones.map((m) => {
                      const formattedAmount = parseFloat(String(m.amount)).toLocaleString();
                      const isRejected = m.status === "rejected";

                      return (
                        <Card
                          key={m.id}
                          className={cn(
                            "p-3.5 bg-card/40 border-border/40 hover:border-primary/40 transition-all rounded-lg select-none cursor-pointer space-y-2.5",
                            isRejected && "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50"
                          )}
                          onClick={() => setSelectedMilestoneId(m.id)}
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-1">
                              <h5 className="font-bold text-xs text-foreground line-clamp-2 leading-tight">
                                {m.title}
                              </h5>
                              {isRejected && (
                                <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 px-1 border border-rose-500 text-rose-400 shrink-0">
                                  Revision
                                </Badge>
                              )}
                            </div>
                            {m.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {m.description}
                              </p>
                            )}
                          </div>

                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-extrabold text-foreground">
                              ${formattedAmount}
                            </span>
                            {m.due_date && (
                              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(m.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {/* Quick-action trigger within Kanban card */}
                          <div className="pt-1.5 border-t border-border/10 flex justify-end">
                            <ActionButtons
                              milestone={m}
                              role={simulationMode ? currentUserRole : userRole}
                              onTransition={handleTransition}
                              compact
                            />
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ACTION BUTTONS SUB-COMPONENT
interface ActionButtonsProps {
  milestone: Milestone;
  role: UserRole;
  onTransition: (milestoneId: string, targetStatus: string) => Promise<void>;
  compact?: boolean;
}

function ActionButtons({ milestone, role, onTransition, compact = false }: ActionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const triggerTransition = async (target: string) => {
    setLoading(true);
    try {
      await onTransition(milestone.id, target);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const btnSize = compact ? "xs" : "sm";
  const btnClass = compact ? "h-6 text-[10px] px-2 py-0.5" : "h-9 text-xs px-3 font-semibold";

  if (loading) {
    return (
      <Button disabled variant="outline" size={btnSize} className={cn("gap-1.5", btnClass)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing...
      </Button>
    );
  }

  // --- FREELANCER ACTIONS ---
  if (role === "freelancer") {
    // 1. Pending -> Start Work
    if (milestone.status === "pending") {
      return (
        <Button onClick={() => triggerTransition("in_progress")} size={btnSize} className={cn("bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5", btnClass)}>
          <Play className="h-3.5 w-3.5 fill-current" />
          Start Milestone
        </Button>
      );
    }

    // 2. In Progress / Rejected -> Submit Deliverables
    if (milestone.status === "in_progress" || milestone.status === "rejected") {
      return (
        <Button onClick={() => triggerTransition("submitted")} size={btnSize} className={cn("bg-amber-600 hover:bg-amber-700 text-white gap-1.5", btnClass)}>
          <FileUp className="h-3.5 w-3.5" />
          Submit Deliverables
        </Button>
      );
    }
  }

  // --- CLIENT ACTIONS ---
  if (role === "client") {
    // 1. Submitted -> Review & Approve (or Request revision)
    if (milestone.status === "submitted") {
      return (
        <div className="flex gap-1.5 justify-end">
          {!compact && (
            <Button
              onClick={() => triggerTransition("rejected")}
              variant="outline"
              size={btnSize}
              className={cn("border-rose-500/30 hover:border-rose-500 hover:bg-rose-500/10 text-rose-400 gap-1.5", btnClass)}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Reject / Revise
            </Button>
          )}
          <Button onClick={() => triggerTransition("approved")} size={btnSize} className={cn("bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5", btnClass)}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve Work
          </Button>
        </div>
      );
    }

    // 2. Approved -> Release Escrow Payment
    if (milestone.status === "approved") {
      return (
        <Button onClick={() => triggerTransition("paid")} size={btnSize} className={cn("bg-violet-600 hover:bg-violet-700 text-white gap-1.5", btnClass)}>
          <Award className="h-3.5 w-3.5" />
          Release Escrow Payout
        </Button>
      );
    }
  }

  // Admin view or completed/already paid state
  if (milestone.status === "paid") {
    return (
      <Badge variant="outline" className={cn("border-violet-500/20 bg-violet-500/10 text-violet-400 select-none text-[10px] font-extrabold uppercase py-0.5", compact ? "px-1 text-[9px]" : "px-2.5 py-1")}>
        Completed & Paid
      </Badge>
    );
  }

  return null;
}
