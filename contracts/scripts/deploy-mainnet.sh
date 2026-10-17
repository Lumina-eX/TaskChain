#!/usr/bin/env bash
# deploy-mainnet.sh — Deploy the escrow contract to Stellar Mainnet.
#
# MAINNET DEPLOYMENT REQUIRES EXPLICIT MANUAL APPROVAL.
# This script will not proceed without the operator typing "CONFIRM MAINNET DEPLOY".
# In CI, set MAINNET_DEPLOY_CONFIRMED=yes to bypass the interactive prompt
# (only after a human approval gate step has passed).
#
# Prerequisites:
#   - Run ./scripts/build-verify.sh first (or set SKIP_BUILD=1)
#   - stellar CLI available in PATH
#   - MAINNET_DEPLOYER_SECRET set in environment (isolated from Testnet credentials)
#
# Environment variables:
#   MAINNET_DEPLOYER_SECRET      — Stellar secret key (required, never commit)
#   MAINNET_DEPLOY_CONFIRMED     — Set to "yes" to bypass interactive confirmation (CI only)
#   SKIP_BUILD                   — Set to 1 to skip build
#   SOROBAN_RPC_URL_MAINNET      — Override RPC (default: Mainnet Horizon Soroban RPC)
#   INIT_ADMIN / INIT_CLIENT / INIT_FREELANCER / INIT_ARBITER / INIT_TOKEN
#                                — Initialization parameters (optional)
#
# Outputs:
#   contracts/deployments/mainnet-<timestamp>.json — immutable deployment record

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$CONTRACTS_ROOT/artifacts"
DEPLOYMENTS_DIR="$CONTRACTS_ROOT/deployments"
NETWORK="mainnet"
SOROBAN_RPC_URL="${SOROBAN_RPC_URL_MAINNET:-https://soroban-mainnet.stellar.org}"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

# ---------------------------------------------------------------------------
log()  { echo "[deploy-mainnet] $*"; }
fail() { echo "[deploy-mainnet] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Hard guard: reject if RPC points to Testnet
# ---------------------------------------------------------------------------
if echo "$SOROBAN_RPC_URL" | grep -qi "testnet"; then
  fail "SOROBAN_RPC_URL appears to point to Testnet. Aborting Mainnet deployment."
fi

# ---------------------------------------------------------------------------
# Secrets validation
# ---------------------------------------------------------------------------
[ -n "${MAINNET_DEPLOYER_SECRET:-}" ] \
  || fail "MAINNET_DEPLOYER_SECRET is not set."

# Ensure Testnet key is not reused for Mainnet
if [ -n "${TESTNET_DEPLOYER_SECRET:-}" ] && \
   [ "$MAINNET_DEPLOYER_SECRET" = "$TESTNET_DEPLOYER_SECRET" ]; then
  fail "MAINNET_DEPLOYER_SECRET must not be the same as TESTNET_DEPLOYER_SECRET."
fi

# ---------------------------------------------------------------------------
# Manual approval gate
# ---------------------------------------------------------------------------
if [ "${MAINNET_DEPLOY_CONFIRMED:-}" != "yes" ]; then
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║          *** MAINNET DEPLOYMENT WARNING ***              ║"
  echo "  ║  You are about to deploy to the Stellar Mainnet.        ║"
  echo "  ║  This action incurs real transaction fees and is        ║"
  echo "  ║  irreversible once the contract is deployed.            ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
  printf "  Type exactly 'CONFIRM MAINNET DEPLOY' to proceed: "
  read -r CONFIRMATION
  if [ "$CONFIRMATION" != "CONFIRM MAINNET DEPLOY" ]; then
    fail "Confirmation not received. Aborting."
  fi
fi

log "Mainnet deployment confirmed. Proceeding..."

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

[ -f "$WASM_PATH" ]  || fail "Artifact not found: $WASM_PATH"
[ -f "$HASH_FILE" ]  || fail "Hash file not found: $HASH_FILE"
[ -f "$BUILD_INFO" ] || fail "Build info not found: $BUILD_INFO"

WASM_HASH=$(awk '{print $1}' "$HASH_FILE")
log "WASM hash: $WASM_HASH"

# ---------------------------------------------------------------------------
# Tooling check
# ---------------------------------------------------------------------------
command -v stellar >/dev/null 2>&1 \
  || fail "'stellar' CLI not found. Install: https://github.com/stellar/stellar-cli"

# ---------------------------------------------------------------------------
# Network validation
# ---------------------------------------------------------------------------
log "Validating network connectivity to $SOROBAN_RPC_URL ..."
curl -sf --max-time 10 "$SOROBAN_RPC_URL" -o /dev/null \
  || fail "Cannot reach Mainnet RPC endpoint $SOROBAN_RPC_URL"
log "Network check passed."

DEPLOYER_ADDRESS=$(stellar keys address --secret-key "$MAINNET_DEPLOYER_SECRET" 2>/dev/null) \
  || fail "Could not derive public key from MAINNET_DEPLOYER_SECRET."
log "Deployer address: $DEPLOYER_ADDRESS"

# ---------------------------------------------------------------------------
# Upload WASM
# ---------------------------------------------------------------------------
log "Uploading WASM to Mainnet..."
UPLOAD_OUTPUT=$(stellar contract upload \
  --wasm "$WASM_PATH" \
  --source "$MAINNET_DEPLOYER_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1) || fail "WASM upload failed:\n$UPLOAD_OUTPUT"

WASM_ID=$(echo "$UPLOAD_OUTPUT" | grep -Eo '[0-9a-fA-F]{64}' | tail -1 || true)
log "WASM ID (on-chain): ${WASM_ID:-<parse failed>}"

# ---------------------------------------------------------------------------
# Deploy contract
# ---------------------------------------------------------------------------
log "Deploying contract instance to Mainnet..."
DEPLOY_OUTPUT=$(stellar contract deploy \
  --wasm-hash "${WASM_ID:-}" \
  --source "$MAINNET_DEPLOYER_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1) || {
  log "wasm-hash deploy failed, falling back to --wasm ..."
  DEPLOY_OUTPUT=$(stellar contract deploy \
    --wasm "$WASM_PATH" \
    --source "$MAINNET_DEPLOYER_SECRET" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    2>&1) || fail "Contract deploy failed:\n$DEPLOY_OUTPUT"
}

CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'C[A-Z0-9]{55}' | head -1 || true)
DEPLOY_TX_HASH=$(echo "$DEPLOY_OUTPUT" | grep -Eo '[0-9a-fA-F]{64}' | head -1 || true)

[ -n "$CONTRACT_ID" ] \
  || fail "Could not parse contract ID from deploy output:\n$DEPLOY_OUTPUT"

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
    --source "$MAINNET_DEPLOYER_SECRET" \
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
RECORD_FILE="$DEPLOYMENTS_DIR/mainnet-$(date -u +"%Y%m%dT%H%M%SZ").json"

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
log "===== MAINNET DEPLOYMENT COMPLETE ====="
log "  Network    : $NETWORK"
log "  Contract ID: $CONTRACT_ID"
log "  WASM hash  : $WASM_HASH"
log "  TX hash    : ${DEPLOY_TX_HASH:-<not captured>}"
log "  Timestamp  : $DEPLOY_TIMESTAMP"
log "  Record     : $RECORD_FILE"
log ""
log "Verify with: ./scripts/verify-deployment.sh $RECORD_FILE"
