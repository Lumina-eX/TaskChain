"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  action: "accept" | "reject" | null;
  freelancerName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProposalConfirmDialog({
  open,
  action,
  freelancerName,
  onCancel,
  onConfirm,
}: Props) {
  const isAccept = action === "accept";
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAccept ? "Accept proposal?" : "Reject proposal?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAccept
              ? `Accepting ${freelancerName ?? "this freelancer"}'s proposal will notify them and start the project.`
              : `Rejecting ${freelancerName ?? "this freelancer"}'s proposal will notify them.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isAccept ? "Accept" : "Reject"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}