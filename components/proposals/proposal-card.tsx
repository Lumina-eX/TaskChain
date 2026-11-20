"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProposalStatusBadge } from "./proposal-status-badge";
import type { Proposal } from "@/lib/proposals";

interface Props {
  proposal: Proposal;
  readOnly?: boolean;
  disabled?: boolean;
  onShortlist?: (p: Proposal) => void;
  onAccept?: (p: Proposal) => void;
  onReject?: (p: Proposal) => void;
  onViewProfile?: (p: Proposal) => void;
}

export function ProposalCard({
  proposal,
  readOnly,
  disabled,
  onShortlist,
  onAccept,
  onReject,
  onViewProfile,
}: Props) {
  const budget = `${proposal.budget.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;

  const freelancerName = proposal.freelancerName ?? "Freelancer";
  const initials = freelancerName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {initials}
          </div>
          <div>
            <p className="font-medium">{freelancerName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{(proposal.freelancerRating ?? 0).toFixed(1)} / 5</span>
              <span>Â·</span>
              <span>{proposal.freelancerPastContracts ?? 0} jobs</span>
            </div>
          </div>
        </div>
        <ProposalStatusBadge status={proposal.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        {(proposal.freelancerSkills ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(proposal.freelancerSkills ?? []).slice(0, 6).map((s) => (
              <span key={s} className="rounded bg-muted px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {proposal.message}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Budget: </span>
            <span className="font-medium">{budget}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Delivery: </span>
            <span className="font-medium">{proposal.deliveryTime} days</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onViewProfile?.(proposal)}
          >
            View profile
          </Button>
          {!readOnly && (
            <>
              {proposal.status !== "under_review" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onShortlist?.(proposal)}
                >
                  Shortlist
                </Button>
              )}
              <Button size="sm" disabled={disabled} onClick={() => onAccept?.(proposal)}>
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled}
                onClick={() => onReject?.(proposal)}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}