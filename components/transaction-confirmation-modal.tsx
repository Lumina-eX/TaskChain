"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionHash } from "@/components/stellar/TransactionHash";
import type { StellarNetwork } from "@/components/wallet-provider";

interface TransactionConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: StellarNetwork;
  hash?: string;
  status?: "pending" | "success" | "failed";
}

export function TransactionConfirmationModal({
  open,
  onOpenChange,
  network,
  hash,
  status = "pending",
}: TransactionConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {status === "pending" ? "Processing transaction…" : status === "success" ? "Transaction complete" : "Transaction failed"}
          </p>
          {hash && <TransactionHash hash={hash} network={network} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
