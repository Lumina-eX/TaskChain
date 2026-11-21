"use client";

import { AlertCircle, Coins, Globe2, Loader2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { networkLabel, type StellarNetwork } from "@/components/wallet-provider";
import {
  calculateFundingBreakdown,
  DEFAULT_ESTIMATED_FEE_XLM,
  formatAssetAmount,
  formatFundingAmount,
  formatFundingPercent,
  type FundingMilestone,
  type FundingValidationResult,
} from "@/lib/escrow/funding";
import { cn } from "@/lib/utils";

interface EscrowFundingBreakdownProps {
  totalValue: string;
  fundedAmount?: string | number;
  currency: string;
  milestones?: FundingMilestone[];
  network: StellarNetwork;
  estimatedFee?: string;
  validation?: FundingValidationResult | null;
  isLoading?: boolean;
  title?: string;
  showFee?: boolean;
  className?: string;
}

export function EscrowFundingBreakdown({
  totalValue,
  fundedAmount = 0,
  currency,
  milestones,
  network,
  estimatedFee = DEFAULT_ESTIMATED_FEE_XLM,
  validation,
  isLoading = false,
  title = "Funding Breakdown",
  showFee = true,
  className,
}: EscrowFundingBreakdownProps) {
  const breakdown = calculateFundingBreakdown({ totalValue, fundedAmount, milestones, currency });

  if (isLoading) {
    return (
      <Card className={cn("p-6 rounded-xl bg-card/50 border-border/40", className)}>
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading funding breakdown…
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-4 sm:p-6 rounded-xl bg-card/50 border-border/40 backdrop-blur-sm space-y-5", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <p className="text-3xl font-extrabold text-accent sm:text-4xl" aria-label="Total contract value">
          {formatAssetAmount(breakdown.total, currency)}
        </p>
        <p className="text-xs text-muted-foreground">Total contract value</p>
      </div>

      {validation && !validation.valid && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Funding details need attention
          </p>
          <ul className="list-disc pl-6 text-xs text-destructive space-y-0.5">
            {validation.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Funded</p>
          <p className="font-semibold">{formatAssetAmount(breakdown.funded, currency)}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="font-semibold">{formatAssetAmount(breakdown.remaining, currency)}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Funding progress</span>
          <span>{formatFundingPercent(breakdown.fundedPercent)} funded</span>
        </div>
        <Progress
          value={Math.min(Math.max(breakdown.fundedPercent, 0), 100)}
          aria-label="Funding progress"
        />
      </div>

      {milestones && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Milestone allocations</h4>
            <span className="text-xs text-muted-foreground">
              {formatAssetAmount(breakdown.allocationTotal, currency)} · {formatFundingPercent(breakdown.allocationPercent)}
            </span>
          </div>
          {breakdown.milestoneAllocations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/50 p-4 text-center text-sm text-muted-foreground">
              No milestone allocations available for this contract.
            </p>
          ) : (
            <ul className="space-y-2">
              {breakdown.milestoneAllocations.map((milestone, index) => (
                <li
                  key={milestone.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{milestone.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFundingPercent(milestone.percent)} of contract value
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{formatAssetAmount(milestone.amountValue, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 border-t border-border/40 pt-4 sm:grid-cols-2">
        <div className="flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Asset:</span>
          <Badge variant="outline" className="font-mono">{currency}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Stellar network:</span>
          <Badge variant="outline">{networkLabel(network)}</Badge>
        </div>
      </div>

      {showFee && (
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4 shrink-0" />
              Estimated network fee
            </span>
            <span className="font-semibold">{formatFundingAmount(estimatedFee)} XLM</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid to the Stellar network in XLM. This fee is not part of the escrow funds above.
          </p>
        </div>
      )}
    </Card>
  );
}
