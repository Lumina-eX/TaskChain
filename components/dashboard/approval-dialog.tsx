"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useStellarWallet } from "@/components/wallet-provider";
import { signTransaction } from "@stellar/freighter-api";

type TxStatus = "idle" | "building" | "requires_signing" | "submitting" | "pending" | "confirmed" | "failed";

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectTitle: string;
  amount: number;
  milestoneId?: string;
  contractId?: string;
  onSuccess?: () => void;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  projectTitle,
  amount,
  milestoneId,
  contractId,
  onSuccess,
}: ApprovalDialogProps) {
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected } = useStellarWallet();

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setTxStatus("idle");
        setTxHash(null);
        setError(null);
        setAgreeToTerms(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleApprove = useCallback(async () => {
    if (!agreeToTerms || !milestoneId) return;

    setError(null);

    if (!isConnected || !address) {
      setError("Please connect your Stellar wallet (Freighter) first.");
      setTxStatus("failed");
      return;
    }

    try {
      setTxStatus("building");

      const buildRes = await fetch(`/api/milestones/${milestoneId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build" }),
      });

      if (!buildRes.ok) {
        const errBody = await buildRes.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to build approval transaction");
      }

      const { unsignedXdr } = await buildRes.json();
      if (!unsignedXdr) throw new Error("No transaction XDR returned from server");

      setTxStatus("requires_signing");

      const networkPassphrase = "Test SDF Network ; September 2015";

      const signedXdr = await signTransaction(unsignedXdr, {
        networkPassphrase,
      });

      if (!signedXdr) {
        throw new Error("Transaction signing was cancelled.");
      }

      setTxStatus("submitting");

      const submitRes = await fetch(`/api/milestones/${milestoneId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", signedXdr }),
      });

      const submitBody = await submitRes.json();

      if (!submitRes.ok) {
        throw new Error(submitBody.error || "Failed to submit approval transaction");
      }

      setTxHash(submitBody.txHash || null);
      setTxStatus("confirmed");

      onSuccess?.();

      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Approval failed");
      setTxStatus("failed");
    }
  }, [agreeToTerms, milestoneId, address, isConnected, onOpenChange, onSuccess]);

  const statusBadge = () => {
    switch (txStatus) {
      case "building":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Building transaction</Badge>;
      case "requires_signing":
        return <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600"><AlertCircle className="h-3 w-3" /> Sign in Freighter</Badge>;
      case "submitting":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Submitting</Badge>;
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Confirming</Badge>;
      case "confirmed":
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Confirmed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-accent" />
            Approve & Release Payment
          </DialogTitle>
          <DialogDescription>
            Review the milestone completion before approving payment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Project
            </h4>
            <p className="text-lg font-semibold">{projectTitle}</p>
          </div>

          <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
            <p className="text-sm text-muted-foreground mb-1">Payment Amount</p>
            <p className="text-2xl font-bold text-accent">
              ${amount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This amount will be released from escrow to the freelancer
            </p>
          </div>

          {txStatus !== "idle" && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/40">
              <span className="text-sm font-medium">Transaction Status</span>
              {statusBadge()}
            </div>
          )}

          {txHash && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-card/50 border border-border/40">
              <span className="text-xs text-muted-foreground">Tx Hash:</span>
              <code className="text-xs font-mono truncate flex-1">{txHash}</code>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/40">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">
                  Please verify:
                </p>
                <ul className="space-y-1 text-xs">
                  <li>All deliverables have been completed</li>
                  <li>Quality meets your expectations</li>
                  <li>All requirements are satisfied</li>
                </ul>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="flex items-start gap-3 cursor-pointer hover:bg-card/30 p-3 rounded-lg transition-colors">
                <Checkbox
                  checked={agreeToTerms}
                  onCheckedChange={(checked) =>
                    setAgreeToTerms(checked === true)
                  }
                  className="mt-1"
                  disabled={txStatus === "building" || txStatus === "submitting" || txStatus === "requires_signing"}
                />
                <span className="text-sm text-muted-foreground">
                  I confirm that the work is complete and satisfactory. I
                  authorize the release of ${amount.toLocaleString()} from
                  escrow.
                </span>
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={txStatus === "building" || txStatus === "submitting" || txStatus === "requires_signing"}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!agreeToTerms || txStatus === "building" || txStatus === "submitting" || txStatus === "requires_signing" || txStatus === "confirmed"}
            className="group"
          >
            {txStatus === "building" || txStatus === "submitting" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing</>
            ) : txStatus === "requires_signing" ? (
              <><AlertCircle className="mr-2 h-4 w-4" /> Sign in Freighter</>
            ) : txStatus === "confirmed" ? (
              <><CheckCircle2 className="mr-2 h-4 w-4" /> Approved</>
            ) : (
              <><CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" /> Approve & Release</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}