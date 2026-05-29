"use client";
import { useState } from "react";
import { ShieldCheck, Star, Scale, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeType =
  | "verified-freelancer"
  | "top-rated"
  | "dispute-free"
  | "100-completion";

export type BadgeSize = "sm" | "md" | "lg";

export interface ReputationBadgeProps {
  type: BadgeType;
  txHash?: string;
  explorerUrl?: string;
  verify?: (txHash?: string) => Promise<boolean>;
  size?: BadgeSize;
  showLabel?: boolean;
  className?: string;
}

type BadgeMeta = {
  label: string;
  description: string;
  Icon: typeof ShieldCheck;
  containerClass: string;
  iconClass: string;
  ringClass: string;
};

const BADGES: Record<BadgeType, BadgeMeta> = {
  "verified-freelancer": {
    label: "Verified Freelancer",
    description: "Identity verified on-chain via attestation.",
    Icon: ShieldCheck,
    containerClass:
      "bg-[var(--badge-verified-bg)] text-[var(--badge-verified-fg)] border-[var(--badge-verified-border)]",
    iconClass: "text-[var(--badge-verified-fg)]",
    ringClass: "ring-[var(--badge-verified-fg)]/30",
  },
  "top-rated": {
    label: "Top Rated",
    description: "Consistently rated 4.8★ or higher by clients.",
    Icon: Star,
    containerClass:
      "bg-[var(--badge-top-bg)] text-[var(--badge-top-fg)] border-[var(--badge-top-border)]",
    iconClass: "text-[var(--badge-top-fg)]",
    ringClass: "ring-[var(--badge-top-fg)]/30",
  },
  "dispute-free": {
    label: "Dispute-Free",
    description: "No client disputes recorded on-chain.",
    Icon: Scale,
    containerClass:
      "bg-[var(--badge-dispute-bg)] text-[var(--badge-dispute-fg)] border-[var(--badge-dispute-border)]",
    iconClass: "text-[var(--badge-dispute-fg)]",
    ringClass: "ring-[var(--badge-dispute-fg)]/30",
  },
  "100-completion": {
    label: "100% Completion",
    description: "Every contract delivered and accepted on-chain.",
    Icon: CheckCircle2,
    containerClass:
      "bg-[var(--badge-completion-bg)] text-[var(--badge-completion-fg)] border-[var(--badge-completion-border)]",
    iconClass: "text-[var(--badge-completion-fg)]",
    ringClass: "ring-[var(--badge-completion-fg)]/30",
  },
};

const SIZES: Record<
  BadgeSize,
  { wrap: string; icon: string; text: string; gap: string }
> = {
  sm: {
    wrap: "px-2 py-1 rounded-md",
    icon: "h-3.5 w-3.5",
    text: "text-xs",
    gap: "gap-1",
  },
  md: {
    wrap: "px-3 py-1.5 rounded-lg",
    icon: "h-4 w-4",
    text: "text-sm",
    gap: "gap-1.5",
  },
  lg: {
    wrap: "px-4 py-2 rounded-xl",
    icon: "h-5 w-5",
    text: "text-base",
    gap: "gap-2",
  },
};

const explorer = "https://etherscan.io/tx/";
const demoHash =
  "0x9f2c1a7b4e6d3f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a";

const verifyTest = async (hash?: string) => {
  await new Promise((r) => setTimeout(r, 700));
  return Boolean(hash);
};

export function ReputationBadge({
  type,
  txHash = demoHash,
  explorerUrl = explorer,
  verify = verifyTest,
  size = "md",
  showLabel = true,
  className,
}: ReputationBadgeProps) {
  const meta = BADGES[type];
  const sizing = SIZES[size];
  const { Icon } = meta;

  const [status, setStatus] = useState<
    "idle" | "verifying" | "verified" | "failed"
  >(txHash ? "idle" : "idle");

  const handleVerify = async () => {
    if (status === "verifying") return;
    setStatus("verifying");
    try {
      const ok = verify ? await verify(txHash) : Boolean(txHash);
      setStatus(ok ? "verified" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={handleVerify}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleVerify();
        }
      }}
      title={`${meta.label}${explorerUrl && txHash ? ` — ${explorerUrl}${txHash}` : ""}`}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl"
    >
      <span
        role="img"
        aria-label={`${meta.label} badge${status === "verified" ? ", on-chain verified" : ""}`}
        className={cn(
          "inline-flex items-center border font-medium select-none transition-all",
          "ring-1 ring-inset",
          sizing.wrap,
          sizing.text,
          sizing.gap,
          meta.containerClass,
          meta.ringClass,
          className,
        )}
      >
        {status === "verifying" ? (
          <Loader2
            className={cn(sizing.icon, "animate-spin", meta.iconClass)}
            aria-hidden="true"
          />
        ) : (
          <Icon
            className={cn(sizing.icon, meta.iconClass)}
            aria-hidden="true"
          />
        )}
        {showLabel && <span>{meta.label}</span>}
        {status === "verified" && (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-current"
          />
        )}
      </span>
    </button>
  );
}

export interface ReputationBadgeGroupProps {
  badges: Array<Omit<ReputationBadgeProps, "size"> & { id?: string }>;
  size?: BadgeSize;
  className?: string;
}

export function ReputationBadgeGroup({
  badges,
  size = "md",
  className,
}: ReputationBadgeGroupProps) {
  return (
    <div
      role="list"
      aria-label="On-chain reputation badges"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {badges.map((b, i) => (
        <div role="listitem" key={b.id ?? `${b.type}-${i}`}>
          <ReputationBadge {...b} size={size} />
        </div>
      ))}
    </div>
  );
}

export default ReputationBadge;
