"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useStellarWallet, REQUIRED_NETWORK } from "@/components/wallet-provider";

const NETWORK_GUIDE: Record<string, string> = {
  TESTNET: "Test SDF Network ; September 2015",
  PUBLIC: "Public Global Stellar Network ; September 2015",
};

/**
 * Sticky top banner shown when the connected wallet is on the wrong network.
 * Instructs the user to switch networks inside their Freighter extension.
 * Dismissible per session (re-appears on next load until the issue is fixed).
 */
export function NetworkBanner() {
  const { isConnected, isWrongNetwork, network } = useStellarWallet();
  const [dismissed, setDismissed] = useState(false);

  if (!isConnected || !isWrongNetwork || dismissed) return null;

  const requiredNetworkName = NETWORK_GUIDE[REQUIRED_NETWORK] ?? REQUIRED_NETWORK;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-[60] w-full bg-amber-500/95 text-amber-950 dark:bg-amber-600/95 dark:text-amber-50 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-2.5 sm:px-6 sm:items-center">
        <div className="flex items-start gap-3 sm:items-center">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" aria-hidden="true" />
          <p className="text-sm font-medium leading-snug">
            <span className="font-bold">Wrong Network Detected</span>
            {network !== "UNKNOWN" && (
              <span> — you&apos;re currently on <span className="font-semibold">{network === "PUBLIC" ? "Mainnet" : network}</span>.</span>
            )}{" "}
            TaskChain runs on{" "}
            <span className="font-bold">Stellar Testnet</span>. Please open
            your{" "}
            <span className="font-bold">Freighter wallet extension</span>,
            go to{" "}
            <span className="italic">Settings → Network</span>, and switch
            to &ldquo;<span className="font-bold">{requiredNetworkName}</span>&rdquo;.
          </p>
        </div>

        <button
          id="network-banner-dismiss"
          aria-label="Dismiss network warning"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 opacity-80 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-950/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
