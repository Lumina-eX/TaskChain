"use client";

import { Calendar } from "lucide-react";
import { ContractMilestoneCalendar } from "@/components/dashboard/contract-milestone-calendar";

export default function MilestoneCalendarPage() {
  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Calendar className="h-8 w-8 text-primary" />
            Milestone Calendar
          </h1>
          <p className="text-muted-foreground mt-2">
            Track project milestones, deadlines, and deliverables across all your contracts.
          </p>
        </div>

        {/* Calendar */}
        <ContractMilestoneCalendar />
      </div>
    </div>
  );
}
