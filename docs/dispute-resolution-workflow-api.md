# Dispute Resolution Workflow & Authorization API (issue #247)

Secure workflow for opening contract disputes, submitting evidence, reading
dispute details and resolving disputes in coordination with the escrow smart
contract.

```
POST /api/contracts/:id/disputes    open a dispute
POST /api/disputes/:id/evidence     attach evidence references
GET  /api/disputes/:id              read dispute, evidence, attempts, audit
POST /api/disputes/:id/resolve      resolve (or retry / reconcile) a dispute
```

Contract-scoped disputes use the canonical UUID schema from
`lib/db/migrations/001_taskchain_schema.sql` and are implemented in
`lib/disputes/`. Legacy job-scoped disputes (integer ids) continue to be served
by the existing handlers in the same route files.

## Authorization

| Actor | Create | View | Evidence | Resolve |
| --- | --- | --- | --- | --- |
| Contract client / freelancer | ✅ | ✅ | ✅ | ❌ |
| Arbiter (`contracts.arbiter_address`) | ✅ | ✅ | ✅ | ✅ |
| Designated decision-maker (`contracts.designated_resolver_id`) | ✅ | ✅ | ✅ | ✅ |
| Admin (`users.role = 'admin'`) | ✅ | ✅ | ✅ | ✅ |
| Anyone else | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |

The actor is always resolved from the JWT wallet address (`withAuthCtx`) and the
role from the database. Client-supplied ids, roles, contract ownership or
arbitrator flags are ignored.

Backend authorization never replaces the smart contract's own checks: the
escrow contract runs `arbiter.require_auth()` inside `resolve_dispute`, so a
resolution must also be signed by the on-chain arbiter
(`STELLAR_ARBITER_SECRET`, whose public key must equal `contracts.arbiter_address`).

Denied authorization decisions are appended to the audit trail
(`authorization_denied`).

## Dispute creation

`POST /api/contracts/:id/disputes` — requires `Idempotency-Key` header.

```json
{
  "reason": "Delivered work does not match the agreed specification",
  "desiredOutcome": "full refund",
  "milestoneId": "uuid",
  "evidence": [{ "type": "url", "url": "https://...", "label": "scope" }]
}
```

Eligibility is validated against the loaded contract:

