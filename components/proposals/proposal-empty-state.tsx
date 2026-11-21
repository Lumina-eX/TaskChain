import { Card, CardContent } from "@/components/ui/card";

export function ProposalEmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <Card role="status" aria-live="polite">
      <CardContent className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center sm:py-16">
        <p className="font-medium">
          {filtered ? "No proposals match your filters" : "No proposals yet"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered
            ? "Try changing the status filter or search term."
            : "Proposals will appear here once freelancers apply to your project."}
        </p>
      </CardContent>
    </Card>
  );
}
