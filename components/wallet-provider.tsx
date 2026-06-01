"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
} from "@stellar/freighter-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StellarNetwork = "TESTNET" | "PUBLIC" | "UNKNOWN";

export const REQUIRED_NETWORK: StellarNetwork = "TESTNET";

interface WalletState {
  /** Public key of the connected wallet, or null if disconnected */
  address: string | null;
  /** Whether Freighter is connected */
  isConnected: boolean;
  /** The network Freighter is currently set to */
  network: StellarNetwork;
  /** True when the user is connected but NOT on the required network */
  isWrongNetwork: boolean;
  /** True while the initial check is in-flight */
  isInitializing: boolean;
  /** True while a connect request is pending */
  isConnecting: boolean;
  /** Any Freighter or connection error */
  error: string | null;
}

interface WalletContext extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StellarWalletContext = createContext<WalletContext | null>(null);

const LS_ADDRESS_KEY = "stellar_wallet_address";
const POLL_INTERVAL_MS = 3_000;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StellarWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    network: "UNKNOWN",
    isWrongNetwork: false,
    isInitializing: true,
    isConnecting: false,
    error: null,
  });

  // Track whether the provider is still mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Derive the unified wallet state from the raw Freighter API responses. */
  const syncFromFreighter = useCallback(async (): Promise<void> => {
    try {
      const connectedRes = await isConnected();

      if (!connectedRes.isConnected) {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          address: null,
          isConnected: false,
          network: "UNKNOWN",
          isWrongNetwork: false,
          isInitializing: false,
        }));
        return;
      }

      const [addressRes, networkRes] = await Promise.all([
        getAddress(),
        getNetwork(),
      ]);

      if (!mountedRef.current) return;

      const address =
        !addressRes.error && addressRes.address ? addressRes.address : null;
      const network = (
        !networkRes.error && networkRes.network
          ? networkRes.network.toUpperCase()
          : "UNKNOWN"
      ) as StellarNetwork;

      const isWrongNetwork = !!address && network !== REQUIRED_NETWORK;

      setState((prev) => ({
        ...prev,
        address,
        isConnected: !!address,
        network,
        isWrongNetwork,
        isInitializing: false,
      }));

      // Keep localStorage in sync
      if (address) {
        localStorage.setItem(LS_ADDRESS_KEY, address);
      } else {
        localStorage.removeItem(LS_ADDRESS_KEY);
      }
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, isInitializing: false }));
    }
  }, []);

  // ── Initial sync + polling ─────────────────────────────────────────────────

  useEffect(() => {
    // Small delay to let the Freighter extension inject into the page
    const initTimer = setTimeout(syncFromFreighter, 500);
    const pollTimer = setInterval(syncFromFreighter, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initTimer);
      clearInterval(pollTimer);
    };
  }, [syncFromFreighter]);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const accessRes = await requestAccess();
      if (accessRes.error) {
        throw new Error(
          accessRes.error.message || "Connection request was rejected."
        );
      }

      // After requesting access, do a full sync to pick up address + network
      await syncFromFreighter();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet.";
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, error: message }));
      }
    } finally {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isConnecting: false }));
      }
    }
  }, [syncFromFreighter]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    localStorage.removeItem(LS_ADDRESS_KEY);
    localStorage.removeItem("tc_dev_access_token");
    setState((prev) => ({
      ...prev,
      address: null,
      isConnected: false,
      network: "UNKNOWN",
      isWrongNetwork: false,
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: WalletContext = {
    ...state,
    connect,
    disconnect,
    clearError,
  };

  return (
    <StellarWalletContext.Provider value={value}>
      {children}
    </StellarWalletContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Access the global Stellar wallet state and actions from any client component. */
export function useStellarWallet(): WalletContext {
  const ctx = useContext(StellarWalletContext);
  if (!ctx) {
    throw new Error(
      "useStellarWallet must be used within a <StellarWalletProvider>."
    );
  }
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Shorten a Stellar public key for display: `GABCD...XY2T` */
export function truncateStellarAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}

/** Human-friendly label for a network type */
export function networkLabel(network: StellarNetwork): string {
  const labels: Record<StellarNetwork, string> = {
    TESTNET: "Testnet",
    PUBLIC: "Mainnet",
    UNKNOWN: "Unknown",
  };
  return labels[network];
}