* status must be `active` or `paused`;
* escrow status must be `funded` or `partially_released`;
* `milestoneId` is required when the contract has an on-chain escrow address,
  and the milestone must belong to the contract and be `submitted`,
  `approved`, `expired` or `extended` (mirrors the contract's `dispute()` rules);
* only one active dispute per contract (`409 DISPUTE_ALREADY_EXISTS`).

Responses: `201` created, `200` idempotent replay, `400`, `401`, `403`, `404`,
`409`, `422`, `503`.

## Evidence

`POST /api/disputes/:id/evidence` — JSON references (not file uploads):

```json
{
  "references": [{ "type": "ipfs", "url": "ipfs://bafy...", "label": "proof" }],
  "description": "Optional note"
}
```

Evidence is stored in `dispute_evidence_items`, linked to the dispute, and
deduplicated by `sha256(type|url|label)` per dispute: replays return `200` with
`duplicates` instead of inserting another row. Closed disputes reject new
evidence (`409 DISPUTE_CLOSED`).

Evidence and dispute details are only returned to authorized actors. Nothing is
written to logs beyond ids/hashes.

## Resolution

`POST /api/disputes/:id/resolve` — requires `Idempotency-Key` header.

```json
{
  "outcome": "resolved_freelancer",
  "reasons": "Documented decision, at least 10 characters",
  "metadata": { "evidenceReviewed": true },
  "clientRefundAmount": "400.000000",
  "freelancerPayoutAmount": "600.000000"
}
```

* `reasons` is mandatory and stored immutably; `metadata` is optional (≤ 16 KB).
* `resolved_freelancer` / `resolved_client` are submitted on-chain via
  `resolve_dispute(milestone_id, release_to_freelancer)`.
* `withdrawn` is an off-chain closure: the contract returns to `active`, no
  funds move, no transaction is sent.
* `resolved_split` is rejected when the contract has an escrow address, because
  the escrow contract is binary. It is accepted off-chain only.
* Split amounts must sum to the contract total (exact decimal comparison).

### Transaction states

| Result | HTTP | Meaning |
| --- | --- | --- |
| confirmed | 200 | transaction verified on-chain; dispute/contract updated |
| pending | 202 | transaction submitted but not yet verified (`attempt.status = pending`) |
| failed (retryable) | 503 | RPC unavailable/timeout; retry with the same key |
| failed (reverted) | 502 | contract rejected the call; deterministic failure |

A dispute is **never** marked resolved until the transaction has been re-fetched
from the Soroban RPC node and reported `SUCCESS`.

`attempts` (in `GET /api/disputes/:id`) exposes every attempt with its
`status` (`pending` / `confirmed` / `failed`), `txHash`, error code and
timestamps, so pending and confirmed resolutions are tracked separately.

### Idempotency, concurrency and retries

* `Idempotency-Key` is stored per dispute; a replay of the same payload returns
  the original attempt (and its state) without a second on-chain transaction.
* Reusing a key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.
* Database unique indexes guarantee one active dispute per contract, one pending
  attempt per dispute and one confirmed attempt per dispute. Concurrent
  resolutions lose with `409 RESOLUTION_IN_PROGRESS` or
  `409 RESOLUTION_ALREADY_FINALISED`.
* Retrying a failed attempt: resend the same `Idempotency-Key`, or pass
  `retryAttemptId` with a new key. The retry re-submits and links the new
  attempt through `retry_of`.
* Recovering a crashed/timed-out submission: `POST /api/disputes/:id/resolve`
  with `{ "reconcile": true }` re-verifies the pending transaction hash and
  confirms or fails it. `409 NO_PENDING_RESOLUTION` when there is nothing to
  reconcile.

### Consistency

Confirmation updates the attempt, the dispute and the contract in a single SQL
statement guarded by `disputes.status IN ('open','under_review','escalated')`.
If another request won the race, the attempt is failed with
`CONCURRENT_RESOLUTION` and the API returns `409` — it never reports success.

Outcome → contract status: `resolved_freelancer` → `completed`,
`resolved_client` → `cancelled`, `resolved_split` (off-chain) → `completed`,
`withdrawn` → `active`. `active_dispute_id` is cleared.

## Audit trail

`dispute_audit_events` is append-only (a trigger rejects `UPDATE`/`DELETE`).
Recorded actions: `dispute_created`, `evidence_submitted`,
`authorization_denied`, `resolution_requested`, `resolution_pending`,
`resolution_confirmed`, `resolution_failed`, `resolution_retried`.

`GET /api/disputes/:id` returns the trail, ordered by `created_at`.

## Database

Migration: `lib/db/migrations/012_dispute_resolution_workflow.sql`.

Adds `contracts.arbiter_address`, `contracts.designated_resolver_id`,
`disputes.creation_idempotency_key`, `disputes.resolution_metadata`,
`disputes.last_resolution_attempt_id`, tables `dispute_evidence_items`,
`dispute_resolution_attempts`, `dispute_audit_events`, plus the unique indexes
described above.

Apply with `npm run migrate` (or `pnpm migrate`). No smart-contract changes are
required: the workflow calls the existing `dispute` / `resolve_dispute` methods.

## Configuration

| Variable | Purpose |
| --- | --- |
| `STELLAR_RPC_URL` (or `SOROBAN_RPC_URL`) | Soroban RPC endpoint |
| `STELLAR_ARBITER_SECRET` | arbiter key that signs `resolve_dispute` |
| `STELLAR_NETWORK_PASSPHRASE` | network passphrase (defaults to testnet) |
| `STELLAR_CONFIRMATION_ATTEMPTS` | confirmation polls per request (default 10) |
| `STELLAR_CONFIRMATION_INTERVAL_MS` | poll interval (default 1500) |

If the arbiter key or RPC URL is missing, resolution fails closed with
`503 BLOCKCHAIN_NOT_CONFIGURED` and the attempt remains retryable.

## Tests

```
npx vitest run __tests__/disputes __tests__/api/disputes-workflow.test.ts
```

`__tests__/disputes/authorization.test.ts` — role matrix.
`__tests__/disputes/validation.test.ts` — payload, evidence and amount rules.
`__tests__/disputes/service.test.ts` — creation, evidence, authorization,
duplicate/concurrent resolution, pending/confirmed/reverted/RPC-failure paths,
retry, reconciliation, split/withdraw, consistency and audit completeness.
`__tests__/api/disputes-workflow.test.ts` — HTTP status/response consistency,
auth failures and error mapping.
