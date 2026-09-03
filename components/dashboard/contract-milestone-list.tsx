"use client";

import { CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export interface ContractMilestone {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  due_date: string | null;
  status: string;
  sort_order: number;
}

const milestoneStatusConfig: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "text-muted-foreground", icon: AlertCircle },
  in_progress: { label: "In Progress", color: "text-secondary", icon: Clock },
  submitted: { label: "Submitted", color: "text-amber-500", icon: CheckCircle2 },
  approved: { label: "Approved", color: "text-accent", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-destructive", icon: AlertCircle },
  paid: { label: "Paid", color: "text-primary", icon: CheckCircle2 },
};

export function ContractMilestoneList({ milestones, isLoading }: { milestones: ContractMilestone[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Clock className="h-5 w-5 animate-spin" />
        Loading milestones...
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        No milestones for this contract.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {milestones.map((m, i) => {
        const config =
          milestoneStatusConfig[m.status] ?? milestoneStatusConfig.pending;
        const Icon = config.icon;

        return (
          <div
            key={m.id}
            className="flex items-start justify-between p-4 rounded-lg border border-border/40 bg-card/50"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{m.title}</p>
                {m.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {m.description}
                  </p>
                )}
                {m.due_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Due {new Date(m.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-4 flex items-start gap-3">
              <div className="text-right">
                <p className="font-semibold">
                  ${parseFloat(m.amount).toLocaleString()} {m.currency}
                </p>
                <p className={`text-xs mt-1 flex items-center justify-end gap-1 ${config.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link href={`/dashboard/milestones/${m.id}`}>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}