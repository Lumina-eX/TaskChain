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
- `dispute(...)` / `resolve_dispute(...)` — dispute and arbiter resolution. `resolve_dispute` requires authorization from the arbitrator address configured at initialization; the `release_to_freelancer` flag selects the payout (`true`) or client refund (`false`). A successful resolution is recorded by `get_dispute_resolution(milestone_id)` and emitted as a `DisputeResolved` event.

Integration notes
- The contract expects an SPL-like token address (`token`) passed at initialization. The contract uses the standard `token::Client` interface for transfers.
- Constructing the initialization `milestones` vector via CLI can be complex; for integration we recommend using the `@stellar/stellar-sdk` / Soroban client in an application script to upload WASM and call `initialize` with typed arguments.

Replacing the JS stub
- The repository contains a JS stub at `lib/soroban/deploy.ts`. Replace that stub with an implementation that uploads the compiled WASM, sends the install/create contract transaction, and returns the deployed contract ID and tx hash. See notes in that file for steps.

Further reading
- Soroban RPC & CLI docs: https://soroban.stellar.org
- Soroban developer docs: https://soroban.stellar.org/docs
