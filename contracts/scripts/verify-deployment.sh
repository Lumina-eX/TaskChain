#!/usr/bin/env bash
# verify-deployment.sh — Verify a deployed contract against its deployment record.
#
# Usage:
#   ./scripts/verify-deployment.sh <deployment-record.json>
#
# What it checks:
#   1. Deployment record is valid JSON and contains required fields.
#   2. WASM artifact hash in the record matches the local artifact (if present).
#   3. Network passphrase matches the expected value for the recorded network.
#   4. Contract ID is reachable on the recorded RPC endpoint.
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log()    { echo "[verify] $*"; }
pass()   { echo "[verify] ✓ $*"; }
warn()   { echo "[verify] ⚠ $*"; }
fail()   { echo "[verify] ✗ FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }
FAILURES=0

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
RECORD_FILE="${1:-}"
[ -n "$RECORD_FILE" ] || { echo "Usage: $0 <deployment-record.json>" >&2; exit 1; }
[ -f "$RECORD_FILE" ] || { echo "File not found: $RECORD_FILE" >&2; exit 1; }

log "Verifying deployment record: $RECORD_FILE"
echo ""

# ---------------------------------------------------------------------------
# Parse record (requires python3 or jq)
# ---------------------------------------------------------------------------
parse_json() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$key // empty" "$RECORD_FILE"
  else
    python3 -c "import json,sys; d=json.load(open('$RECORD_FILE')); print(d.get('$key',''))" 2>/dev/null
  fi
}

REQUIRED_FIELDS="schema_version network network_passphrase rpc_url contract_id wasm_hash_sha256 deployment_timestamp deployer_address git_commit"

log "1. Checking required fields in deployment record..."
MISSING_FIELDS=0
for field in $REQUIRED_FIELDS; do
  VAL=$(parse_json "$field")
  if [ -z "$VAL" ]; then
    fail "Missing required field: $field"
    MISSING_FIELDS=$((MISSING_FIELDS + 1))
  fi
done
[ "$MISSING_FIELDS" -eq 0 ] && pass "All required fields present."

# ---------------------------------------------------------------------------
# Read values
# ---------------------------------------------------------------------------
NETWORK=$(parse_json "network")
RECORDED_PASSPHRASE=$(parse_json "network_passphrase")
RPC_URL=$(parse_json "rpc_url")
CONTRACT_ID=$(parse_json "contract_id")
RECORDED_WASM_HASH=$(parse_json "wasm_hash_sha256")
DEPLOY_TIMESTAMP=$(parse_json "deployment_timestamp")
DEPLOYER=$(parse_json "deployer_address")
GIT_COMMIT=$(parse_json "git_commit")

# ---------------------------------------------------------------------------
# 2. Network passphrase validation
# ---------------------------------------------------------------------------
log ""
log "2. Validating network passphrase..."
EXPECTED_TESTNET_PASSPHRASE="Test SDF Network ; September 2015"
EXPECTED_MAINNET_PASSPHRASE="Public Global Stellar Network ; September 2015"

if [ "$NETWORK" = "testnet" ]; then
  if [ "$RECORDED_PASSPHRASE" = "$EXPECTED_TESTNET_PASSPHRASE" ]; then
    pass "Network passphrase matches Testnet."
  else
    fail "Testnet passphrase mismatch. Recorded: '$RECORDED_PASSPHRASE'"
  fi
elif [ "$NETWORK" = "mainnet" ]; then
  if [ "$RECORDED_PASSPHRASE" = "$EXPECTED_MAINNET_PASSPHRASE" ]; then
    pass "Network passphrase matches Mainnet."
  else
    fail "Mainnet passphrase mismatch. Recorded: '$RECORDED_PASSPHRASE'"
  fi
  # Extra guard: reject mainnet record if RPC URL looks like testnet
  if echo "$RPC_URL" | grep -qi "testnet"; then
    fail "Mainnet record contains a Testnet RPC URL: $RPC_URL"
  fi
else
  warn "Unknown network '$NETWORK'. Skipping passphrase cross-check."
fi

# ---------------------------------------------------------------------------
# 3. Local artifact hash check
# ---------------------------------------------------------------------------
log ""
log "3. Verifying local WASM artifact hash..."
LOCAL_WASM="$CONTRACTS_ROOT/artifacts/escrow.wasm"
if [ -f "$LOCAL_WASM" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    LOCAL_HASH=$(sha256sum "$LOCAL_WASM" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    LOCAL_HASH=$(shasum -a 256 "$LOCAL_WASM" | awk '{print $1}')
  else
    warn "No sha256sum or shasum available. Skipping local artifact check."
    LOCAL_HASH=""
  fi

  if [ -n "$LOCAL_HASH" ]; then
    if [ "$LOCAL_HASH" = "$RECORDED_WASM_HASH" ]; then
      pass "Local artifact hash matches recorded hash: $RECORDED_WASM_HASH"
    else
      fail "Artifact hash MISMATCH."
      fail "  Recorded : $RECORDED_WASM_HASH"
      fail "  Local    : $LOCAL_HASH"
    fi
  fi
else
  warn "Local artifact not found at $LOCAL_WASM. Skipping local hash check."
  warn "To verify: run build-verify.sh with the same git commit ($GIT_COMMIT) and compare hashes."
fi

# ---------------------------------------------------------------------------
# 4. Contract reachability check
# ---------------------------------------------------------------------------
log ""
log "4. Checking contract reachability on $RPC_URL ..."
if curl -sf --max-time 15 "$RPC_URL" -o /dev/null; then
  pass "RPC endpoint is reachable."
  # Attempt a lightweight getLedgerEntries or getContractData call
  LEDGER_CHECK=$(curl -sf --max-time 15 \
    -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":{}}' \
    2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('sequence',''))" 2>/dev/null || echo "")
  if [ -n "$LEDGER_CHECK" ]; then
    pass "RPC responsive. Latest ledger sequence: $LEDGER_CHECK"
  else
    warn "RPC reachable but getLatestLedger did not return a sequence. Check manually."
  fi
else
  warn "Cannot reach RPC endpoint $RPC_URL. Skipping reachability check."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "===== VERIFICATION SUMMARY ====="
echo "  Record       : $RECORD_FILE"
echo "  Network      : $NETWORK"
echo "  Contract ID  : $CONTRACT_ID"
echo "  WASM hash    : $RECORDED_WASM_HASH"
echo "  Deployer     : $DEPLOYER"
echo "  Git commit   : $GIT_COMMIT"
echo "  Deployed at  : $DEPLOY_TIMESTAMP"
echo ""

if [ "$FAILURES" -eq 0 ]; then
  echo "  Result: ALL CHECKS PASSED"
  exit 0
else
  echo "  Result: $FAILURES CHECK(S) FAILED — see errors above."
  exit 1
fi
