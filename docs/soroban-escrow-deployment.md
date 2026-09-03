# Soroban Escrow Contract — Deployment Guide

This guide covers building, deploying, and integrating the `escrow` Soroban contract located at
`contracts/contracts/escrow`.

---

## State Machine

The contract enforces a strict per-milestone state machine.

```
[Created]
    │ initialize()
    ▼
[Pending]  ─── fund() ──────────────────────────────────────────────────────►[Funded]
                                                                                  │
                                                                        start_milestone()
                                                                                  │
                                                                                  ▼
                                                                           [InProgress]
                                                                         /      │       \
                                                                refund()  submit()   dispute()
                                                                   │          │           │
                                                                   ▼          ▼           │
                                                              [Refunded] [Submitted]      │
                                                                         /     │    \     │
                                                                   approve() dispute() refund()
                                                                       │        │
                                                                       ▼        ▼
                                                                  [Approved] [Disputed]
                                                                  /     \       │
                                                      freelancer_confirm()  resolve_dispute()
                                                                  │           /      \
                                                                  ▼          ▼        ▼
                                                                 ...    [Released] [Refunded]
                                                                  │
                                                               release()
                                                                  │
                                                                  ▼
                                                             [Released]
```

### State summary

| State       | Who enters it               | Notes                                          |
|-------------|-----------------------------|------------------------------------------------|
| Pending     | `initialize()`              | Contract created; not yet funded               |
| Funded      | `fund()` (client)           | Total amount locked in contract                |
| InProgress  | `start_milestone()` (client)| Client signals work may begin                  |
| Submitted   | `submit_milestone()` (FL)   | Freelancer delivers milestone                  |
| Approved    | `approve()` (client)        | Client signs off; awaits freelancer confirm    |
| Released    | `release()` / `resolve_dispute()` | Terminal — funds sent to freelancer      |
| Refunded    | `refund()` / `resolve_dispute()` / `auto_expire()` | Terminal — funds returned to client |
| Disputed    | `dispute()` (client or FL)  | Pending arbitration                            |
| AutoExpired | `auto_expire()` (anyone)    | Terminal — deadline exceeded, refund to client |

**Terminal states**: Released, Refunded, AutoExpired — no further transitions permitted.

---

## Prerequisites

- Rust + `cargo` with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- `stellar` CLI (previously `soroban` CLI) in your PATH.
  See <https://github.com/stellar/stellar-cli>.
- Network RPC for Soroban testnet (defaults to `https://rpc.testnet.soroban.stellar.org`).

---

## Quick build & deploy

```bash
cd contracts
./deploy_escrow_testnet.sh
```

The script builds the contract WASM and prints the deploy command.  
Set `AUTO_DEPLOY=1` to run it automatically.

**Environment variables**

| Variable           | Default                                        | Purpose                         |
|--------------------|------------------------------------------------|---------------------------------|
| `SOROBAN_RPC_URL`  | `https://rpc.testnet.soroban.stellar.org`      | Soroban RPC endpoint            |
| `AUTO_DEPLOY=1`    | —                                              | Run deploy command automatically|

---

## Example CLI calls

```bash
# 1. Deploy the compiled WASM
stellar contract deploy \
  --wasm contracts/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm \
  --source <DEPLOYER_SECRET>

# 2. Initialize the escrow (Created state)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn initialize \
  --args <ADMIN> <CLIENT> <FREELANCER> <ARBITER> <TOKEN_ADDRESS> <MILESTONES_VEC> \
  --source <ADMIN_SECRET>

# 3. Fund the escrow — Pending → Funded  (client auth)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn fund \
  --source <CLIENT_SECRET>

# 4. Start a milestone — Funded → InProgress  (client auth)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn start_milestone \
  --args <MILESTONE_ID> \
  --source <CLIENT_SECRET>

# 5. Submit a milestone — InProgress → Submitted  (freelancer auth)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn submit_milestone \
  --args <MILESTONE_ID> \
  --source <FREELANCER_SECRET>

# 6. Approve — Submitted → Approved  (client auth)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn approve \
  --args <MILESTONE_ID> \
  --source <CLIENT_SECRET>

# 7. Freelancer confirm — stays Approved, sets freelancer_approved=true  (freelancer auth)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn freelancer_confirm \
  --args <MILESTONE_ID> \
  --source <FREELANCER_SECRET>

# 8. Release funds — Approved → Released  (client or freelancer)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn release \
  --args <MILESTONE_ID> <CALLER_ADDRESS> \
  --source <CALLER_SECRET>

# 9. Refund — Funded|InProgress → Refunded  (client OR freelancer)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn refund \
  --args <MILESTONE_ID> <CALLER_ADDRESS> \
  --source <CALLER_SECRET>

# 10. Raise a dispute — InProgress|Submitted|Approved → Disputed  (client or freelancer)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn dispute \
  --args <MILESTONE_ID> <CALLER_ADDRESS> \
  --source <CALLER_SECRET>

# 11. Resolve dispute — Disputed → Released|Refunded  (arbiter only)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn resolve_dispute \
  --args <MILESTONE_ID> <true|false> \
  --source <ARBITER_SECRET>
  # true  → funds sent to freelancer (Released)
  # false → funds returned to client  (Refunded)

# 12. Auto-expire after deadline — any non-terminal state → AutoExpired  (permissionless)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --fn auto_expire \
  --args <MILESTONE_ID>
```

