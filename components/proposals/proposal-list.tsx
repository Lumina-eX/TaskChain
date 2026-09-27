"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProposalCard } from "./proposal-card";
import { ProposalFiltersBar } from "./proposal-filters";
import { ProposalConfirmDialog } from "./proposal-confirm-dialog";
import { ProposalSkeleton } from "./proposal-skeleton";
import { ProposalEmptyState } from "./proposal-empty-state";
import type { Proposal, ProposalFilters } from "@/lib/proposals/types";

interface Props {
  projectId: string;
  readOnly?: boolean;
}

export function ProposalList({ projectId, readOnly }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ProposalFilters>({
    status: "all",
    sortBy: "recent",
    sortDir: "desc",
    search: "",
  });
  const [pendingAction, setPendingAction] = useState<{
    proposal: Proposal;
    action: "accept" | "reject";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ projectId });
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    if (filters.search) params.set("search", filters.search);

    fetch(`/api/proposals?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setProposals(data.proposals ?? []);
      })
      .catch(() => toast.error("Failed to load proposals"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, filters]);

  async function confirmAction() {
    if (!pendingAction) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proposals/${pendingAction.proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: pendingAction.action === "accept" ? "accepted" : "rejected",
        }),
      });
      if (!res.ok) throw new Error();
      const { proposal } = await res.json();
      setProposals((prev) =>
        prev.map((p) => (p.id === proposal.id ? { ...p, ...proposal } : p))
      );
      toast.success(`Proposal ${pendingAction.action}ed`);
      setPendingAction(null);
    } catch {
      toast.error("Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ProposalFiltersBar value={filters} onChange={setFilters} />

      {loading ? (
        <div className="space-y-4">
          <ProposalSkeleton />
          <ProposalSkeleton />
          <ProposalSkeleton />
        </div>
      ) : proposals.length === 0 ? (
        <ProposalEmptyState
          filtered={filters.status !== "all" || !!filters.search}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              readOnly={readOnly || p.status !== "pending"}
              onAccept={(prop) =>
                setPendingAction({ proposal: prop, action: "accept" })
              }
              onReject={(prop) =>
                setPendingAction({ proposal: prop, action: "reject" })
              }
              onViewProfile={(prop) => {
                window.location.href = `/freelancers/${prop.freelancerId}`;
              }}
            />
          ))}
        </div>
      )}

      <ProposalConfirmDialog
        open={!!pendingAction}
        action={pendingAction?.action ?? null}
        freelancerName={pendingAction?.proposal.freelancerName}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}