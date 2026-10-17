#!/usr/bin/env bash
# build-verify.sh — Deterministic build and artifact verification for the escrow contract.
#
# Outputs:
#   contracts/artifacts/escrow.wasm        — optimised WASM binary
#   contracts/artifacts/escrow.wasm.sha256 — SHA-256 hash of the binary
#   contracts/artifacts/build-info.json    — build provenance record
#
# Exit codes:
#   0 — success
#   1 — build or verification failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$CONTRACTS_ROOT/artifacts"
WASM_RELEASE_PATH="$CONTRACTS_ROOT/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[build-verify] $*"; }
fail() { echo "[build-verify] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Toolchain validation
# ---------------------------------------------------------------------------
log "Validating Rust toolchain..."
RUST_VERSION=$(rustc --version 2>/dev/null) \
  || fail "rustc not found. Install Rust from https://rustup.rs"
log "  rustc: $RUST_VERSION"

CARGO_VERSION=$(cargo --version 2>/dev/null) \
  || fail "cargo not found."
log "  cargo: $CARGO_VERSION"

rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown" \
  || fail "wasm32-unknown-unknown target not installed. Run: rustup target add wasm32-unknown-unknown"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
log "Building escrow contract (release, wasm32-unknown-unknown)..."
cd "$CONTRACTS_ROOT"

# Use RUSTFLAGS for reproducibility: no embedded paths, no timestamps
RUSTFLAGS="-C strip=symbols" \
  cargo build \
    --manifest-path "$CONTRACTS_ROOT/Cargo.toml" \
    --package escrow \
    --release \
    --target wasm32-unknown-unknown \
    --locked \
  || fail "cargo build failed"

[ -f "$WASM_RELEASE_PATH" ] || fail "WASM artifact not found at $WASM_RELEASE_PATH"

# ---------------------------------------------------------------------------
# Artifact staging
# ---------------------------------------------------------------------------
mkdir -p "$ARTIFACTS_DIR"
cp "$WASM_RELEASE_PATH" "$ARTIFACTS_DIR/escrow.wasm"
WASM_SIZE=$(wc -c < "$ARTIFACTS_DIR/escrow.wasm")
log "WASM artifact staged: $ARTIFACTS_DIR/escrow.wasm ($WASM_SIZE bytes)"

# ---------------------------------------------------------------------------
# Hash computation
# ---------------------------------------------------------------------------
log "Computing SHA-256 hash..."
if command -v sha256sum >/dev/null 2>&1; then
  WASM_HASH=$(sha256sum "$ARTIFACTS_DIR/escrow.wasm" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  WASM_HASH=$(shasum -a 256 "$ARTIFACTS_DIR/escrow.wasm" | awk '{print $1}')
else
  fail "Neither sha256sum nor shasum found. Cannot compute artifact hash."
fi

echo "$WASM_HASH  escrow.wasm" > "$ARTIFACTS_DIR/escrow.wasm.sha256"
log "  WASM hash: $WASM_HASH"

# ---------------------------------------------------------------------------
# Build provenance record
# ---------------------------------------------------------------------------
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
GIT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SOROBAN_SDK_VERSION=$(grep -A1 'name = "soroban-sdk"' "$CONTRACTS_ROOT/Cargo.lock" \
  | grep version | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "unknown")

cat > "$ARTIFACTS_DIR/build-info.json" <<EOF
{
  "contract": "escrow",
  "build_timestamp": "$BUILD_TIMESTAMP",
  "git_commit": "$GIT_COMMIT",
  "git_tag": "$GIT_TAG",
  "git_dirty": $GIT_DIRTY,
  "rust_version": "$RUST_VERSION",
  "cargo_version": "$CARGO_VERSION",
  "soroban_sdk_version": "$SOROBAN_SDK_VERSION",
  "wasm_hash_sha256": "$WASM_HASH",
  "wasm_size_bytes": $WASM_SIZE,
  "toolchain_file": "contracts/rust-toolchain.toml"
}
EOF

log "Build provenance saved: $ARTIFACTS_DIR/build-info.json"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log ""
log "Build complete."
log "  Artifact : $ARTIFACTS_DIR/escrow.wasm"
log "  Hash     : $WASM_HASH"
log "  Commit   : $GIT_COMMIT"
log ""
log "To deploy to Testnet:  ./scripts/deploy-testnet.sh"
log "To deploy to Mainnet:  ./scripts/deploy-mainnet.sh"
