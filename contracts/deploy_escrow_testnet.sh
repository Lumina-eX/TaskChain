#!/usr/bin/env bash
set -euo pipefail

# Deterministic build + deployment helper for the escrow contract on Stellar Testnet.
#
# Produces an auditable deployment record containing:
#   network, contract ID, WASM artifact hash, deployment tx hash, timestamp,
#   git commit, source tag, Rust toolchain version, Soroban SDK version,
#   deployer address and initialization parameters.
#
# Prerequisites:
#  - Rust toolchain pinned in rust-toolchain.toml (or RUST_TOOLCHAIN env var)
#  - wasm32-unknown-unknown target installed
#  - `soroban` CLI available in PATH
#  - SOROBAN_RPC_URL (defaults to https://rpc.testnet.soroban.stellar.org)
#  - SOROBAN_NETWORK_PASSPHRASE (defaults to Testnet passphrase)
#  - SOROBAN_SOURCE_ACCOUNT: deployer identity (never a secret value in git)
#
# Environment isolation:
#  - Only the Testnet network is accepted by this script. Mainnet must use
#    scripts/deploy_escrow_mainnet.sh, which requires explicit manual approval.
#
# Usage:
#   AUTO_DEPLOY=1 ./contracts/deploy_escrow_testnet.sh
#   ./contracts/deploy_escrow_testnet.sh            # build + validate only

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/escrow"
RECORDS_DIR="$ROOT_DIR/deployments/testnet"

TESTNET_PASSPHRASE="Test SDF Network ; September 2015"
EXPECTED_NETWORK="testnet"

die() {
  echo "[escrow deploy] ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Configuration validation
# ---------------------------------------------------------------------------
SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://rpc.testnet.soroban.stellar.org}"
SOROBAN_NETWORK_PASSPHRASE="${SOROBAN_NETWORK_PASSPHRASE:-$TESTNET_PASSPHRASE}"
export SOROBAN_RPC_URL SOROBAN_NETWORK_PASSPHRASE

if [ "$SOROBAN_NETWORK_PASSPHRASE" != "$TESTNET_PASSPHRASE" ]; then
  die "network passphrase does not match Testnet. Refusing to deploy. Use the Mainnet workflow for Mainnet."
fi

case "$SOROBAN_RPC_URL" in
  *testnet*) ;;
  *) die "SOROBAN_RPC_URL ($SOROBAN_RPC_URL) does not look like a Testnet endpoint. Refusing to deploy." ;;
esac

if [ "${AUTO_DEPLOY:-0}" = "1" ] && [ -z "${SOROBAN_SOURCE_ACCOUNT:-}" ]; then
  die "SOROBAN_SOURCE_ACCOUNT is required for deployment (set it to a Testnet identity alias). Do not commit secrets."
fi

command -v cargo >/dev/null 2>&1 || die "cargo not found in PATH."
command -v git >/dev/null 2>&1 || die "git not found in PATH."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found in PATH."

# ---------------------------------------------------------------------------
# 2. Toolchain pinning and provenance
# ---------------------------------------------------------------------------
TOOLCHAIN_FILE="$ROOT_DIR/rust-toolchain.toml"
if [ -n "${RUST_TOOLCHAIN:-}" ]; then
  export RUSTUP_TOOLCHAIN="$RUST_TOOLCHAIN"
elif [ ! -f "$TOOLCHAIN_FILE" ]; then
  die "rust-toolchain.toml missing; a pinned toolchain is required for reproducible builds."
fi

RUST_VERSION="$(rustc --version)"
[ -n "$RUST_VERSION" ] || die "unable to determine rustc version."

if ! rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
  die "wasm32-unknown-unknown target not installed. Run: rustup target add wasm32-unknown-unknown"
fi

SDK_VERSION="$(grep -E '^soroban-sdk' "$CONTRACT_DIR/Cargo.toml" | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')"
[ -n "$SDK_VERSION" ] || die "unable to determine soroban-sdk version from $CONTRACT_DIR/Cargo.toml"

# ---------------------------------------------------------------------------
# 3. Source provenance
# ---------------------------------------------------------------------------
cd "$ROOT_DIR"
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null)" || die "not a git repository; cannot record source provenance."
GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || echo "untagged")"
if [ -n "$(git status --porcelain -- contracts/escrow)" ]; then
  die "uncommitted changes in contracts/escrow. Deploy only reviewed, committed source."
fi

# ---------------------------------------------------------------------------
# 4. Deterministic build
# ---------------------------------------------------------------------------
echo "[escrow deploy] Running contract tests..."
cd "$CONTRACT_DIR"
cargo test --locked || die "contract tests failed; deployment aborted."

echo "[escrow deploy] Building escrow contract (locked, release, wasm32)..."
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$ROOT_DIR=." \
  cargo build --locked --release --target wasm32-unknown-unknown \
  || die "cargo build failed; deployment aborted."

WASM_PATH="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/escrow.wasm"
[ -f "$WASM_PATH" ] || die "WASM artifact not generated at $WASM_PATH"

WASM_SHA256="$(sha256sum "$WASM_PATH" | awk '{print $1}')"
[ -n "$WASM_SHA256" ] || die "failed to compute WASM artifact hash."

ARTIFACT_DIR="$RECORDS_DIR/artifacts/$WASM_SHA256"
mkdir -p "$ARTIFACT_DIR"
cp "$WASM_PATH" "$ARTIFACT_DIR/escrow.wasm"

