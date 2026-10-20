"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProposalCard } from "./proposal-card";
import { ProposalFiltersBar } from "./proposal-filters";
import { ProposalConfirmDialog } from "./proposal-confirm-dialog";
import { ProposalSkeleton } from "./proposal-skeleton";
import { ProposalEmptyState } from "./proposal-empty-state";
import type { Proposal, ProposalFilters } from "@/lib/proposals/types";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, X } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ projectId });
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    if (filters.search) params.set("search", filters.search);

    fetch(`/api/proposals?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setProposals(data.proposals ?? []);
          setComparing((current) => current.filter((id) => (data.proposals ?? []).some(
            (proposal: Proposal) => proposal.id === id
          )));
        }
      })
      .catch(() => {
        if (!cancelled) setError("We couldn’t load proposals. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, filters, reloadKey]);

  async function updateStatus(proposal: Proposal, status: "pending" | "shortlisted" | "accepted" | "rejected") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Proposal update failed");
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? { ...p, ...result.proposal } : p)));
      toast.success(
        status === "shortlisted"
          ? "Proposal added to shortlist"
          : status === "pending"
            ? "Proposal removed from shortlist"
            : `Proposal ${status}`
      );
      setPendingAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    await updateStatus(
      pendingAction.proposal,
      pendingAction.action === "accept" ? "accepted" : "rejected"
    );
  }

  function toggleCompare(proposalId: string) {
    setComparing((current) =>
      current.includes(proposalId)
        ? current.filter((id) => id !== proposalId)
        : [...current, proposalId]
    );
  }

  const comparison = proposals.filter((proposal) => comparing.includes(proposal.id));
  const currencyFormat = (proposal: Proposal) => {
    const currency = proposal.currency.toUpperCase();
    return /^[A-Z]{3}$/.test(currency)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(proposal.proposedBudget)
      : `${proposal.proposedBudget.toLocaleString()} ${currency}`;
  };

  return (
    <div className="space-y-4">
      <ProposalFiltersBar value={filters} onChange={setFilters} />

      {loading ? (
        <div className="space-y-4">
          <ProposalSkeleton />
          <ProposalSkeleton />
          <ProposalSkeleton />
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
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
              readOnly={readOnly || (p.status !== "pending" && p.status !== "shortlisted")}
              comparing={comparing.includes(p.id)}
              onCompare={(prop) => toggleCompare(prop.id)}
              onShortlist={(prop) =>
                void updateStatus(prop, prop.status === "shortlisted" ? "pending" : "shortlisted")
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

      {!loading && !error && comparison.length > 0 && (
        <section aria-labelledby="proposal-comparison-heading" className="rounded-lg border">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 id="proposal-comparison-heading" className="text-lg font-semibold">
                Proposal comparison
              </h2>
              <p className="text-sm text-muted-foreground">
                Compare budget, delivery, experience, skills, and proposal details.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setComparing([])}>
              Clear
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr>
                  <th className="w-36 p-3 font-medium text-muted-foreground">Details</th>
                  {comparison.map((proposal) => (
                    <th key={proposal.id} className="min-w-52 p-3 align-top">
                      <div className="flex items-center justify-between gap-2">
                        <span>{proposal.freelancerName}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${proposal.freelancerName} from comparison`}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => toggleCompare(proposal.id)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <ComparisonRow label="Status" proposals={comparison} value={(p) => p.status} />
                <ComparisonRow label="Budget" proposals={comparison} value={currencyFormat} />
                <ComparisonRow label="Delivery" proposals={comparison} value={(p) => p.estimatedDuration || "Not specified"} />
                <ComparisonRow label="Rating" proposals={comparison} value={(p) => `${p.freelancerRating.toFixed(1)} / 5`} />
                <ComparisonRow label="Previous work" proposals={comparison} value={(p) => `${p.freelancerPastContracts} completed jobs`} />
                <ComparisonRow label="Skills" proposals={comparison} value={(p) => p.freelancerSkills.join(", ") || "Not specified"} />
                <ComparisonRow label="Proposal" proposals={comparison} value={(p) => p.coverLetter} />
              </tbody>
            </table>
          </div>
        </section>
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

function ComparisonRow({
  label,
  proposals,
  value,
}: {
  label: string;
  proposals: Proposal[];
  value: (proposal: Proposal) => string;
}) {
  return (
    <tr>
      <th scope="row" className="p-3 align-top font-medium text-muted-foreground">{label}</th>
      {proposals.map((proposal) => (
        <td key={proposal.id} className="max-w-sm whitespace-normal p-3 align-top">
          {value(proposal)}
        </td>
      ))}
    </tr>
  );
}