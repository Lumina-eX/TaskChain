"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalCard } from "./proposal-card";
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
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<ProposalFilters>({
    status: "all",
    sortBy: "recent",
    sortDir: "desc",
    search: "",
  });
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
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

  const compared = useMemo(
    () => proposals.filter((p) => shortlistedIds.has(p.id)),
    [proposals, shortlistedIds]
  );

  function toggleShortlist(p: Proposal) {
    setShortlistedIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

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
      setShortlistedIds((prev) => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
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

  const actionable = !readOnly;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          className="rounded-md border px-3 py-1 text-sm"
          placeholder="Search proposals"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        {actionable && shortlistedIds.size > 0 && (
          <Button size="sm" onClick={() => setComparing(true)}>
            Compare shortlist ({shortlistedIds.size})
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ProposalSkeleton />
          <ProposalSkeleton />
          <ProposalSkeleton />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      ) : proposals.length === 0 ? (
        <ProposalEmptyState
          filtered={filters.status !== "all" || !!filters.search}
        />
      ) : comparing && actionable ? (
        <div className="space-y-4">
          <Button size="sm" variant="outline" onClick={() => setComparing(false)}>
            Back to proposals
          </Button>
          <div className="grid gap-4 md:grid-cols-2">
            {compared.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                readOnly={readOnly || p.status === "accepted" || p.status === "rejected"}
                disabled={submitting}
                onShortlist={(prop) => setPendingAction({ proposal: prop, action: "shortlist" })}
                onAccept={(prop) => setPendingAction({ proposal: prop, action: "accept" })}
                onReject={(prop) => setPendingAction({ proposal: prop, action: "reject" })}
                onViewProfile={(prop) => {
                  window.location.href = `/freelancers/${prop.freelancerId}`;
                }}
              />
            ))}
          </div>
        </div>
      ) : visibleProposals.length === 0 ? (
        <ProposalEmptyState filtered />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleProposals.map((p) => (
            <div key={p.id} className="space-y-2">
              <ProposalCard
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
              {actionable && p.status === "pending" && (
                <Button
                  variant={shortlistedIds.has(p.id) ? "secondary" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => toggleShortlist(p)}
                >
                  {shortlistedIds.has(p.id) ? "Shortlisted ✓ (remove)" : "Add to shortlist"}
                </Button>
              )}
            </div>
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