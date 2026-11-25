"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProposalCard } from "./proposal-card";
import { ProposalFiltersBar } from "./proposal-filters";
import { ProposalConfirmDialog } from "./proposal-confirm-dialog";
import { ProposalSkeleton } from "./proposal-skeleton";
import { ProposalEmptyState } from "./proposal-empty-state";
import type { Proposal, ProposalStatus } from "@/lib/proposals";

interface Props {
  projectId: string;
  readOnly?: boolean;
}

type ProposalFilters = {
  status: ProposalStatus | "all";
  sortBy: "budget" | "delivery" | "rating" | "recent";
  sortDir: "asc" | "desc";
  search: string;
};

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
    action: "shortlist" | "accept" | "reject";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loadController = useRef<AbortController | null>(null);
  const submissionInProgress = useRef(false);

  const loadProposals = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (filters.status !== "all") params.set("status", filters.status);
      const response = await fetch(`/api/projects/${projectId}/proposals?${params}`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? "Failed to load proposals");
      }
      if (!controller.signal.aborted) setProposals(body.data.proposals);
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "Failed to load proposals");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters.status, projectId]);

  useEffect(() => {
    void loadProposals();
    const controller = loadController.current;
    return () => {
      controller?.abort();
    };
  }, [loadProposals]);

  const visibleProposals = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return proposals
      .filter((proposal) => {
        if (!search) return true;
        return `${proposal.freelancerName ?? ""} ${proposal.message} ${proposal.freelancerId}`
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        const direction = filters.sortDir === "asc" ? 1 : -1;
        const values = {
          budget: [a.budget, b.budget],
          delivery: [a.deliveryTime, b.deliveryTime],
          rating: [a.freelancerRating ?? 0, b.freelancerRating ?? 0],
          recent: [Date.parse(a.createdAt), Date.parse(b.createdAt)],
        }[filters.sortBy];
        return (values[0] - values[1]) * direction;
      });
  }, [filters.search, filters.sortBy, filters.sortDir, proposals]);

  async function confirmAction() {
    if (!pendingAction || submissionInProgress.current) return;
    const action = pendingAction.action;
    const proposal = pendingAction.proposal;
    submissionInProgress.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: action === "shortlist" ? "under_review" : action === "accept" ? "accepted" : "rejected",
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        toast.error(body.errors?.[0]?.message ?? "Action failed");
        setPendingAction(null);
        await loadProposals();
        return;
      }
      toast.success(action === "shortlist" ? "Proposal shortlisted" : `Proposal ${action}ed`);
      setPendingAction(null);
      await loadProposals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
      setPendingAction(null);
      await loadProposals();
    } finally {
      submissionInProgress.current = false;
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
      ) : visibleProposals.length === 0 ? (
        <ProposalEmptyState filtered />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleProposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              readOnly={readOnly || p.status === "accepted" || p.status === "rejected"}
              disabled={submitting}
              onShortlist={(prop) =>
                setPendingAction({ proposal: prop, action: "shortlist" })
              }
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
        freelancerName={pendingAction?.proposal.freelancerName ?? "this freelancer"}
        submitting={submitting}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}