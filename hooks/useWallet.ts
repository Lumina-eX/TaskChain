"use client";

import { useState, useEffect } from "react";
import { isConnected, requestAccess, getAddress } from "@stellar/freighter-api";

export function useWallet() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("walletAddress");
    if (saved) {
      setWalletAddress(saved);
    }
  }, []);

  const connectWallet = async () => {
    try {
      await requestAccess();

      const result = await getAddress();

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.address) {
        throw new Error("No address returned");
      }

      setWalletAddress(result.address);
      localStorage.setItem("walletAddress", result.address);
    } catch (error) {
      console.error("Wallet connection failed:", error);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    localStorage.removeItem("walletAddress");
  };

  return {
    walletAddress,
    isConnected: !!walletAddress,
    connectWallet,
    disconnectWallet,
  };
}
