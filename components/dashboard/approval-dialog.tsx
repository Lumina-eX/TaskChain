"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Clock,
} from "lucide-react";
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
import {
  buildAndSubmitMilestoneApproval,
  type SorobanTransactionState,
  createInitialTxState,
} from "@/lib/soroban/transaction";
import { useStellarWallet } from "@/components/wallet-provider";

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectTitle: string;
  amount: number;
  contractAddress?: string;
  milestoneId?: string;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  projectTitle,
  amount,
  contractAddress,
  milestoneId,
}: ApprovalDialogProps) {
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [txState, setTxState] = useState<SorobanTransactionState>(
    createInitialTxState()
  );
  const { isConnected, address, connect } = useStellarWallet();

  const handleApprove = useCallback(async () => {
    if (!agreeToTerms) return;

    if (!isConnected) {
      await connect();
      return;
    }

    if (!contractAddress || !milestoneId) {
      setTxState({
        status: "failed",
        txHash: null,
        error: "Missing contract or milestone configuration.",
        ledger: null,
      });
      return;
    }

    await buildAndSubmitMilestoneApproval(
      contractAddress,
      milestoneId,
      (newState) => setTxState({ ...newState })
    );
  }, [agreeToTerms, isConnected, connect, contractAddress, milestoneId]);

  const handleClose = () => {
    if (txState.status === "submitting" || txState.status === "pending") return;
    onOpenChange(false);
    setTimeout(() => {
      setTxState(createInitialTxState());
      setAgreeToTerms(false);
    }, 200);
  };

  const stellerExpertUrl = txState.txHash
    ? `https://stellar.expert/explorer/testnet/tx/${txState.txHash}`
    : null;

  const statusBadge = () => {
    switch (txState.status) {
      case "building":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Building Transaction</Badge>;
      case "awaiting_signature":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30"><ExternalLink className="h-3 w-3 mr-1" />Awaiting Signature</Badge>;
      case "submitting":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Submitting</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30"><Clock className="h-3 w-3 mr-1" />Pending Confirmation</Badge>;
      case "confirmed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case "failed":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return null;
    }
  };

  const isProcessing = ["building", "awaiting_signature", "submitting", "pending"].includes(txState.status);
  const isComplete = txState.status === "confirmed";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-accent" />
            Approve & Release Payment
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? "Milestone approval transaction confirmed on-chain."
              : txState.status === "failed"
                ? "Transaction failed. Please try again."
                : "Review the milestone completion before approving payment"}
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

          <div className="flex items-center justify-center gap-2 text-sm">
            {statusBadge()}
          </div>

          {txState.status === "confirmed" && txState.ledger && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm">
              <p className="font-semibold text-green-600 dark:text-green-400 mb-1">
                Transaction Confirmed
              </p>
              <p className="text-xs text-muted-foreground">
                Confirmed in ledger #{txState.ledger}
              </p>
              {stellerExpertUrl && (
                <a
                  href={stellerExpertUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-1"
                >
                  View on Stellar Expert <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {txState.status === "failed" && txState.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
              <p className="font-semibold text-red-600 dark:text-red-400 mb-1">
                Transaction Failed
              </p>
              <p className="text-xs text-muted-foreground">{txState.error}</p>
            </div>
          )}

          {!isComplete && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/40">
                <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">
                    Please verify:
                  </p>
                  <ul className="space-y-1 text-xs">
                    <li>✓ All deliverables have been completed</li>
                    <li>✓ Quality meets your expectations</li>
                    <li>✓ All requirements are satisfied</li>
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
                    disabled={isProcessing}
                  />
                  <span className="text-sm text-muted-foreground">
                    I confirm that the work is complete and satisfactory. I
                    authorize the release of ${amount.toLocaleString()} from
                    escrow.
                  </span>
                </Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isComplete && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                {txState.status === "failed" ? "Dismiss" : "Cancel"}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={!agreeToTerms || isProcessing}
                className="group"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                    {txState.status === "failed" ? "Retry" : "Approve & Release"}
                  </>
                )}
              </Button>
            </>
          )}
          {isComplete && (
            <Button onClick={handleClose} className="w-full">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
