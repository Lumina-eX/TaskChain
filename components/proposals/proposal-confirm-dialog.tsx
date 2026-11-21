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
  isSubmitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProposalConfirmDialog({
  open,
  action,
  freelancerName,
  isSubmitting = false,
  error = null,
  onCancel,
  onConfirm,
}: Props) {
  const isAccept = action === "accept";
  const name = freelancerName ?? "this freelancer";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAccept ? "Accept proposal?" : "Reject proposal?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAccept
              ? `Accepting ${name}'s proposal will notify them and start the project.`
              : `Rejecting ${name}'s proposal will notify them.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting
              ? isAccept
                ? "Accepting..."
                : "Rejecting..."
              : isAccept
                ? "Accept"
                : "Reject"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