---

## Function reference

| Function             | Auth              | From state(s)                 | To state     | Notes                                        |
|----------------------|-------------------|-------------------------------|--------------|----------------------------------------------|
| `initialize`         | none              | —                             | Pending      | Must be called once before anything else     |
| `fund`               | client            | Pending                       | Funded       | Transfers total milestone amounts on-chain   |
| `start_milestone`    | client            | Funded                        | InProgress   | **New in v2** — triggers work start          |
| `submit_milestone`   | freelancer        | InProgress                    | Submitted    | Fails if deadline has passed                 |
| `approve`            | client            | Submitted                     | Approved     | Sets `client_approved = true`                |
| `freelancer_confirm` | freelancer        | Approved                      | Approved     | Sets `freelancer_approved = true`            |
| `release`            | client or FL      | Approved (both flags set)     | Released     | Transfers amount to freelancer               |
| `refund`             | client or FL      | Funded, InProgress            | Refunded     | **Updated in v2** — both parties may refund  |
| `dispute`            | client or FL      | InProgress, Submitted, Approved | Disputed   | Clears both approval flags                   |
| `resolve_dispute`    | arbiter           | Disputed                      | Released or Refunded | Transfers amount to winning party   |
| `auto_expire`        | anyone            | Any non-terminal              | AutoExpired  | Requires deadline passed; refunds client     |
| `upgrade`            | admin             | any                           | —            | WASM upgrade; admin-only                     |

---

## Events emitted

Each state transition emits an event visible in the Stellar transaction record.

| Topic (symbol)  | Function            | Data payload                          |
|-----------------|---------------------|---------------------------------------|
| `init`          | `initialize`        | `(client, freelancer, arbiter)`       |
| `fund`          | `fund`              | `(total_amount)`                      |
| `start`         | `start_milestone`   | `(milestone_id)`                      |
| `submt`         | `submit_milestone`  | `(milestone_id)`                      |
| `aprov`         | `approve`           | `(milestone_id)`                      |
| `cnfrm`         | `freelancer_confirm`| `(milestone_id)`                      |
| `relse`         | `release`           | `(milestone_id, amount)`              |
| `rfund`         | `refund`            | `(milestone_id, amount)`              |
| `dispt`         | `dispute`           | `(milestone_id)`                      |
| `rslve`         | `resolve_dispute`   | `(milestone_id, release_to_freelancer)` |
| `expir`         | `auto_expire`       | `(milestone_id, amount)`              |

---

## Authorization model

| Action              | Permitted caller(s)         |
|---------------------|-----------------------------|
| Fund                | Client only                 |
| Start milestone     | Client only                 |
| Submit milestone    | Freelancer only             |
| Approve             | Client only                 |
| Freelancer confirm  | Freelancer only             |
| Release             | Client **or** Freelancer    |
| Refund              | Client **or** Freelancer    |
| Dispute             | Client **or** Freelancer    |
| Resolve dispute     | Arbiter only                |
| Auto expire         | Anyone (permissionless)     |
| Upgrade WASM        | Admin only                  |

---

## Error codes

| Code | Name                  | Description                                       |
|------|-----------------------|---------------------------------------------------|
| 1    | AlreadyInitialized    | `initialize()` called more than once              |
| 2    | NotInitialized        | Required storage key not found                    |
| 3    | AlreadyFunded         | `fund()` called after the escrow was already funded |
| 4    | NotFunded             | (reserved)                                        |
| 5    | MilestoneNotFound     | Unknown milestone ID                              |
| 6    | InvalidMilestoneStatus| Transition not allowed from current state         |
| 7    | Unauthorized          | Caller is not a permitted party for this action   |
| 8    | ZeroAmount            | Milestone amount must be > 0                      |
| 9    | InsufficientApprovals | Both `client_approved` and `freelancer_approved` must be true before release |
| 10   | AlreadyApproved       | Approval flag already set (double-confirm guard)  |
| 11   | DeadlineExceeded      | Submission rejected because deadline has passed   |
| 12   | AlreadyExpired        | Milestone is already in a terminal state          |

---

## Integration notes

- The contract expects a standard Stellar asset token address (`token`) passed at initialization.
  Token transfers use the `token::Client` interface.
- Constructing the `milestones` vector via CLI is verbose; prefer the `@stellar/stellar-sdk`
  JavaScript/TypeScript SDK for integration scripting.
- The JS stub at `lib/soroban/deploy.ts` should be replaced with an implementation that:
  1. Uploads the compiled WASM.
  2. Sends the install/create contract transaction.
  3. Returns the deployed contract ID and tx hash.
- Events are emitted via `env.events().publish()` using 5-character `symbol_short!` topics.
  Subscribe to contract events via the Soroban RPC `getEvents` endpoint.

---

## Further reading

- Soroban developer docs: <https://soroban.stellar.org/docs>
- Stellar CLI docs: <https://github.com/stellar/stellar-cli>
- Stellar SDK (JS/TS): <https://github.com/stellar/js-stellar-sdk>
