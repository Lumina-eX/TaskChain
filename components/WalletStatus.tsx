"use client";
import React from "react";

interface WalletStatusProps {
  isConnected: boolean;
  walletAddress?: string;
  network?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const WalletStatus = ({
  isConnected,
  walletAddress,
  network,
  onConnect,
  onDisconnect,
}: WalletStatusProps) => {
  return (
    <div className="w-80 p-6 rounded-xl shadow-md bg-white border border-gray-200">
      {/* Status Row */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            isConnected ? "bg-green-500" : "bg-gray-400"
          }`}
        ></span>

        <span
          className={`text-sm font-medium ${
            isConnected ? "text-green-600" : "text-gray-500"
          }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Connected State */}
      {isConnected && walletAddress && (
        <>
          <p className="text-gray-900 font-semibold text-sm mb-2">
            {truncateAddress(walletAddress)}
          </p>

          {network && (
            <span
              className={`inline-block px-3 py-1 text-xs rounded-full ${
                network === "Mainnet"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-purple-100 text-purple-700"
              }`}
            >
              {network}
            </span>
          )}
        </>
      )}

      {/* Disconnected State */}
      {!isConnected && (
        <button
          onClick={onConnect}
          className="mt-2 w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Connect Wallet
        </button>
      )}

      {isConnected && (
        <button onClick={onDisconnect} className="mt-3 text-sm text-red-500">
          Disconnect
        </button>
      )}
    </div>
  );
};
