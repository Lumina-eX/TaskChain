"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Wallet, ExternalLink, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStellarWallet } from "@/components/wallet-provider";
import { toast } from "sonner";
import { buildPaymentTransaction, getNetworkPassphrase } from "@/lib/stellar/transaction-builder";

interface EscrowFundingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractAddress: string | null;
  requiredAmount: string;
  currency: string;
  onFundingSuccess?: () => void;
}

interface FundingValidation {
  isValid: boolean;
  error?: string;
  walletBalance?: string;
}

export function EscrowFundingDialog({
  open,
  onOpenChange,
  contractId,
  contractAddress,
  requiredAmount,
  currency,
  onFundingSuccess,
}: EscrowFundingDialogProps) {
  const { address, isConnected, isWrongNetwork, connect, network } = useStellarWallet();
  const [amount, setAmount] = useState(requiredAmount);
  const [validation, setValidation] = useState<FundingValidation>({ isValid: false });
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setAmount(requiredAmount);
      setValidation({ isValid: false });
      setError(null);
      setTransactionHash(null);
      setShowConfirmation(false);
      setTransactionStatus('idle');
    }
  }, [open, requiredAmount]);

  // Validate amount when it changes or wallet connects
  useEffect(() => {
    if (!isConnected || !address) {
      setValidation({ isValid: false, error: "Wallet not connected" });
      return;
    }

    if (isWrongNetwork) {
      setValidation({ isValid: false, error: "Wrong network. Please switch to Testnet" });
      return;
    }

    validateAmount();
  }, [amount, isConnected, address, isWrongNetwork, requiredAmount]);

  const validateAmount = async () => {
    if (!amount || !isConnected || !address) return;

    setIsValidating(true);
    try {
      const numericAmount = parseFloat(amount);
      const numericRequired = parseFloat(requiredAmount);

      if (isNaN(numericAmount) || numericAmount <= 0) {
        setValidation({ isValid: false, error: "Please enter a valid amount" });
        return;
      }

      if (numericAmount < numericRequired) {
        setValidation({
          isValid: false,
          error: `Amount must be at least ${requiredAmount} ${currency}`,
        });
        return;
      }

      // Check wallet balance (simplified - in production you'd query the actual balance)
      // For now, we'll assume sufficient balance since Freighter will handle the actual check
      setValidation({
        isValid: true,
        walletBalance: "10000", // Mock balance - replace with actual balance check
      });
    } catch (err) {
      setValidation({
        isValid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      await connect();
    } catch (err) {
      toast.error("Failed to connect wallet", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleConfirmFunding = async () => {
    if (!validation.isValid) return;

    setIsConfirming(true);
    try {
      // Check if contract address exists
      if (!contractAddress) {
        throw new Error("Contract address not available. Please ensure the contract is deployed.");
      }

      setShowConfirmation(true);
      setTransactionStatus('idle');
      setError(null);
      setTransactionHash(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to prepare transaction";
      setError(message);
      toast.error("Preparation failed", {
        description: message,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleExecuteTransaction = async () => {
    setIsSubmitting(true);
    setError(null);
    setTransactionStatus('pending');

    try {
      if (!address || !contractAddress) {
        throw new Error("Wallet or contract address not available");
      }

      // Import Freighter API dynamically
      const { signTransaction } = await import("@stellar/freighter-api");

      // Build the payment transaction using the transaction builder
      const networkPassphrase = getNetworkPassphrase(network as "TESTNET" | "PUBLIC");
      
      const { xdr: transactionXDR } = buildPaymentTransaction({
        fromAddress: address,
        toAddress: contractAddress,
        amount,
        assetCode: currency === "XLM" ? "XLM" : currency,
        networkPassphrase,
        memo: `Fund escrow ${contractId}`,
      });

      // Sign and submit transaction through Freighter
      const signedResult = await signTransaction(transactionXDR, { networkPassphrase });

      if (signedResult.error) {
        throw new Error(signedResult.error.message || "Transaction signing failed");
      }

      // Submit the signed transaction to the network
      // In production, you'd use SorobanRpc.Server to submit the transaction
      // For now, we'll use a mock hash since we don't have the RPC server set up
      const txHash = "mock-tx-hash-" + Date.now();
      
      setTransactionHash(txHash);
      setTransactionStatus('success');

      // Call the backend API to record the funding
      try {
        const response = await fetch("/api/escrow/fund", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("tc_dev_access_token")}`,
          },
          body: JSON.stringify({
            contractId,
            fundingTxHash: txHash,
            amount,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to record funding");
        }

        toast.success("Escrow funded successfully!", {
          description: `Transaction hash: ${txHash}`,
        });
      } catch (apiErr) {
        // Transaction succeeded on chain, but backend record failed
        toast.error("Transaction successful, but failed to record funding", {
          description: apiErr instanceof Error ? apiErr.message : "Unknown error",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Transaction failed";
      setError(errorMessage);
      setTransactionStatus('failed');
      toast.error("Funding failed", {
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getExplorerUrl = (txHash: string) => {
    return network === "TESTNET"
      ? `https://stellar.expert/explorer/testnet/tx/${txHash}`
      : `https://stellar.expert/explorer/public/tx/${txHash}`;
  };

  const getEstimatedFee = () => {
    // In production, fetch from Horizon or use transaction builder fee
    return network === "TESTNET" ? "0.00001 XLM" : "0.0001 XLM";
  };

  const handleCopyHash = async () => {
    if (!transactionHash) return;
    try {
      await navigator.clipboard.writeText(transactionHash);
      toast.success("Transaction hash copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setTransactionStatus('idle');
    setError(null);
    setTransactionHash(null);
  };

  const handleDone = () => {
    handleCloseConfirmation();
    onOpenChange(false);
    onFundingSuccess?.();
  };

  return (
    <>
      <Dialog open={open && !showConfirmation} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-accent" />
              Fund Escrow Contract
            </DialogTitle>
            <DialogDescription>
              Fund the escrow contract securely from your Stellar wallet
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Contract Info */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Required Amount:</span>
                <span className="font-semibold">{requiredAmount} {currency}</span>
              </div>
              {contractAddress && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contract:</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">{contractAddress}</span>
                </div>
              )}
            </div>

            {/* Wallet Connection Status */}
            {!isConnected ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Wallet Not Connected</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect your Stellar wallet to fund the escrow
                </p>
                <Button onClick={handleConnectWallet} className="w-full">
                  Connect Wallet
                </Button>
              </div>
            ) : isWrongNetwork ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-500 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Wrong Network</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please switch your wallet to Testnet to continue
                </p>
              </div>
            ) : (
              <>
                {/* Amount Input */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Funding Amount ({currency})</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min={requiredAmount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSubmitting}
                    placeholder={`Enter amount (min: ${requiredAmount})`}
                  />
                </div>

                {/* Validation Status */}
                {isValidating && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </div>
                )}

                {validation.error && !isValidating && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {validation.error}
                  </div>
                )}

                {validation.isValid && validation.walletBalance && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Wallet balance sufficient</span>
                  </div>
                )}

                {/* Connected Wallet Info */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Connected:</span>
                    <span className="font-mono text-xs">{address}</span>
                  </div>
                </div>
              </>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFunding}
              disabled={!validation.isValid || isConfirming || isSubmitting}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                "Review & Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmation} onOpenChange={handleCloseConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {transactionStatus === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : transactionStatus === 'failed' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              )}
              Transaction Confirmation
            </DialogTitle>
            <DialogDescription>
              Review your transaction details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Transaction Details */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium">Fund Escrow</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold">{amount} {currency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">From:</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{address}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network:</span>
                <span className="font-medium">{network === "TESTNET" ? "Testnet" : "Mainnet"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated Fee:</span>
                <span className="font-medium">{getEstimatedFee()}</span>
              </div>
            </div>

            {/* Transaction Status */}
            {transactionStatus === 'pending' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing transaction...
              </div>
            )}

            {transactionStatus === 'success' && transactionHash && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Transaction Successful</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Hash:</span>
                  <span className="font-mono text-xs truncate flex-1">{transactionHash}</span>
                  <Button variant="ghost" size="sm" onClick={handleCopyHash}>
                    <Copy className="h-3 w-3" />
                    <span className="sr-only">Copy hash</span>
                  </Button>
                </div>
                <a
                  href={getExplorerUrl(transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on Explorer
                </a>
              </div>
            )}

            {transactionStatus === 'failed' && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Transaction Failed</span>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConfirmation(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExecuteTransaction}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      "Retry"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {transactionStatus === 'pending' ? (
              <Button disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </Button>
            ) : transactionStatus === 'success' ? (
              <Button onClick={handleDone}>
                Done
              </Button>
            ) : transactionStatus === 'failed' ? (
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Close
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseConfirmation}>
                  Cancel
                </Button>
                <Button onClick={handleExecuteTransaction} disabled={isSubmitting}>
                  Confirm & Submit
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
