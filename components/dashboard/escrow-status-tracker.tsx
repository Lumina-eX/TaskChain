import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const escrowStages = [
  "Funded",
  "In Progress",
  "Submitted",
  "Approved",
  "Released",
] as const;

export type EscrowStage = (typeof escrowStages)[number];

interface EscrowStatusTrackerProps {
  currentStage: EscrowStage;
  className?: string;
}

export function EscrowStatusTracker({
  currentStage,
  className,
}: EscrowStatusTrackerProps) {
  const currentStageIndex = escrowStages.indexOf(currentStage);

  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/50 p-4 md:p-6", className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Escrow Status</h3>
          <p className="text-sm text-muted-foreground">Track your transaction lifecycle</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {currentStage}
        </span>
      </div>

      <ol className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-2">
        {escrowStages.map((stage, index) => {
          const isComplete = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <li key={stage} className="flex flex-1 items-center gap-3 md:flex-col md:items-center md:gap-2">
              <div className="flex w-full items-center gap-3 md:flex-col md:gap-2">
                <div
                  className={cn(
                    "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    isComplete && "border-accent bg-accent text-accent-foreground",
                    isCurrent && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.2)]",
                    isPending && "border-muted-foreground/30 bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>

                {index < escrowStages.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 rounded-full md:h-0.5 md:w-full",
                      isComplete ? "bg-accent" : "bg-border/60",
                    )}
                  />
                )}
              </div>

              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent && "text-primary",
                    isComplete && "text-accent",
                    isPending && "text-muted-foreground",
                  )}
                >
                  {stage}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
