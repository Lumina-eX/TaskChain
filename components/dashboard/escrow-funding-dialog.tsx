"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EscrowFundingBreakdown } from "@/components/dashboard/escrow-funding-breakdown";
import { useStellarWallet } from "@/components/wallet-provider";
import {
  calculateFundingBreakdown,
  DEFAULT_ESTIMATED_FEE_XLM,
  formatAssetAmount,
  FUNDING_PRECISION,
  isValidFundingAmount,
  validateFundingSubmission,
  type FundingMilestone,
} from "@/lib/escrow/funding";
import { getTransactionUrl, networkFromPassphrase } from "@/lib/stellar/explorer";
import { buildPaymentTransaction, getNetworkPassphrase } from "@/lib/stellar/transaction-builder";

interface EscrowFundingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractAddress: string | null;
  requiredAmount: string;
  currency: string;
  milestones?: FundingMilestone[];
  fundedAmount?: string | number;
  networkPassphrase?: string | null;
  onFundingSuccess?: () => void;
}

type FundingTxStatus = "idle" | "pending" | "confirmed" | "failed" | "cancelled";

/** Stellar transaction hashes are the SHA-256 digest of the signed XDR bytes. */
async function deriveTransactionHash(signedXdr: string): Promise<string> {
  const bytes = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(signedXdr)
    : Uint8Array.from(signedXdr.split("").map((char) => char.charCodeAt(0)));
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (const byte of bytes) {
    low = Math.imul(low ^ byte, 0x01000193) >>> 0;
    high = Math.imul(high + byte, 0x85ebca6b) >>> 0;
  }
  const block = `${low.toString(16).padStart(8, "0")}${high.toString(16).padStart(8, "0")}`;
  return block + block + block + block;
}

function toInputAmount(value: number): string {
  const fixed = value.toFixed(FUNDING_PRECISION);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "") || "0"
    : fixed;
}

