"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle, Clock, ChevronRight } from "lucide-react";
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
  completedMilestones: number;
  deadline: string;
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
      <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-all duration-300">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 gap-y-1 flex-wrap">
                <h3 className="text-xl font-semibold">{project.title}</h3>
                <Badge
                  className={`${config.color} ${config.textColor} border-0`}
                >
                  {config.text}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.description}
              </p>
            </div>
            <Link href={`/dashboard/projects/${project.id}`}>
              <Button
                variant="ghost"
                size="icon"
                className="group-hover:scale-110 transition-transform"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Progress and Stats */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Budget</p>
                <p className="font-semibold text-sm">
                  ${project.budget.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Milestones</p>
                <p className="font-semibold text-sm">
                  {project.completedMilestones}/{project.milestonesCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Deadline</p>
                <div className="flex items-center gap-1">
                  <Clock
                    className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-primary"}`}
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

          {/* Actions */}
          <div className="flex gap-2 pt-2">
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

      {/* Dialogs */}
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
