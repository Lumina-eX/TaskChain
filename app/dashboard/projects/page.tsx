"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Filter, ChevronRight } from "lucide-react";
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

const mockProjects: Project[] = [
  {
    id: "1",
    title: "Website Redesign",
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
    status: "pending",
    budget: 2000,
    progress: 0,
    milestonesCount: 2,
    completedMilestones: 0,
    deadline: "2024-02-28",
  },
  {
    id: "4",
    title: "Content Writing",
    status: "completed",
    budget: 3000,
    progress: 100,
    milestonesCount: 3,
    completedMilestones: 3,
    deadline: "2024-02-10",
  },
];

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

export default function ProjectsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [now] = useState(() => Date.now());

  const filteredProjects = mockProjects.filter((project) => {
    const matchesSearch = project.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">All Projects</h1>
          <p className="text-muted-foreground mt-2">
            View and manage all your projects
          </p>
        </div>

        {/* Filters */}
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
          <Select
            value={statusFilter as string}
            onValueChange={(value) => setStatusFilter(value)}
          >
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

        {/* Projects Table */}
        <div className="rounded-xl border border-border/40 overflow-hidden bg-card/50 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/40 bg-muted/20">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Project</th>
                  <th className="px-6 py-4 text-left font-semibold">Status</th>
                  <th className="px-6 py-4 text-left font-semibold">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-left font-semibold">Budget</th>
                  <th className="px-6 py-4 text-left font-semibold">
                    Milestones
                  </th>
                  <th className="px-6 py-4 text-left font-semibold">
                    Deadline
                  </th>
                  <th className="px-6 py-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredProjects.map((project) => {
                  const config = statusConfig[project.status];
                  const daysLeft = Math.ceil(
                    (new Date(project.deadline).getTime() - now) /
                      (1000 * 60 * 60 * 24),
                  );
                  const isOverdue = daysLeft < 0;

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold">{project.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          className={`${config.color} ${config.textColor} border-0`}
                        >
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
                      <td className="px-6 py-4">
                        <p className="font-semibold">
                          ${project.budget.toLocaleString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold">
                          {project.completedMilestones}/
                          {project.milestonesCount}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p
                          className={
                            isOverdue ? "text-destructive font-semibold" : ""
                          }
                        >
                          {isOverdue
                            ? `${Math.abs(daysLeft)}d ago`
                            : `${daysLeft}d left`}
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

        {/* Empty State */}
        {filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              No projects found matching your criteria
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
