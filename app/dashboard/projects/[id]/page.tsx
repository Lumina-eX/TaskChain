"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { MilestonesList } from "@/components/dashboard/milestones-list";
import { ApprovalDialog } from "@/components/dashboard/approval-dialog";
import { TimelineActivity } from "@/components/dashboard/timeline-activity";

interface ProjectDetail {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "pending-approval" | "completed";
  budget: number;
  progress: number;
  milestonesCount: number;
  completedMilestones: number;
  deadline: string;
  freelancer: {
    name: string;
    avatar: string;
    rating: number;
    reviews: number;
  };
  escrowAmount: number;
  releaseAmount: number;
  files: Array<{
    name: string;
    size: string;
    uploadedDate: string;
  }>;
}

// Mock project detail data
const mockProjectDetail: ProjectDetail = {
  id: "1",
  title: "Website Redesign",
  description: "Complete redesign of company website with modern UI/UX",
  status: "in-progress",
  budget: 5000,
  progress: 65,
  milestonesCount: 4,
  completedMilestones: 2,
  deadline: "2024-03-15",
  freelancer: {
    name: "Alex Johnson",
    avatar: "",
    rating: 4.8,
    reviews: 42,
  },
  escrowAmount: 5000,
  releaseAmount: 2500,
  files: [
    {
      name: "Website_Mockups_v2.xd",
      size: "45 MB",
      uploadedDate: "2024-02-20",
    },
    {
      name: "Design_Specifications.pdf",
      size: "2.3 MB",
      uploadedDate: "2024-02-18",
    },
    {
      name: "Component_Library.figma",
      size: "52 MB",
      uploadedDate: "2024-02-15",
    },
  ],
};

export default function ProjectDetailPage() {
  const params = useParams();
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const project = mockProjectDetail;
  const [now] = useState(() => Date.now());
  const daysLeft = Math.ceil(
    (new Date(project.deadline).getTime() - now) / (1000 * 60 * 60 * 24),
  );
  const isOverdue = daysLeft < 0;

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
              <p className="text-muted-foreground mt-2">
                {project.description}
              </p>
            </div>
          </div>
          <Badge className="bg-secondary/20 text-secondary border-0">
            {project.status.replace("-", " ")}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Budget
            </p>
            <p className="text-2xl font-bold">
              ${project.budget.toLocaleString()}
            </p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Progress
            </p>
            <p className="text-2xl font-bold text-secondary">
              {project.progress}%
            </p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              In Escrow
            </p>
            <p className="text-2xl font-bold text-primary">
              ${project.escrowAmount.toLocaleString()}
            </p>
          </Card>
          <Card className="p-4 space-y-2 bg-card/50 border-border/40">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Deadline
            </p>
            <p
              className={`text-2xl font-bold ${isOverdue ? "text-destructive" : "text-accent"}`}
            >
              {isOverdue ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
            </p>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="milestones" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card/50 border-border/40 p-1">
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="files">Files & Deliverables</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="milestones" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Project Milestones</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {project.completedMilestones} of {project.milestonesCount}{" "}
                  completed
                </p>
              </div>
              {project.status === "pending-approval" && (
                <Button
                  onClick={() => setShowApprovalDialog(true)}
                  className="group"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Approve All
                </Button>
              )}
            </div>
            <MilestonesList projectId={project.id} />
          </TabsContent>

          <TabsContent value="files" className="space-y-4 mt-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
              <div className="space-y-3">
                {project.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-lg border border-border/40 bg-card/50 hover:bg-card/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-primary">
                          {file.name.split(".").pop()?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.size} •{" "}
                          {new Date(file.uploadedDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon">
                      <Download className="h-5 w-5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 mt-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
              <TimelineActivity />
            </div>
          </TabsContent>
        </Tabs>

        {/* Freelancer Info */}
        <Card className="p-6 bg-card/50 border-border/40 space-y-4">
          <h3 className="text-lg font-semibold">Freelancer</h3>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-accent" />
              <div>
                <p className="font-semibold text-lg">
                  {project.freelancer.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-amber-500">
                    ★ {project.freelancer.rating}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({project.freelancer.reviews} reviews)
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline">View Profile</Button>
          </div>
        </Card>
      </div>

      {/* Approval Dialog */}
      <ApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        projectTitle={project.title}
        amount={project.escrowAmount}
      />
    </div>
  );
}
