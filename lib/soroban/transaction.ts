import {
  TransactionBuilder,
  Operation,
  SorobanRpc,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  Keypair,
} from "@stellar/stellar-sdk";
import {
  signTransaction,
  getPublicKey,
  isConnected,
} from "@stellar/freighter-api";

export type TransactionStatus = "idle" | "building" | "awaiting_signature" | "submitting" | "pending" | "confirmed" | "failed";

export interface SorobanTransactionState {
  status: TransactionStatus;
  txHash: string | null;
  error: string | null;
  ledger: number | null;
}

export function createInitialTxState(): SorobanTransactionState {
  return {
    status: "idle",
    txHash: null,
    error: null,
    ledger: null,
  };
}

const STELLAR_RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

export async function buildAndSubmitMilestoneApproval(
  contractAddress: string,
  milestoneId: string,
  onStatusChange: (state: SorobanTransactionState) => void,
): Promise<SorobanTransactionState> {
  const state: SorobanTransactionState = { ...createInitialTxState() };

  const updateStatus = (partial: Partial<SorobanTransactionState>) => {
    Object.assign(state, partial);
    onStatusChange({ ...state });
  };

  try {
    updateStatus({ status: "building" });

    const connected = await isConnected();
    if (!connected.isConnected) {
      throw new Error("Freighter wallet is not connected. Please connect your wallet first.");
    }

    const publicKey = await getPublicKey();
    if (!publicKey) {
      throw new Error("Could not retrieve public key from Freighter.");
    }

    const server = new SorobanRpc.Server(STELLAR_RPC_URL);

    const account = await server.getAccount(publicKey);

    const contractId = contractAddress;
    const methodName = "approve";
    const methodParams = [nativeToScVal(milestoneId, { type: "symbol" })];

    const contract = new SorobanRpc.Contract(contractId);
    const tx = await contract.call(methodName, ...methodParams);

    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.extendFootprintTtl({
          extendTo: 3110400,
        }),
      )
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(transaction);
    if (SorobanRpc.isSimulationError(simulated)) {
      throw new Error(
        `Simulation failed: ${simulated.error ?? "Unknown simulation error"}`,
      );
    }

    const prepared = SorobanRpc.assembleTransaction(transaction, simulated);

    updateStatus({ status: "awaiting_signature" });

    const signedXdr = await signTransaction(prepared.toXDR(), {
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    if (!signedXdr) {
      throw new Error("User rejected the signature request.");
    }

    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    updateStatus({ status: "submitting" });

    const sendResponse = await server.sendTransaction(signedTx);

    if (sendResponse.status === "PENDING" || sendResponse.status === "DUPLICATE") {
      updateStatus({
        status: "pending",
        txHash: sendResponse.hash,
      });

      let getTxResponse;
      const maxAttempts = 30;
      const pollIntervalMs = 1000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        getTxResponse = await server.getTransaction(sendResponse.hash);

        if (getTxResponse.status === "SUCCESS") {
          updateStatus({
            status: "confirmed",
            txHash: sendResponse.hash,
            ledger: getTxResponse.ledger,
            error: null,
          });
          return { ...state };
        }

        if (getTxResponse.status === "FAILED") {
          const result = getTxResponse.resultXdr;

          let errorMessage = "Transaction failed on chain.";
          if (result) {
            try {
              const decoded = xdr.TransactionResult.fromXDR(result, "base64");
              if (decoded.result().switch().name === "txFAILED") {
                errorMessage = `Transaction failed: ${decoded.result().switch().name}`;
              }
            } catch {
              errorMessage = "Transaction failed: unknown error";
            }
          }

          updateStatus({
            status: "failed",
            txHash: sendResponse.hash,
            error: errorMessage,
          });
          return { ...state };
        }
      }

      updateStatus({
        status: "failed",
        txHash: sendResponse.hash,
        error: "Transaction timed out while waiting for confirmation.",
      });
      return { ...state };
    }

    updateStatus({
      status: "failed",
      txHash: sendResponse.hash,
      error: `Transaction submission failed: ${sendResponse.errorResult?.result?.switch()?.name ?? "Unknown error"}`,
    });
    return { ...state };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    updateStatus({
      status: "failed",
      error: message,
    });
    return { ...state };
  }
}