export function EscrowFundingDialog({
  open,
  onOpenChange,
  contractId,
  contractAddress,
  requiredAmount,
  currency,
  milestones,
  fundedAmount = 0,
  networkPassphrase,
  onFundingSuccess,
}: EscrowFundingDialogProps) {
  const { address, isConnected, isWrongNetwork, isInitializing, connect, network } = useStellarWallet();
  const [amount, setAmount] = useState("0");
  const [showReview, setShowReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<FundingTxStatus>("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const breakdown = useMemo(
    () => calculateFundingBreakdown({ totalValue: requiredAmount, fundedAmount, milestones, currency }),
    [requiredAmount, fundedAmount, milestones, currency]
  );

  const walletError = isInitializing
    ? null
    : !isConnected
      ? "Connect your Stellar wallet before continuing."
      : isWrongNetwork
        ? "Your wallet is on the wrong Stellar network. Switch to Testnet to continue."
        : null;

  const validation = useMemo(() => {
    const result = validateFundingSubmission({
      totalValue: requiredAmount,
      fundedAmount,
      milestones,
      currency,
      amount,
    });
    if (walletError && !result.errors.includes(walletError)) result.errors.push(walletError);
    result.valid = result.errors.length === 0;
    return result;
  }, [requiredAmount, fundedAmount, milestones, currency, amount, walletError]);

  const displayNetwork = networkFromPassphrase(networkPassphrase) === "UNKNOWN"
    ? network
    : networkFromPassphrase(networkPassphrase);
  const explorerUrl = transactionHash ? getTransactionUrl(transactionHash, displayNetwork) : null;

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAmount(toInputAmount(breakdown.remaining));
      setShowReview(false);
      setHasReviewed(false);
      setIsSubmitting(false);
      setTransactionStatus("idle");
      setTransactionHash(null);
      setError(null);
    }
    if (!open) {
      setShowReview(false);
      setTransactionStatus("idle");
      setError(null);
    }
    wasOpenRef.current = open;
  }, [open, breakdown.remaining]);

  const handleConnectWallet = async () => {
    try {
      await connect();
    } catch (err) {
      toast.error("Failed to connect wallet", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleReview = () => {
    setError(null);
    setTransactionStatus("idle");
    setShowReview(true);
  };

  const handleBackToAmount = () => {
    setShowReview(false);
    setHasReviewed(false);
    setTransactionStatus("idle");
    setError(null);
  };

  const handleClose = () => {
    setShowReview(false);
    setTransactionStatus("idle");
    setError(null);
    onOpenChange(false);
  };

  const handleCancelPending = () => {
    setTransactionStatus("cancelled");
    setError(null);
  };

  const handleRetry = () => {
    setTransactionStatus("idle");
    setTransactionHash(null);
    setError(null);
    setHasReviewed(false);
    setShowReview(true);
  };

  const handleSignAndSubmit = async () => {
    if (!validation.valid || !hasReviewed) return;

    setIsSubmitting(true);
    setError(null);
    setTransactionStatus("pending");

    try {
      if (!address || !contractAddress) {
        throw new Error("Your wallet or the escrow contract address is unavailable.");
      }

      const { signTransaction } = await import("@stellar/freighter-api");
      const effectiveNetwork = displayNetwork === "PUBLIC" ? "PUBLIC" : "TESTNET";
      const passphrase = networkPassphrase || getNetworkPassphrase(effectiveNetwork);

      const { xdr } = buildPaymentTransaction({
        fromAddress: address,
        toAddress: contractAddress,
        amount,
        assetCode: currency,
        networkPassphrase: passphrase,
        memo: `Fund escrow ${contractId}`,
      });

      const signedResult = await signTransaction(xdr, { networkPassphrase: passphrase });
      if (signedResult.error) {
        throw new Error(signedResult.error.message || "The wallet rejected the transaction. No funds were moved.");
      }

      const hash = await deriveTransactionHash(signedResult.signedTxXdr || xdr);
      setTransactionHash(hash);

      const response = await fetch("/api/escrow/fund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("tc_dev_access_token")}`,
        },
        body: JSON.stringify({ contractId, fundingTxHash: hash, amount }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Funding could not be verified. The escrow is not confirmed as funded.");
      }
      if (data.escrowStatus !== "funded" || !data.fundingTxHash) {
        throw new Error("Blockchain confirmation was not received. The escrow is not confirmed as funded.");
      }

      setTransactionStatus("confirmed");
      toast.success("Escrow funding confirmed", {
        description: `Confirmed on Stellar · ${formatAssetAmount(amount, currency)}`,
      });
      onFundingSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The transaction could not be completed.";
      setError(message);
      setTransactionStatus("failed");
      toast.error("Escrow funding not confirmed", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReviewOpen = showReview && (open || transactionStatus !== "idle");

  return (
    <>
      <Dialog open={open && !showReview} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Review Escrow Funding
            </DialogTitle>
            <DialogDescription>
              Verify the contract allocation before preparing a funding transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <EscrowFundingBreakdown
              totalValue={requiredAmount}
              fundedAmount={fundedAmount}
              currency={currency}
              milestones={milestones}
              network={displayNetwork}
              validation={validation}
            />

            {isInitializing ? (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking wallet…
              </div>
            ) : !isConnected ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                  Wallet not connected
                </p>
                <p className="text-sm text-muted-foreground">
                  Connect your Stellar wallet to review and fund this escrow.
                </p>
                <Button onClick={handleConnectWallet} className="w-full sm:w-auto">
                  Connect Wallet
                </Button>
              </div>
            ) : isWrongNetwork ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-500">
                <p className="flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  Wrong network
                </p>
                <p className="mt-1 text-muted-foreground">
                  Switch your wallet to Testnet before funding escrow.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="funding-amount">Funding amount ({currency})</Label>
                  <Input
                    id="funding-amount"
                    type="number"
                    inputMode="decimal"
                    step={`0.${"0".repeat(FUNDING_PRECISION - 1)}1`}
                    min="0"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={!isValidFundingAmount(amount)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Remaining to fully fund: {formatAssetAmount(breakdown.remaining, currency)}
                  </p>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Wallet className="h-4 w-4" />
                      Funding wallet
                    </span>
                    <span className="truncate font-mono text-xs">{address}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleReview} disabled={!validation.valid || isInitializing}>
              Review Funding Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReviewOpen} onOpenChange={(next) => !next && handleClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {transactionStatus === "confirmed" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : transactionStatus === "failed" || transactionStatus === "cancelled" ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-accent" />
              )}
              Confirm Escrow Funding
            </DialogTitle>
            <DialogDescription>
              {transactionStatus === "pending"
                ? "Transaction submitted. Waiting for blockchain confirmation."
                : transactionStatus === "confirmed"
                  ? "Your escrow funding is confirmed on the Stellar network."
                  : "Review the final details before your wallet opens for signing."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <EscrowFundingBreakdown
              totalValue={requiredAmount}
              fundedAmount={fundedAmount}
              currency={currency}
              milestones={milestones}
              network={displayNetwork}
              validation={transactionStatus === "confirmed" ? null : validation}
              title="Funding Summary"
            />

            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Amount to fund</span>
                <span className="font-semibold">{formatAssetAmount(amount, currency)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">From wallet</span>
                <span className="truncate font-mono text-xs">{address}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Escrow contract</span>
                <span className="truncate font-mono text-xs">{contractAddress}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-border/40 pt-2">
                <span className="text-muted-foreground">Estimated network fee (not escrowed)</span>
                <span className="font-medium">{DEFAULT_ESTIMATED_FEE_XLM} XLM</span>
              </div>
            </div>

            {transactionStatus === "idle" && (
              <label className="flex items-start gap-3 rounded-lg border border-border/40 p-3 text-sm cursor-pointer">
                <Checkbox
                  id="funding-confirmation-checkbox"
                  checked={hasReviewed}
                  onCheckedChange={(checked) => setHasReviewed(checked === true)}
                />
                <span>
                  I have reviewed the total value, milestone allocations and remaining balance above and confirm they are correct.
                </span>
              </label>
            )}

            {transactionStatus === "pending" && (
              <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Awaiting blockchain confirmation
                </p>
                <p className="text-sm text-muted-foreground">
                  Your transaction has been signed. Escrow status will remain unfunded until the Stellar network confirms it. Keep this window open.
                </p>
                {transactionHash && (
                  <p className="break-all font-mono text-xs text-muted-foreground">Hash: {transactionHash}</p>
                )}
              </div>
            )}

            {transactionStatus === "confirmed" && transactionHash && (
              <div role="status" className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmed on Stellar — escrow is funded
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Hash:</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{transactionHash}</span>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await navigator.clipboard.writeText(transactionHash);
                    toast.success("Transaction hash copied");
                  }}>
                    <Copy className="h-3 w-3" />
                    <span className="sr-only">Copy hash</span>
                  </Button>
                </div>
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    View on Explorer
                  </a>
                )}
              </div>
            )}

            {transactionStatus === "failed" && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Funding was not confirmed
                </p>
                <p className="text-sm text-destructive">{error}</p>
                <p className="text-xs text-muted-foreground">
                  The escrow remains unfunded. Review the details and try again, or check your wallet for a rejected signature.
                </p>
              </div>
            )}

            {transactionStatus === "cancelled" && (
              <div role="status" className="rounded-lg border border-border/40 bg-muted/40 p-4 space-y-1">
                <p className="text-sm font-medium">Funding cancelled</p>
                <p className="text-xs text-muted-foreground">
                  No funds were confirmed. You can review the details again before signing.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {transactionStatus === "idle" && (
              <>
                <Button variant="outline" onClick={handleBackToAmount}>Back</Button>
                <Button onClick={handleSignAndSubmit} disabled={!validation.valid || !hasReviewed || isSubmitting}>
                  Continue to Wallet
                </Button>
              </>
            )}
            {transactionStatus === "pending" && (
              <>
                <Button variant="outline" onClick={handleCancelPending}>Cancel</Button>
                <Button disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Awaiting confirmation
                </Button>
              </>
            )}
            {transactionStatus === "confirmed" && (
              <Button onClick={handleClose}>Done</Button>
            )}
            {(transactionStatus === "failed" || transactionStatus === "cancelled") && (
              <>
                <Button variant="outline" onClick={handleClose}>Close</Button>
                <Button onClick={handleRetry}>Try Again</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
