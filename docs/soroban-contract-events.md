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
