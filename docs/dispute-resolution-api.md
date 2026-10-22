# Dispute Resolution API

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/contracts/:id/disputes` | Contract participants | Open a dispute (body: `reason`) |
| POST | `/api/disputes/:id/evidence` | Contract participants | Add evidence (`kind`: `url`\|`ipfs`, `uri`, optional `description`, `sha256`) |
| GET | `/api/disputes/:id` | Participants and arbitrators | Dispute, evidence and audit events |
| POST | `/api/disputes/:id/resolve` | Arbitrators (not parties to the contract) | Decide (`outcome`, `reason`, optional `split_bps`, `metadata`) |

## Statuses
`open` → `resolution_pending` (tx submitted, not yet confirmed) → `resolved` (confirmed on-chain).
`resolution_failed` means submission or the transaction failed; call resolve again with the same outcome to retry.

## Rules
- One unresolved dispute per contract; the contract must be in an eligible status.
- A dispute can be resolved only once; duplicate calls return `409 already_resolved` or `202` while confirming.
- Evidence is deduplicated per dispute by `uri`.
- Every lifecycle step is stored in `dispute_events` (with tx hash where relevant).
- The escrow contract enforces its own authorization; backend checks never replace it.
- `GET /api/disputes/:id` re-checks pending transactions, keeping app state in sync with the chain.

## Errors
`400` validation, `401` unauthorized, `403` forbidden / conflict_of_interest, `404` not found, `409` dispute_already_open / contract_not_eligible / dispute_not_open / already_resolved / resolution_conflict, `502` chain_submission_failed (retryable).

## Config
`DISPUTE_ARBITRATOR_IDS`: comma-separated user ids allowed to resolve disputes.