# ---------------------------------------------------------------------------
# 5. Initialization parameter validation
# ---------------------------------------------------------------------------
INIT_PARAMS_FILE="${ESCROW_INIT_PARAMS:-$ROOT_DIR/contracts/config/testnet.init.json}"
[ -f "$INIT_PARAMS_FILE" ] || die "initialization parameters file not found: $INIT_PARAMS_FILE"
if ! command -v jq >/dev/null 2>&1; then
  die "jq is required to validate initialization parameters."
fi
jq -e '.network == "testnet" and (.admin | type == "string" and length > 0)' "$INIT_PARAMS_FILE" >/dev/null \
  || die "initialization parameters must declare network=testnet and a non-empty admin."
INIT_PARAMS="$(jq -c . "$INIT_PARAMS_FILE")"

# ---------------------------------------------------------------------------
# 6. Deployment (opt-in)
# ---------------------------------------------------------------------------
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RECORD_FILE="$RECORDS_DIR/escrow-${GIT_COMMIT:0:12}-${WASM_SHA256:0:12}.json"

echo "[escrow deploy] Built WASM: $WASM_PATH"
echo "[escrow deploy] WASM sha256: $WASM_SHA256"

if [ "${AUTO_DEPLOY:-0}" != "1" ]; then
  echo "[escrow deploy] Build and validation complete. Set AUTO_DEPLOY=1 to deploy."
  echo "[escrow deploy] Artifact archived at $ARTIFACT_DIR/escrow.wasm"
  exit 0
fi

DEPLOY_OUT="$(mktemp)"
trap 'rm -f "$DEPLOY_OUT"' EXIT

if ! soroban contract deploy \
      --wasm "$WASM_PATH" \
      --source "$SOROBAN_SOURCE_ACCOUNT" \
      --network "$EXPECTED_NETWORK" >"$DEPLOY_OUT" 2>&1; then
  cat "$DEPLOY_OUT" >&2
  die "soroban contract deploy failed; no deployment record written."
fi

CONTRACT_ID="$(grep -Eo 'C[A-Z2-7]{55}' "$DEPLOY_OUT" | tail -n1 || true)"
TX_HASH="$(grep -Eio '[0-9a-f]{64}' "$DEPLOY_OUT" | tail -n1 || true)"
[ -n "$CONTRACT_ID" ] || die "could not parse contract ID from deploy output; no record written."
[ -n "$TX_HASH" ] || die "could not parse deployment transaction hash; no record written."

DEPLOYER_ADDRESS="$(soroban keys address "$SOROBAN_SOURCE_ACCOUNT" 2>/dev/null || echo "unknown")"

# Post-deployment verification: the on-chain WASM must match the artifact hash.
echo "[escrow deploy] Verifying deployed contract against artifact..."
ONCHAIN_WASM="$(mktemp)"
trap 'rm -f "$DEPLOY_OUT" "$ONCHAIN_WASM"' EXIT
soroban contract fetch --id "$CONTRACT_ID" --network "$EXPECTED_NETWORK" --out-file "$ONCHAIN_WASM" >/dev/null 2>&1 \
  || die "failed to fetch deployed WASM for verification; deployment record not written."
ONCHAIN_SHA256="$(sha256sum "$ONCHAIN_WASM" | awk '{print $1}')"
[ "$ONCHAIN_SHA256" = "$WASM_SHA256" ] \
  || die "deployed WASM hash ($ONCHAIN_SHA256) does not match artifact ($WASM_SHA256)."

# ---------------------------------------------------------------------------
# 7. Immutable deployment record (never overwritten)
# ---------------------------------------------------------------------------
mkdir -p "$RECORDS_DIR"
[ ! -e "$RECORD_FILE" ] || die "deployment record already exists: $RECORD_FILE (immutable)"

TMP_RECORD="$(mktemp)"
jq -n \
  --arg network "$EXPECTED_NETWORK" \
  --arg contract_id "$CONTRACT_ID" \
  --arg wasm_sha256 "$WASM_SHA256" \
  --arg tx_hash "$TX_HASH" \
  --arg timestamp "$TIMESTAMP" \
  --arg git_commit "$GIT_COMMIT" \
  --arg git_tag "$GIT_TAG" \
  --arg rust_version "$RUST_VERSION" \
  --arg sdk_version "$SDK_VERSION" \
  --arg deployer "$DEPLOYER_ADDRESS" \
  --arg rpc_url "$SOROBAN_RPC_URL" \
  --argjson init_params "$INIT_PARAMS" \
  '{
    network: $network,
    contract_id: $contract_id,
    wasm_sha256: $wasm_sha256,
    deployment_tx_hash: $tx_hash,
    deployment_timestamp: $timestamp,
    git_commit: $git_commit,
    source_tag: $git_tag,
    rust_toolchain: $rust_version,
    soroban_sdk_version: $sdk_version,
    deployer: $deployer,
    rpc_url: $rpc_url,
    initialization_params: $init_params,
    verified_onchain_hash: true
  }' > "$TMP_RECORD" || die "failed to write deployment record."

mv "$TMP_RECORD" "$RECORD_FILE"
chmod 0444 "$RECORD_FILE"

echo "[escrow deploy] Deployment complete."
echo "[escrow deploy] Contract ID: $CONTRACT_ID"
echo "[escrow deploy] Tx hash: $TX_HASH"
echo "[escrow deploy] Record: $RECORD_FILE"
echo "[escrow deploy] See docs/soroban-escrow-deployment.md for verification and redeployment steps."
