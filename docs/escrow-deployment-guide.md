# Escrow Contract — Reproducible Deployment Guide

This document covers building, deploying, verifying, and redeploying the `escrow` Soroban
contract on Stellar Testnet and Mainnet. All procedures are designed for deterministic
builds, full artifact traceability, and independent verification.

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Pinned Toolchain](#2-pinned-toolchain)
3. [Building the Contract](#3-building-the-contract)
4. [Deploying to Testnet](#4-deploying-to-testnet)
5. [Deploying to Mainnet](#5-deploying-to-mainnet)
6. [Verifying a Deployment](#6-verifying-a-deployment)
7. [Deployment Records](#7-deployment-records)
8. [CI Pipeline](#8-ci-pipeline)
9. [Redeployment](#9-redeployment)
10. [Security Considerations](#10-security-considerations)
11. [Independent Verification](#11-independent-verification)

---

## 1. Environment Setup

### Required tools

| Tool | Minimum version | Install |
|------|----------------|---------|
| Rust | 1.82.0 (pinned) | https://rustup.rs |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| stellar CLI | latest | https://github.com/stellar/stellar-cli |
| curl | any | system package manager |
| sha256sum / shasum | any | system package manager |
| jq or python3 | any | used by verify script |

### Verify your setup

```bash
rustc --version          # should match contracts/rust-toolchain.toml
cargo --version
rustup target list --installed | grep wasm32
stellar --version
```

---

## 2. Pinned Toolchain

The Rust toolchain is pinned in `contracts/rust-toolchain.toml`:

```toml
[toolchain]
channel = "1.82.0"
targets = ["wasm32-unknown-unknown"]
components = ["rustfmt", "clippy"]
```

Cargo will automatically select this version when run from the `contracts/` directory.
The Soroban SDK version is pinned in `contracts/Cargo.toml` (`soroban-sdk = "25"`) and
locked to `25.3.1` in `contracts/Cargo.lock`. **Never update Cargo.lock without a
corresponding review and re-verification of the artifact hash.**

---

## 3. Building the Contract

Run the build-and-verify script from the `contracts/` directory:

```bash
cd contracts
bash scripts/build-verify.sh
```

This script:
- Validates the Rust toolchain version
- Builds the WASM artifact with `--locked` (exact dependency versions from Cargo.lock)
- Stages the artifact to `contracts/artifacts/escrow.wasm`
- Computes and records the SHA-256 hash in `contracts/artifacts/escrow.wasm.sha256`
- Writes a build provenance JSON to `contracts/artifacts/build-info.json`

### Build outputs

| File | Description |
|------|-------------|
| `artifacts/escrow.wasm` | Compiled WASM binary |
| `artifacts/escrow.wasm.sha256` | SHA-256 hash of the binary |
| `artifacts/build-info.json` | Full build provenance record |

The WASM binary is not committed to source control. The `build-info.json` and deployment
records are committed.

---

## 4. Deploying to Testnet

### Prerequisites

- Build completed (or set `SKIP_BUILD=1` if already built)
- `TESTNET_DEPLOYER_SECRET` exported in environment

```bash
export TESTNET_DEPLOYER_SECRET="S..."   # never commit this value

cd contracts
bash scripts/deploy-testnet.sh
```

### Optional initialization parameters

If you want `initialize()` called immediately after deployment:

```bash
export INIT_ADMIN="G..."
export INIT_CLIENT="G..."
export INIT_FREELANCER="G..."
export INIT_ARBITER="G..."
export INIT_TOKEN="C..."   # token contract address

bash scripts/deploy-testnet.sh
```

### What the script records

A file `contracts/deployments/testnet-<timestamp>.json` is created containing:

```json
{
  "schema_version": "1",
  "network": "testnet",
  "network_passphrase": "Test SDF Network ; September 2015",
  "rpc_url": "https://soroban-testnet.stellar.org",
  "contract_id": "C...",
  "wasm_hash_sha256": "<sha256>",
  "wasm_id_on_chain": "<hex>",
  "deploy_tx_hash": "<hex>",
  "deployer_address": "G...",
  "deployment_timestamp": "2026-10-17T12:00:00Z",
  "git_commit": "<sha>",
  "git_tag": "",
  "rust_version": "rustc 1.82.0 ...",
  "soroban_sdk_version": "25.3.1",
  "initialization_params": null
}
```

Commit this file to preserve the immutable deployment audit trail.

---

## 5. Deploying to Mainnet

Mainnet deployment requires an **explicit manual approval** step.

### Required environment variables

| Variable | Description |
|----------|-------------|
| `MAINNET_DEPLOYER_SECRET` | Stellar secret key — must differ from Testnet key |
| `MAINNET_DEPLOY_CONFIRMED` | Set to `yes` in CI after human approval gate passes |

Mainnet credentials must be stored separately from Testnet credentials and must never
share the same secret key.

```bash
export MAINNET_DEPLOYER_SECRET="S..."   # isolated from Testnet secret

cd contracts
bash scripts/deploy-mainnet.sh
```

The script will prompt:

```
  Type exactly 'CONFIRM MAINNET DEPLOY' to proceed:
```

Type that phrase exactly to proceed. In CI, the `mainnet-approval` environment gate
(which requires a repository maintainer to approve) handles this; the script receives
`MAINNET_DEPLOY_CONFIRMED=yes` automatically.

A deployment record `contracts/deployments/mainnet-<timestamp>.json` is saved with the
same schema as the Testnet record.

---

## 6. Verifying a Deployment

```bash
cd contracts
bash scripts/verify-deployment.sh deployments/testnet-20261017T120000Z.json
```

The script checks:

1. All required fields are present in the record
2. The network passphrase matches the expected value for the recorded network
3. Mainnet records do not reference a Testnet RPC endpoint
4. The local artifact hash (if present) matches the recorded hash
5. The RPC endpoint is reachable and responsive

Exit code `0` means all checks passed. Exit code `1` means at least one check failed.

### Independent verification without the local WASM

If you do not have the compiled artifact locally, you can reproduce it independently:

```bash
git checkout <git_commit from deployment record>
cd contracts
bash scripts/build-verify.sh
# Compare the printed hash with the recorded wasm_hash_sha256
```

Any authorized contributor with the same toolchain will produce the same hash from the
same commit, verifying the deployed contract matches the reviewed source code.

---

## 7. Deployment Records

Deployment records live in `contracts/deployments/`. Files are named:

```
testnet-<YYYYMMDDTHHMMSSz>.json
mainnet-<YYYYMMDDTHHMMSSz>.json
```

Each record is written once and treated as immutable. Redeployments create new records;
historical records are never modified or deleted. Commit all records to source control.

### Verification fields captured per deployment

| Field | Purpose |
|-------|---------|
| `git_commit` | Ties the artifact to exact reviewed source code |
| `git_tag` | Human-readable version reference |
| `rust_version` | Reproduces the build environment |
| `soroban_sdk_version` | Pinned SDK version used |
| `wasm_hash_sha256` | Independently verifiable artifact fingerprint |
| `wasm_id_on_chain` | On-chain WASM blob identifier |
| `network` + `network_passphrase` | Prevents network confusion |
| `contract_id` | Deployed contract address |
| `deploy_tx_hash` | On-chain proof of deployment transaction |
| `deployer_address` | Accountable deployer identity |
| `deployment_timestamp` | Audit timeline |
| `initialization_params` | Records parameters passed to `initialize()` |

---

## 8. CI Pipeline

The `.github/workflows/contracts-ci.yml` workflow runs on every push and PR that
touches `contracts/`:

### Jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| `build` | always | Builds WASM with pinned toolchain, computes hash, uploads artifact |
| `test` | always | Runs `cargo test --workspace --locked` |
| `validate-config` | `workflow_dispatch` with deploy target | Validates required secrets |
| `deploy-testnet` | `workflow_dispatch` → `testnet` | Deploys to Testnet after build+test |
| `mainnet-approval` | `workflow_dispatch` → `mainnet` | Requires human approval via GitHub environment |
| `deploy-mainnet` | after `mainnet-approval` | Deploys to Mainnet |

### CI deployment gates

CI blocks deployment when:
- Contract tests fail (`cargo test` reports `FAILED`)
- Build fails or WASM artifact is not produced
- Artifact hash does not match between build and deploy jobs
- Required secrets are missing
- Network configuration is invalid (Mainnet passphrase on Testnet or vice versa)
- Testnet and Mainnet secrets are identical

### GitHub environment configuration

Create two GitHub environments in the repository settings:

- **`testnet`** — no required reviewers; Testnet secrets only
- **`mainnet-approval`** — required reviewers (at least one maintainer)
- **`mainnet`** — Mainnet secrets only; protected branch rules enforced

Store secrets in the appropriate environment, never at repository level:

| Environment | Secret |
|-------------|--------|
| `testnet` | `TESTNET_DEPLOYER_SECRET` |
| `mainnet` | `MAINNET_DEPLOYER_SECRET` |

---

## 9. Redeployment

Redeployments follow the same process as initial deployments. Each run generates a
new timestamped deployment record. Historical records are preserved.

Before redeploying, verify the most recent deployment record is committed:

```bash
git log --oneline contracts/deployments/
```

Then run the deploy script as normal. The new record will reference the new contract ID
and transaction hash while the old records remain unchanged.

---

## 10. Security Considerations

- **Secrets**: `TESTNET_DEPLOYER_SECRET` and `MAINNET_DEPLOYER_SECRET` must never be
  committed to source control or logged. Use GitHub encrypted secrets exclusively.
- **Credential isolation**: Testnet and Mainnet must use different key pairs. The
  deployment scripts enforce this check.
- **Immutable records**: Deployment JSON records must not be edited after creation.
  Treat them as append-only audit logs.
- **Source-to-artifact traceability**: Every deployment record includes the `git_commit`
  hash, so any deployment can be traced back to exact reviewed source code.
- **Network guard**: The Mainnet deploy script rejects execution if the RPC URL contains
  "testnet", and the verification script cross-checks the passphrase against the
  expected value for each network.
- **Manual gate**: Mainnet deployments always require an explicit human approval in CI
  (via the `mainnet-approval` GitHub environment) or interactive confirmation when
  running locally.

---

## 11. Independent Verification

Any authorized contributor can independently verify that a deployed contract matches
the reviewed source code:

```bash
# 1. Check out the exact commit from the deployment record
git checkout <git_commit>

# 2. Confirm toolchain matches
cat contracts/rust-toolchain.toml

# 3. Build from source
cd contracts
bash scripts/build-verify.sh

# 4. Compare the printed hash with the recorded wasm_hash_sha256
cat artifacts/build-info.json | grep wasm_hash_sha256
```

If the hashes match, the deployed contract is identical to the artifact produced from
the reviewed source at that commit.

To verify the on-chain contract ID against the WASM hash, use the Stellar Explorer
or the `stellar contract info` command with the contract ID from the deployment record.
