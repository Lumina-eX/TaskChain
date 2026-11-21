import * as React from "react";

type ProposalSkeletonProps = {
  className?: string;
  "aria-label"?: string;
};

export function ProposalSkeleton({
  className,
  "aria-label": ariaLabel = "Loading proposal",
}: ProposalSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={ariaLabel}
      className={[
        "w-full animate-pulse rounded-lg border p-4 sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <span className="sr-only">{ariaLabel}</span>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 max-w-full rounded bg-muted sm:w-40" />
          <div className="h-3 w-20 max-w-full rounded bg-muted sm:w-24" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-6 w-16 rounded-full bg-muted" />
        <div className="h-6 w-20 rounded-full bg-muted" />
        <div className="h-6 w-14 rounded-full bg-muted" />
      </div>
    </div>
  );
}

export function ProposalSkeletonList({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={["grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", className ?? ""]
        .join(" ")
        .trim()}
    >
      {Array.from({ length: count }, (_, index) => (
        <ProposalSkeleton key={index} aria-label={`Loading proposal ${index + 1} of ${count}`} />
      ))}
    </div>
  );
}
