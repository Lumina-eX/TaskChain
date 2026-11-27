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
  isSubmitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProposalConfirmDialog({
  open,
  action,
  freelancerName,
  submitting,
  isSubmitting,
  error = null,
  onCancel,
  onConfirm,
}: Props) {
  const busy = submitting ?? isSubmitting ?? false;
  const isAccept = action === "accept";
  const isShortlist = action === "shortlist";
  const name = freelancerName ?? "this freelancer";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isShortlist ? "Shortlist proposal?" : isAccept ? "Accept proposal?" : "Reject proposal?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isShortlist
              ? `Shortlist ${name}'s proposal for further review.`
              : isAccept
              ? `Accepting ${name}'s proposal will select it for this project. Only one proposal can be accepted.`
              : `Rejecting ${name}'s proposal will notify them and close it for this project.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={busy}
            aria-busy={busy}
          >
            {busy
              ? isAccept
                ? "Accepting..."
                : "Rejecting..."
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
