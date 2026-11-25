# Soroban Contract Errors and Events

This document defines the public integration contract for the `escrow` and `dispute` Soroban contracts.

## Errors

Contract methods that can fail return `Result<_, Error>`. Soroban exposes the enum variant as a stable numeric contract error. Do not parse human-readable panic text; use the generated client `try_*` methods and match the error enum.

| Contract | Code | Variant | Integration code |
| --- | ---: | --- | --- |
| Escrow | 1 | `AlreadyInitialized` | `ERR_ALREADY_INITIALIZED` |
| Escrow | 2 | `NotInitialized` | `ERR_NOT_INITIALIZED` |
| Escrow | 3 | `AlreadyFunded` | `ERR_ALREADY_FUNDED` |
| Escrow | 4 | `NotFunded` | `ERR_NOT_FUNDED` |
| Escrow | 5 | `MilestoneNotFound` | `ERR_MILESTONE_NOT_FOUND` |
| Escrow | 6 | `InvalidMilestoneStatus` | `ERR_INVALID_STATE` |
| Escrow | 7 | `Unauthorized` | `ERR_UNAUTHORIZED` |
| Escrow | 8 | `ZeroAmount` | `ERR_INVALID_AMOUNT` |
| Escrow | 9 | `InsufficientApprovals` | `ERR_INSUFFICIENT_APPROVALS` |
| Escrow | 10 | `AlreadyApproved` | `ERR_ALREADY_APPROVED` |
| Escrow | 11 | `DeadlineExceeded` | `ERR_DEADLINE_EXCEEDED` |
| Escrow | 12 | `AlreadyExpired` | `ERR_ALREADY_EXPIRED` |
| Escrow | 13 | `InvalidDeadline` | `ERR_INVALID_DEADLINE` |
| Escrow | 14 | `ExtensionNotFound` | `ERR_EXTENSION_NOT_FOUND` |
| Escrow | 15 | `DuplicateMilestoneId` | `ERR_DUPLICATE_MILESTONE_ID` |
| Escrow | 16 | `InsufficientBalance` | `ERR_INSUFFICIENT_BALANCE` |
| Dispute | 1 | `AlreadyInitialized` | `ERR_ALREADY_INITIALIZED` |
| Dispute | 2 | `NotInitialized` | `ERR_NOT_INITIALIZED` |
| Dispute | 3 | `DisputeNotFound` | `ERR_DISPUTE_NOT_FOUND` |
| Dispute | 4 | `DisputeClosed` | `ERR_DISPUTE_CLOSED` |
| Dispute | 5 | `DisputeNotClosed` | `ERR_DISPUTE_NOT_CLOSED` |
| Dispute | 6 | `VotingEnded` | `ERR_VOTING_ENDED` |
| Dispute | 7 | `VotingNotEnded` | `ERR_VOTING_NOT_ENDED` |
| Dispute | 8 | `ZeroAmount` | `ERR_INVALID_AMOUNT` |
| Dispute | 9 | `AlreadyVoted` | `ERR_ALREADY_VOTED` |
| Dispute | 10 | `NoStake` | `ERR_NO_STAKE` |
| Dispute | 11 | `DisputeNotResolved` | `ERR_DISPUTE_NOT_RESOLVED` |

Numeric values are append-only ABI values. If a new failure is added, append a new variant and never renumber an existing one.

## Permissionless state queries

The escrow contract exposes `get_escrow_state()` and `get_milestone_state(milestone_id)` as read-only calls. They require no authorization and do not write storage or emit events. Call them against the escrow contract address on the same Stellar network as the contract; for example, use the Soroban RPC `simulateTransaction` method with a contract invocation and do not submit the simulated transaction.

With a generated Soroban contract client, the invocations are:

```rust
let escrow_state = escrow_client.get_escrow_state();
let milestone_state = escrow_client.get_milestone_state(&1);
```

`get_escrow_state()` returns participants (`client`, `freelancer`, `arbiter`), the supported token contract address (`token`), the funding flag, aggregate amounts, current status, and a `milestones` array. `get_milestone_state()` returns the same milestone representation for one ID. Amounts are signed integers in the token's smallest units; convert for display using the token's decimals. `allocated_amount` is the sum of milestone allocations. `released_amount` is value transferred to the freelancer by `release` or dispute resolution; `refunded_amount` is value returned to the client by `refund` or dispute resolution. `remaining_amount` is the milestone allocation not yet settled. At escrow level, `remaining_balance` comes from the contract's `EscrowBalance` accounting and is zero before funding. The JSON below is a decoded representation (enum values are shown by their names).

### Escrow status mapping

The aggregate `status` uses this precedence, so mixed milestone states map deterministically:

| Status | Meaning |
| --- | --- |
| `Created` | Escrow has not been funded. |
| `Disputed` | At least one milestone is disputed. |
| `Completed` | Every milestone is released, refunded, or resolved. |
| `PartiallySettled` | At least one milestone is settled and at least one is not. |
| `Approved` | No higher-priority state applies and at least one milestone is approved. |
| `Submitted` | No higher-priority state applies and at least one milestone is submitted. |
| `InProgress` | No higher-priority state applies and at least one milestone is in progress or extended. |
| `Expired` | No higher-priority state applies and at least one milestone is expired or auto-expired. |
| `Funded` | Funded; all milestones remain in an earlier state. |

