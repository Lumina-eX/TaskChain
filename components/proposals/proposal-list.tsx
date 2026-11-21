"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalCard } from "./proposal-card";
import { ProposalComparison } from "./proposal-comparison";
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
    action: "accept" | "reject";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ projectId });
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    if (filters.search) params.set("search", filters.search);

    fetch(`/api/proposals?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setProposals(data.proposals ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load proposals.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, filters, reloadKey]);

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
      setShortlistedIds((prev) => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
      toast.success(`Proposal ${pendingAction.action}ed`);
      setPendingAction(null);
    } catch {
      toast.error("Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  const actionable = !readOnly;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProposalFiltersBar value={filters} onChange={setFilters} />
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
        <ProposalComparison
          proposals={compared}
          shortlistedIds={shortlistedIds}
          readOnly={readOnly}
          onToggleShortlist={toggleShortlist}
          onAccept={(p) => setPendingAction({ proposal: p, action: "accept" })}
          onReject={(p) => setPendingAction({ proposal: p, action: "reject" })}
          onClose={() => setComparing(false)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {proposals.map((p) => (
            <div key={p.id} className="space-y-2">
              <ProposalCard
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
        freelancerName={pendingAction?.proposal.freelancerName}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}
