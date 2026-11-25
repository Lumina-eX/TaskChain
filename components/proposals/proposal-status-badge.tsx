import { Badge } from "@/components/ui/badge";
import type { ProposalStatus } from "@/lib/proposals";

const STYLES: Record<ProposalStatus, string> = {
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  under_review: "bg-blue-100 text-blue-800 border-blue-200",
  accepted: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  updated: "bg-blue-100 text-blue-800 border-blue-200",
};

const LABELS: Record<ProposalStatus, string> = {
  submitted: "Submitted",
  under_review: "Shortlisted",
  accepted: "Accepted",
  rejected: "Rejected",
  updated: "Updated",
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status]}
    </Badge>
  );
}