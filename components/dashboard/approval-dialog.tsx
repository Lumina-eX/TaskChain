"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
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

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectTitle: string;
  amount: number;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  projectTitle,
  amount,
}: ApprovalDialogProps) {
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    if (!agreeToTerms) return;

    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      onOpenChange(false);
      setAgreeToTerms(false);
    }, 2000);
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
          {/* Project Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Project
            </h4>
            <p className="text-lg font-semibold">{projectTitle}</p>
          </div>

          {/* Amount */}
          <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
            <p className="text-sm text-muted-foreground mb-1">Payment Amount</p>
            <p className="text-2xl font-bold text-accent">
              ${amount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This amount will be released from escrow to the freelancer
            </p>
          </div>

          {/* Confirmation */}
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

            {/* Agreement */}
            <div className="space-y-3 pt-2">
              <Label className="flex items-start gap-3 cursor-pointer hover:bg-card/30 p-3 rounded-lg transition-colors">
                <Checkbox
                  checked={agreeToTerms}
                  onCheckedChange={(checked) =>
                    setAgreeToTerms(checked === true)
                  }
                  className="mt-1"
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
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!agreeToTerms || isProcessing}
            className="group"
          >
            {isProcessing ? (
              <>Processing...</>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                Approve & Release
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
