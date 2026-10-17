#!/usr/bin/env bash
# deploy-testnet.sh — Deploy the escrow contract to Stellar Testnet with full
# audit record capture.
#
# Prerequisites:
#   - Run ./scripts/build-verify.sh first (or set SKIP_BUILD=1 if already built)
#   - stellar CLI available in PATH
#   - TESTNET_DEPLOYER_SECRET set in environment (never commit this value)
#
# Environment variables:
#   TESTNET_DEPLOYER_SECRET  — Stellar secret key for the deployer account (required)
#   SKIP_BUILD               — Set to 1 to skip the build step
#   SOROBAN_RPC_URL          — Override RPC endpoint (default: Testnet horizon RPC)
#   INIT_ADMIN               — Admin address for initialize() call
#   INIT_CLIENT              — Client address for initialize() call
#   INIT_FREELANCER          — Freelancer address for initialize() call
#   INIT_ARBITER             — Arbiter address for initialize() call
#   INIT_TOKEN               — Token contract address for initialize() call
#
# Outputs:
#   contracts/deployments/testnet-<timestamp>.json — immutable deployment record

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$CONTRACTS_ROOT/artifacts"
DEPLOYMENTS_DIR="$CONTRACTS_ROOT/deployments"
NETWORK="testnet"
SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# ---------------------------------------------------------------------------
log()  { echo "[deploy-testnet] $*"; }
fail() { echo "[deploy-testnet] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Guard: secrets must never be empty
# ---------------------------------------------------------------------------
[ -n "${TESTNET_DEPLOYER_SECRET:-}" ] \
  || fail "TESTNET_DEPLOYER_SECRET is not set. Export it before running this script."

# Confirm we are targeting Testnet passphrase, never Mainnet
if echo "${STELLAR_NETWORK_PASSPHRASE:-}" | grep -q "Public Global Stellar Network"; then
  fail "STELLAR_NETWORK_PASSPHRASE points to Mainnet. Aborting Testnet deployment."
fi

# ---------------------------------------------------------------------------
# Build step
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "Running build-verify.sh..."
  bash "$SCRIPT_DIR/build-verify.sh"
fi

WASM_PATH="$ARTIFACTS_DIR/escrow.wasm"
HASH_FILE="$ARTIFACTS_DIR/escrow.wasm.sha256"
BUILD_INFO="$ARTIFACTS_DIR/build-info.json"

[ -f "$WASM_PATH" ]   || fail "Artifact not found: $WASM_PATH. Run build-verify.sh first."
[ -f "$HASH_FILE" ]   || fail "Hash file not found: $HASH_FILE. Run build-verify.sh first."
[ -f "$BUILD_INFO" ]  || fail "Build info not found: $BUILD_INFO. Run build-verify.sh first."

WASM_HASH=$(awk '{print $1}' "$HASH_FILE")
log "WASM hash: $WASM_HASH"

# ---------------------------------------------------------------------------
# Tooling validation
# ---------------------------------------------------------------------------
command -v stellar >/dev/null 2>&1 \
  || fail "'stellar' CLI not found. Install: https://github.com/stellar/stellar-cli"

# ---------------------------------------------------------------------------
# Network validation
# ---------------------------------------------------------------------------
log "Validating network connectivity to $SOROBAN_RPC_URL ..."
curl -sf --max-time 10 "$SOROBAN_RPC_URL" -o /dev/null \
  || fail "Cannot reach RPC endpoint $SOROBAN_RPC_URL. Check connectivity."
log "Network check passed."

# Derive deployer public key from secret
DEPLOYER_ADDRESS=$(stellar keys address --secret-key "$TESTNET_DEPLOYER_SECRET" 2>/dev/null) \
  || fail "Could not derive public key from TESTNET_DEPLOYER_SECRET. Verify the key is valid."
log "Deployer address: $DEPLOYER_ADDRESS"

# ---------------------------------------------------------------------------
# Upload (install) WASM
# ---------------------------------------------------------------------------
log "Uploading WASM to Testnet..."
UPLOAD_OUTPUT=$(stellar contract upload \
  --wasm "$WASM_PATH" \
  --source "$TESTNET_DEPLOYER_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1) || fail "WASM upload failed:\n$UPLOAD_OUTPUT"

WASM_ID=$(echo "$UPLOAD_OUTPUT" | grep -Eo '[0-9a-fA-F]{64}' | tail -1 || true)
log "WASM ID (on-chain hash): ${WASM_ID:-<parse failed — check output above>}"

# ---------------------------------------------------------------------------
# Deploy contract
# ---------------------------------------------------------------------------
log "Deploying contract instance..."
DEPLOY_OUTPUT=$(stellar contract deploy \
  --wasm-hash "${WASM_ID:-}" \
  --source "$TESTNET_DEPLOYER_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1) || {
  # Fallback: deploy directly from WASM file if wasm-hash deploy isn't available
  log "wasm-hash deploy failed, falling back to --wasm ..."
  DEPLOY_OUTPUT=$(stellar contract deploy \
    --wasm "$WASM_PATH" \
    --source "$TESTNET_DEPLOYER_SECRET" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    2>&1) || fail "Contract deploy failed:\n$DEPLOY_OUTPUT"
}

CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'C[A-Z0-9]{55}' | head -1 || true)
DEPLOY_TX_HASH=$(echo "$DEPLOY_OUTPUT" | grep -Eo '[0-9a-fA-F]{64}' | head -1 || true)

[ -n "$CONTRACT_ID" ] \
  || fail "Could not parse contract ID from deploy output. Output was:\n$DEPLOY_OUTPUT"

log "Contract ID: $CONTRACT_ID"
log "Deploy TX  : ${DEPLOY_TX_HASH:-<not captured>}"

# ---------------------------------------------------------------------------
# Optional: initialize contract
# ---------------------------------------------------------------------------
INIT_RECORD="null"
if [ -n "${INIT_ADMIN:-}" ] && [ -n "${INIT_CLIENT:-}" ] && \
   [ -n "${INIT_FREELANCER:-}" ] && [ -n "${INIT_ARBITER:-}" ] && \
   [ -n "${INIT_TOKEN:-}" ]; then
  log "Calling initialize() on deployed contract..."
  INIT_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$TESTNET_DEPLOYER_SECRET" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- initialize \
    --admin "$INIT_ADMIN" \
    --client "$INIT_CLIENT" \
    --freelancer "$INIT_FREELANCER" \
    --arbiter "$INIT_ARBITER" \
    --token "$INIT_TOKEN" \
    --milestones '[]' \
    2>&1) || fail "initialize() call failed:\n$INIT_OUTPUT"
  log "initialize() succeeded."

  INIT_RECORD=$(cat <<JSONEOF
{
    "admin": "$INIT_ADMIN",
    "client": "$INIT_CLIENT",
    "freelancer": "$INIT_FREELANCER",
    "arbiter": "$INIT_ARBITER",
    "token": "$INIT_TOKEN"
  }
JSONEOF
)
fi

# ---------------------------------------------------------------------------
# Deployment record
# ---------------------------------------------------------------------------
mkdir -p "$DEPLOYMENTS_DIR"
DEPLOY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RECORD_FILE="$DEPLOYMENTS_DIR/testnet-$(date -u +"%Y%m%dT%H%M%SZ").json"

GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
RUST_VERSION=$(rustc --version 2>/dev/null || echo "unknown")
SOROBAN_SDK_VERSION=$(grep -A1 'name = "soroban-sdk"' "$CONTRACTS_ROOT/Cargo.lock" \
  | grep version | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "unknown")

cat > "$RECORD_FILE" <<EOF
{
  "schema_version": "1",
  "network": "$NETWORK",
  "network_passphrase": "$NETWORK_PASSPHRASE",
  "rpc_url": "$SOROBAN_RPC_URL",
  "contract_id": "$CONTRACT_ID",
  "wasm_hash_sha256": "$WASM_HASH",
  "wasm_id_on_chain": "${WASM_ID:-}",
  "deploy_tx_hash": "${DEPLOY_TX_HASH:-}",
  "deployer_address": "$DEPLOYER_ADDRESS",
  "deployment_timestamp": "$DEPLOY_TIMESTAMP",
  "git_commit": "$GIT_COMMIT",
  "git_tag": "$GIT_TAG",
  "rust_version": "$RUST_VERSION",
  "soroban_sdk_version": "$SOROBAN_SDK_VERSION",
  "initialization_params": $INIT_RECORD
}
EOF

log ""
log "Deployment record saved: $RECORD_FILE"
log ""
log "===== TESTNET DEPLOYMENT COMPLETE ====="
log "  Network    : $NETWORK"
log "  Contract ID: $CONTRACT_ID"
log "  WASM hash  : $WASM_HASH"
log "  TX hash    : ${DEPLOY_TX_HASH:-<not captured>}"
log "  Timestamp  : $DEPLOY_TIMESTAMP"
log "  Record     : $RECORD_FILE"
log ""
log "Verify with: ./scripts/verify-deployment.sh $RECORD_FILE"
