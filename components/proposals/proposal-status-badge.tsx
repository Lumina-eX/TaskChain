import { Badge } from "@/components/ui/badge";
import type { ProposalStatus } from "@/lib/proposals/types";

const STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  shortlisted: "bg-purple-100 text-purple-800 border-purple-200",
  accepted: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  updated: "bg-blue-100 text-blue-800 border-blue-200",
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus | "shortlisted" }) {
  return (
    <Badge variant="outline" className={STYLES[status] ?? ""}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
