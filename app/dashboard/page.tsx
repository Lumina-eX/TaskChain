"use client";

import { useState } from "react";
import { Project, ProjectCard } from "@/components/dashboard/project-card";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// Mock data - replace with real data from API
const mockProjects: Project[] = [
  {
    id: "1",
    title: "Website Redesign",
    description: "Complete redesign of company website",
    status: "in-progress",
    budget: 5000,
    progress: 65,
    milestonesCount: 4,
    completedMilestones: 2,
    deadline: "2024-03-15",
  },
  {
    id: "2",
    title: "Mobile App Development",
    description: "iOS and Android app development",
    status: "pending-approval",
    budget: 15000,
    progress: 100,
    milestonesCount: 5,
    completedMilestones: 5,
    deadline: "2024-03-30",
  },
  {
    id: "3",
    title: "Logo Design",
    description: "Brand identity and logo design",
    status: "pending",
    budget: 2000,
    progress: 0,
    milestonesCount: 2,
    completedMilestones: 0,
    deadline: "2024-02-28",
  },
];

export default function DashboardPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
            <p className="text-sm text-muted-foreground mb-2">
              Active Projects
            </p>
            <p className="text-3xl font-bold">3</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">
              Pending Approval
            </p>
            <p className="text-3xl font-bold text-secondary">1</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Total Escrow</p>
            <p className="text-3xl font-bold text-accent">$22,000</p>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid gap-6">
          {mockProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}
