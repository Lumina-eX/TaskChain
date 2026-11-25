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
  action: "shortlist" | "accept" | "reject" | null;
  freelancerName?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProposalConfirmDialog({
  open,
  action,
  freelancerName,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const isAccept = action === "accept";
  const isShortlist = action === "shortlist";
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isShortlist ? "Shortlist proposal?" : isAccept ? "Accept proposal?" : "Reject proposal?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isShortlist
              ? `Shortlist ${freelancerName ?? "this freelancer"}'s proposal for further review.`
              : isAccept
              ? `Accepting ${freelancerName ?? "this freelancer"}'s proposal will select it for this project. Only one proposal can be accepted.`
              : `Reject ${freelancerName ?? "this freelancer"}'s proposal and close it for this project.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={submitting} onClick={onConfirm}>
            {submitting
              ? "Saving..."
              : isShortlist
              ? "Shortlist"
              : isAccept
              ? "Accept"
              : "Reject"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}