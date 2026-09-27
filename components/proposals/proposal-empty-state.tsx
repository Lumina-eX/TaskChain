import { Card, CardContent } from "@/components/ui/card";

export function ProposalEmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="font-medium">
          {filtered ? "No proposals match your filters" : "No proposals yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {filtered
            ? "Try changing the status filter or search term."
            : "Proposals will appear here once freelancers apply to your project."}
        </p>
      </CardContent>
    </Card>
  );
}