Milestone `status` remains the canonical detailed lifecycle value (`Created`, `Funded`, `InProgress`, `Submitted`, `Approved`, `Released`, `Refunded`, `Disputed`, `Resolved`, `AutoExpired`, `Expired`, `Extended`). `completed` is true only for `Released`, `Refunded`, and `Resolved`.

### Example response

```json
{
  "client": "G...",
  "freelancer": "G...",
  "arbiter": "G...",
  "token": "C...",
  "allocated_amount": 300,
  "released_amount": 100,
  "refunded_amount": 0,
  "remaining_balance": 200,
  "funded": true,
  "status": "PartiallySettled",
  "milestones": [
    {
      "id": 1,
      "deadline": 2000000000,
      "allocated_amount": 100,
      "released_amount": 100,
      "refunded_amount": 0,
      "remaining_amount": 0,
      "status": "Released",
      "completed": true,
      "client_approved": true,
      "freelancer_approved": false
    },
    {
      "id": 2,
      "deadline": 2000000000,
      "allocated_amount": 200,
      "released_amount": 0,
      "refunded_amount": 0,
      "remaining_amount": 200,
      "status": "Funded",
      "completed": false,
      "client_approved": false,
      "freelancer_approved": false
    }
  ]
}
```

Generated Soroban clients expose typed `get_escrow_state` and `get_milestone_state` calls. For other clients, decode the returned Soroban `ScVal` using the contract's generated XDR schema; preserve integer amounts without converting to floating point. Treat `NotInitialized` (error 2) as an uninitialized/nonexistent escrow contract and `MilestoneNotFound` (error 5) as an invalid milestone ID. A malformed address, unknown contract, or RPC/network failure occurs before contract execution and is reported by the RPC layer, not as an escrow contract error.

Frontend and backend consumers should treat these on-chain responses as authoritative for escrow and milestone state. Database/indexer data can be used for search and presentation, but should be reconciled with these contract views (or a verified ledger snapshot) before presenting balances as authoritative. All clients should use the same contract ABI, network, and ledger context when comparing results.

## Events

All standardized events use the PascalCase type names below in contract source and the equivalent snake_case event name in RPC/indexer storage. Every event includes `contract_id` as an indexed topic. `actor`, when present, is the wallet that initiated the action.

### Escrow events

| Event | Indexed topics | Data payload |
| --- | --- | --- |
| `EscrowCreated` / `escrow_created` | `contract_id`, `actor` | `client`, `freelancer`, `arbiter`, `token`, `milestone_count` |
| `EscrowFunded` / `escrow_funded` | `contract_id`, `actor` | `amount` |
| `MilestoneSubmitted` / `milestone_submitted` | `contract_id`, `milestone_id`, `actor` | `amount`, `deadline` |
| `MilestoneApproved` / `milestone_approved` | `contract_id`, `milestone_id`, `actor` | none |
| `MilestoneConfirmed` / `milestone_confirmed` | `contract_id`, `milestone_id`, `actor` | none |
| `PaymentReleased` / `payment_released` | `contract_id`, `milestone_id`, `actor` | `recipient`, `amount` |
| `DisputeRaised` / `dispute_raised` | `contract_id`, `milestone_id`, `actor` | none |
| `RefundIssued` / `refund_issued` | `contract_id`, `milestone_id`, `actor` | `recipient`, `amount` |
| `DisputeResolved` / `dispute_resolved` | `contract_id`, `milestone_id`, `actor` | `recipient`, `amount`, `release_to_freelancer` |
| `MilestoneExpired` / `milestone_expired` | `contract_id`, `milestone_id`, `actor` | `recipient`, `amount` |
| `DeadlineSet` / `deadline_set` | `contract_id`, `milestone_id`, `actor` | `deadline` |
| `DeadlineExpired` / `deadline_expired` | `contract_id`, `milestone_id`, `actor` | `deadline` |
| `DeadlineExtended` / `deadline_extended` | `contract_id`, `milestone_id`, `actor` | `previous_deadline`, `new_deadline`, `was_expired` |

Milestones require a future Unix timestamp deadline at initialization. After the
deadline, the permissionless `auto_expire` call marks a funded, unfinished
milestone as `Expired` and leaves its funds in escrow. The client may call
`refund` to return those funds; alternatively, the client or arbitrator may
request a later deadline and only the arbitrator can approve it. Approval
transitions `Expired` to `Extended`. A submitted/approved milestone may still
enter dispute after expiry, in which case its funds remain locked until the
arbitrator resolves it. Expiry never transfers funds automatically.

### Dispute events

| Event | Indexed topics | Data payload |
| --- | --- | --- |
| `DisputeCreated` / `dispute_created` | `contract_id`, `dispute_id`, `actor` | `disputed_amount`, `end_time`, `winner_address`, `loser_address` |
| `VoteCast` / `vote_cast` | `contract_id`, `dispute_id`, `actor` | `amount`, `support` |
| `DisputeResolved` / `dispute_resolved` | `contract_id`, `dispute_id`, `actor` | `recipient`, `disputed_amount`, `is_in_favor` |
| `StakeClaimed` / `stake_claimed` | `contract_id`, `dispute_id`, `actor` | `amount` |

The event listener accepts both these canonical names and the pre-standardization topics (`init`, `fund`, `submit`, `approve`, `confirm`, `release`, `refund`, `dispute`, `resolve`, `expire`). New integrations should use canonical names only.
