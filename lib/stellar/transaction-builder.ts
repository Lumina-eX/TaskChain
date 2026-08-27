/**
 * Stellar Transaction Builder Utility
 * 
 * Helper functions for building Stellar transactions for escrow funding.
 * This utility uses the @stellar/stellar-sdk to create proper payment transactions.
 */

import {
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";

export interface BuildPaymentTransactionParams {
  fromAddress: string;
  toAddress: string;
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
  networkPassphrase: string;
  memo?: string;
}

export interface BuiltTransaction {
  xdr: string;
  transaction: TransactionBuilder;
}

/**
 * Build a Stellar payment transaction for funding an escrow contract
 */
export function buildPaymentTransaction(
  params: BuildPaymentTransactionParams
): BuiltTransaction {
  const {
    fromAddress,
    toAddress,
    amount,
    assetCode = "XLM",
    assetIssuer,
    networkPassphrase,
    memo,
  } = params;

  // Determine the asset (XLM or custom asset like USDC)
  const asset =
    assetCode === "XLM" || !assetIssuer
      ? Asset.native()
      : new Asset(assetCode, assetIssuer);

  // Create a new transaction builder
  const account = new Keypair({ publicKey: fromAddress }).account({
    sequence: "0", // Will be updated by the wallet
    balance: "0",
  });

  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  // Add memo if provided
  if (memo) {
    builder = builder.addMemo(TransactionBuilder.Memo.text(memo));
  }

  // Add payment operation
  builder = builder.addOperation(
    Operation.payment({
      destination: toAddress,
      asset,
      amount: amount.toString(),
    })
  );

  // Set a timeout (300 seconds = 5 minutes)
  builder = builder.setTimeout(300);

  // Build the transaction
  const transaction = builder.build();

  return {
    xdr: transaction.toXDR(),
    transaction,
  };
}

/**
 * Parse and validate a Stellar transaction XDR
 */
export function parseTransactionXDR(xdr: string): TransactionBuilder {
  try {
    return TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  } catch (error) {
    throw new Error("Invalid transaction XDR");
  }
}

/**
 * Get the appropriate network passphrase based on network type
 */
export function getNetworkPassphrase(network: "TESTNET" | "PUBLIC"): string {
  return network === "TESTNET"
    ? Networks.TESTNET
    : Networks.PUBLIC;
}

/**
 * Validate that an amount is a valid Stellar amount format
 */
export function validateStellarAmount(amount: string): boolean {
  const regex = /^\d+(\.\d{1,7})?$/;
  return regex.test(amount) && parseFloat(amount) > 0;
}

/**
 * Convert a decimal amount to stroops (the smallest unit of XLM)
 * 1 XLM = 10,000,000 stroops
 */
export function amountToStroops(amount: string): bigint {
  const decimal = parseFloat(amount);
  return BigInt(Math.floor(decimal * 10_000_000));
}

/**
 * Convert stroops to decimal amount
 */
export function stroopsToAmount(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toString();
}
