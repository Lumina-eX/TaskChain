"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, Star, ShieldCheck, Wallet, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProfileCard } from "@/components/dashboard/profile-card";
import { ContractMilestoneList, type ContractMilestone } from "@/components/dashboard/contract-milestone-list";
import { ContractEscrowSummary } from "@/components/dashboard/contract-escrow-summary";
import { EscrowStatusTracker, type EscrowStage } from "@/components/dashboard/escrow-status-tracker";

interface ProfileInfo {
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  wallet_address: string | null;
  avg_rating?: number;
  total_reviews?: number;
}

interface ContractDetail {
  id: string;
  job_id: string;
  status: string;
  total_amount: string;
  currency: string;
  terms: string | null;
  contract_address: string | null;
  created_at: string;
  updated_at: string;
  client?: ProfileInfo | null;
  freelancer?: ProfileInfo | null;
  escrow?: {
    escrow_address: string | null;
    escrow_status: string;
    total_amount: string;
    funded_amount: number;
    released_amount: number;
    progress_percent: number;
    network_passphrase: string | null;
  } | null;
  milestones: ContractMilestone[];
}

const contractStatusConfig: Record<string, { label: string; color: string; textColor: string }> = {
  pending: { label: "Pending", color: "bg-muted", textColor: "text-muted-foreground" },
  active: { label: "Active", color: "bg-secondary/20", textColor: "text-secondary" },
  paused: { label: "Paused", color: "bg-amber-500/20", textColor: "text-amber-500" },
  completed: { label: "Completed", color: "bg-accent/20", textColor: "text-accent" },
  cancelled: { label: "Cancelled", color: "bg-muted", textColor: "text-muted-foreground" },
  disputed: { label: "Disputed", color: "bg-destructive/20", textColor: "text-destructive" },
};

const escrowStageMap: Record<string, EscrowStage> = {
  draft: "Funded", open: "Funded", in_progress: "In Progress",
  completed: "Released", disputed: "In Progress",
};

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/contracts/${id}`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (!res.ok) {
          setError("Contract not found or you don't have access.");
          return;
        }
        const data = await res.json();
        setContract(data.contract);
      } catch {
        setError("Failed to load contract.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading contract…
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error ?? "Contract not found."}</p>
        <Link href="/dashboard/contracts">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contracts
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = contractStatusConfig[contract.status] ?? contractStatusConfig.pending;
  const escrowStage = escrowStageMap[contract.status] ?? "Funded";
  const clientBadge = (
    <Badge variant="outline" className="text-[10px] text-accent border-accent/20 bg-accent/5">Owner</Badge>
  );
  const freelancerBadge = contract.freelancer ? (
    <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">Assigned</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/20 bg-yellow-500/5">Hiring</Badge>
  );

  return (
    <div className="p-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <Link href="/dashboard/contracts">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Contract #{contract.id}</h1>
              <p className="text-muted-foreground mt-2">Job ID: {contract.job_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/messages?contractId=${contract.id}`}>
              <Button variant="outline" className="gap-2 border-primary/30 hover:bg-primary/10 text-xs sm:text-sm">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span>Message Party</span>
              </Button>
            </Link>
            <Badge className={`${statusCfg.color} ${statusCfg.textColor} border-0`}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProfileCard type="client" profile={contract.client ?? null} badge={clientBadge} />
          <ProfileCard type="freelancer" profile={contract.freelancer ?? null} badge={freelancerBadge} emptyMessage="No freelancer assigned" />
        </div>

        {/* Contract Info & Escrow */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/50 border-border/40 backdrop-blur-sm rounded-xl space-y-3 md:col-span-1">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
              <Wallet className="h-5 w-5 text-accent shrink-0" />
              Contract Details
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-2xl font-bold">
                  {contract.total_amount} {contract.currency}
                </p>
              </div>
              {contract.contract_address && (
                <div className="pt-2 border-t border-border/20">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Contract Address</p>
                  <p className="font-mono text-xs break-all">{contract.contract_address}</p>
                </div>
              )}
              {contract.terms && (
                <div className="pt-2 border-t border-border/20">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Terms</p>
                  <p className="text-sm line-clamp-3">{contract.terms}</p>
                </div>
              )}
            </div>
          </Card>
          <ContractEscrowSummary escrow={contract.escrow} currency={contract.currency} />
        </div>
      </div>
    </div>
  );
}