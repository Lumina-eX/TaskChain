# Soroban Escrow Contract — Deployment Guide

This guide explains how to build and deploy the `escrow` Soroban contract included under `contracts/contracts/escrow` to the Stellar Testnet (Soroban).

Prerequisites
- Rust + cargo and the `wasm32-unknown-unknown` target installed:
  - `rustup target add wasm32-unknown-unknown`
- `soroban` CLI installed and available in your PATH (see https://github.com/stellar/soroban-tools)
- Network RPC for Soroban testnet (the script defaults to `https://rpc.testnet.soroban.stellar.org`)

Quick build & deploy

1. Build the WASM artifact:

```bash
cd contracts
./deploy_escrow_testnet.sh
```

The script builds the contract and prints the command you can run to deploy using the `soroban` CLI. If you set `AUTO_DEPLOY=1` it will attempt to run the deploy command automatically.

Environment variables
- `SOROBAN_RPC_URL` — optional. If unset the script uses `https://rpc.testnet.soroban.stellar.org`.
- `AUTO_DEPLOY=1` — run the deploy command automatically after building.

Example: manual deploy (after building)

```bash
# deploy the compiled wasm (prints tx hash and contract id)
soroban contract deploy --wasm contracts/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm

# example: call `fund` as the client (requires the client key available to soroban CLI)
soroban contract invoke --id <CONTRACT_ID> --fn fund --source <CLIENT_SECRET>

# example: release payment (either client or freelancer can call; pass the caller address as an argument if required)
soroban contract invoke --id <CONTRACT_ID> --fn release --args <MILESTONE_ID> <CALLER_ADDRESS> --source <CALLER_SECRET>

# example: refund (freelancer invokes)
soroban contract invoke --id <CONTRACT_ID> --fn refund --args <MILESTONE_ID> <CALLER_ADDRESS> --source <FREELANCER_SECRET>
```

Notes on contract functions and mapping
- `initialize(...)` — creates an escrow (maps to requested `create_escrow`).
- `fund()` — lock funds into the contract (maps to `fund_escrow`).
- `submit_milestone(milestone_id)` — freelancer submits completed milestone.
- `approve(milestone_id)` — client approves submitted milestone.
- `freelancer_confirm(milestone_id)` — freelancer confirms approval.
- `release(milestone_id, caller)` — releases funds to freelancer (maps to `release_payment`).
- `refund(milestone_id, caller)` — refunds client (maps to `refund_payment`).
- `dispute(...)` / `resolve_dispute(...)` — dispute and arbiter resolution.

Integration notes
- The contract expects an SPL-like token address (`token`) passed at initialization. The contract uses the standard `token::Client` interface for transfers.
- Constructing the initialization `milestones` vector via CLI can be complex; for integration we recommend using the `@stellar/stellar-sdk` / Soroban client in an application script to upload WASM and call `initialize` with typed arguments.

Replacing the JS stub
- The repository contains a JS stub at `lib/soroban/deploy.ts`. Replace that stub with an implementation that uploads the compiled WASM, sends the install/create contract transaction, and returns the deployed contract ID and tx hash. See notes in that file for steps.

Reproducible deployment, verification, and audit records

This section documents the reproducible deployment workflow required for Testnet and Mainnet. Authorized contributors should follow it end to end.

Toolchain pinning
- Rust toolchain: pin the exact version in `rust-toolchain.toml` (for example `1.79.0`) with the `wasm32-unknown-unknown` target.
- Soroban SDK: pin the exact version in `contracts/contracts/escrow/Cargo.toml` and commit `Cargo.lock`.
- Record the versions used for every build in the deployment record.

Build and artifact hashing
- Build from a clean checkout at a reviewed commit or tag.
- Compute the WASM artifact hash with `sha256sum contracts/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm`.
- Re-running the build from the same commit and toolchain must produce the same hash. If it does not, treat the build as non-reproducible and stop.

Environment separation
- Testnet and Mainnet use separate configuration files (for example `deploy/testnet.env` and `deploy/mainnet.env`). Neither file may contain secrets.
- Secret keys are supplied only through environment variables or a secret manager and must never be committed to source control.
- Mainnet credentials must be distinct from Testnet credentials.
- Before deploying, confirm the configured network passphrase and RPC URL match the intended environment. Abort on mismatch.

Initialization parameter validation
- Validate all initialization parameters (client, freelancer, arbiter, token address, milestone amounts) before submitting the transaction.
- After deployment, read back the contract state and compare it with the intended parameters. Abort and record the failure if they differ.

Mainnet approval gate
- Mainnet deployment requires an explicit manual approval step, such as a protected GitHub Environment with required reviewers, before the deploy job runs.

Deployment record
Each deployment appends a new immutable record. Do not overwrite earlier records. Store records under `deployments/<network>/<timestamp>.json` with these fields:
- Network name
- Contract ID
- WASM artifact hash
- Deployment transaction hash
- Deployment timestamp (UTC)
- Git commit hash and source tag/version
- Rust toolchain version
- Soroban SDK version
- Initialization parameters
- Deployer account/address

Incomplete records must not be written. If any step fails, the workflow emits an actionable error message and writes nothing.

Verification
- Anyone can confirm a deployment by rebuilding from the recorded commit and toolchain, comparing the WASM hash to the recorded hash, and checking the on-chain contract ID and deployment transaction hash against the record.

CI requirements
- CI builds with the pinned toolchain and runs the full contract test suite.
- CI blocks deployment if tests fail, build verification fails, required configuration values are missing, or artifact generation is unsuccessful.

Redeployment
- Redeploying creates a new deployment record. Historical records are preserved.

Further reading
- Soroban RPC & CLI docs: https://soroban.stellar.org
- Soroban developer docs: https://soroban.stellar.org/docs
