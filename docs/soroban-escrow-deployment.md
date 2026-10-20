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

## Permissionless state queries

`get_escrow_state()`, `get_milestone(milestone_id)`, and
`get_milestones_state()` are read-only contract methods. They require no
participant authorization and do not submit a transaction. Each query is
executed through Soroban RPC simulation, so it reads the state at the ledger
used for that simulation.

The application SDK exposes these methods without requiring a wallet signer:

```ts
import { Networks } from '@stellar/stellar-sdk'
import { SorobanContractClient } from '@/lib/soroban/sdk'

const escrow = new SorobanContractClient({
  contractId: escrowId,
  sourcePublicKey: publicKey,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
})

const state = await escrow.getEscrowState(escrowId)
const milestones = await escrow.getMilestones(escrowId)
```

`sourcePublicKey` is only used as the RPC simulation transaction source; it
does not have to belong to an escrow participant. A functioning network account
and access to Soroban RPC are still required.

The SDK returns a stable camelCase response:

```json
{
  "client": "G...",
  "freelancer": "G...",
  "token": "C...",
  "funded": true,
  "allocated": "10000000",
  "released": "2500000",
  "remaining": "7500000",
  "tokenBalance": "7500000",
  "status": "active"
}
```

Amounts and deadlines are decimal strings in token base units and ledger
seconds, respectively, to avoid JavaScript integer precision loss. `allocated`
is the sum of milestone allocations. `released` is the total paid to the
freelancer, including dispute resolutions in their favor. `remaining` is the
contract's recorded escrow balance; `tokenBalance` is the token contract's
actual balance for the escrow contract and can be compared with `remaining` to
identify a discrepancy.

Escrow `status` values are `unfunded` (not funded), `active` (funded with
unfinished milestones), `disputed` (at least one open dispute), and `settled`
(all milestones are released, refunded, resolved, or auto-expired).

Milestone responses include `id`, `amount` (the allocation), `released`
(amount paid to the freelancer), `remaining` (amount still held by the escrow,
zero before funding and after settlement), `deadline`, `description`, numeric
`status`, `statusName`, `clientApproved`, `freelancerApproved`, and `completed`.
Milestone status numbers/names are: `0 created`, `1 funded`, `2 in_progress`,
`3 submitted`, `4 approved`, `5 released`, `6 refunded`, `7 disputed`,
`8 resolved`, and `9 auto_expired`. `completed` is true for released, refunded,
resolved, and auto-expired milestones.

Example milestone returned by `getMilestone()`:

```json
{
  "id": 1,
  "amount": "2500000",
  "released": "2500000",
  "remaining": "0",
  "deadline": "0",
  "description": "Design",
  "status": 5,
  "statusName": "released",
  "clientApproved": true,
  "freelancerApproved": true,
  "completed": true
}
```

Invalid contract addresses and milestone identifiers fail locally with
`INVALID_ESCROW_ID` and `INVALID_MILESTONE_ID`. A missing/uninitialized escrow
returns the contract's `ERR_NOT_INITIALIZED` error; an unknown milestone
returns `ERR_MILESTONE_NOT_FOUND`. Query failures are thrown as
`SorobanSdkError` with a stable `code`, and contract errors also include the
numeric `contractCode` for diagnostics. Frontends should render these as
query failures rather than treating them as empty escrow state; backend
consumers should retain the ledger returned by their RPC layer when audit
reproducibility is needed. Application databases may cache these responses,
but the contract response is the source for independently verifiable state.

Replacing the JS stub
- The repository contains a JS stub at `lib/soroban/deploy.ts`. Replace that stub with an implementation that uploads the compiled WASM, sends the install/create contract transaction, and returns the deployed contract ID and tx hash. See notes in that file for steps.

Further reading
- Soroban RPC & CLI docs: https://soroban.stellar.org
- Soroban developer docs: https://soroban.stellar.org/docs
