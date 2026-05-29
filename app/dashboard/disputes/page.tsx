"use client";

import { useState } from "react";
import {
  AlertCircle,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisputeForm } from "@/components/dashboard/dispute-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Dispute {
  id: string;
  projectTitle: string;
  reason: string;
  status: "open" | "in-review" | "resolved";
  createdDate: string;
  messages: number;
  evidence: string[];
}

const mockDisputes: Dispute[] = [
  {
    id: "1",
    projectTitle: "Logo Design - Revision Required",
    reason:
      "Deliverables do not match the agreed-upon specifications. Colors and fonts are different from requirements.",
    status: "in-review",
    createdDate: "2024-02-20",
    messages: 5,
    evidence: ["design_spec.pdf", "screenshot_comparison.png"],
  },
];

const statusConfig = {
  open: {
    color: "bg-amber-500/20",
    text: "Open",
    textColor: "text-amber-500",
    icon: AlertCircle,
  },
  "in-review": {
    color: "bg-secondary/20",
    text: "In Review",
    textColor: "text-secondary",
    icon: Clock,
  },
  resolved: {
    color: "bg-accent/20",
    text: "Resolved",
    textColor: "text-accent",
    icon: CheckCircle2,
  },
};

export default function DisputesPage() {
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);

  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Disputes</h1>
            <p className="text-muted-foreground mt-2">
              Manage disputes and resolutions
            </p>
          </div>
          <Button
            onClick={() => setShowDisputeForm(true)}
            className="group"
            size="lg"
          >
            <Plus className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
            Raise Dispute
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Total Disputes</p>
            <p className="text-3xl font-bold">1</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">In Review</p>
            <p className="text-3xl font-bold text-secondary">1</p>
          </div>
          <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">Resolved</p>
            <p className="text-3xl font-bold text-accent">0</p>
          </div>
        </div>

        {/* Disputes List */}
        {mockDisputes.length > 0 ? (
          <div className="space-y-4">
            {mockDisputes.map((dispute) => {
              const config = statusConfig[dispute.status];
              const Icon = config.icon;

              return (
                <div
                  key={dispute.id}
                  className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-all duration-300 cursor-pointer"
                  onClick={() => setSelectedDispute(dispute)}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap gap-y-1">
                          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                          <h3 className="text-lg font-semibold">
                            {dispute.projectTitle}
                          </h3>
                          <Badge
                            className={`${config.color} ${config.textColor} border-0`}
                          >
                            {config.text}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {dispute.reason}
                        </p>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-3 gap-4 text-sm pl-7">
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">
                          Created
                        </p>
                        <p className="font-semibold">
                          {new Date(dispute.createdDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">
                          Messages
                        </p>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          <p className="font-semibold">{dispute.messages}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">
                          Evidence
                        </p>
                        <p className="font-semibold">
                          {dispute.evidence.length} files
                        </p>
                      </div>
                    </div>

                    {/* Evidence */}
                    {dispute.evidence.length > 0 && (
                      <div className="pl-7 pt-2">
                        <p className="text-xs text-muted-foreground mb-2">
                          Evidence:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {dispute.evidence.map((file, idx) => (
                            <div
                              key={idx}
                              className="text-xs px-3 py-1 rounded bg-card/50 border border-border/40"
                            >
                              📎 {file}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action */}
                    <div className="pl-7 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDispute(dispute);
                        }}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Disputes</h3>
            <p className="text-muted-foreground mb-6">
              You don&apos;t have any active disputes.
            </p>
            <Button onClick={() => setShowDisputeForm(true)} variant="outline">
              Learn More About Disputes
            </Button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <DisputeForm open={showDisputeForm} onOpenChange={setShowDisputeForm} />
    </div>
  );
}
