# Reputation API — integration guide

Backend reputation metrics are **pre-aggregated** in Postgres (`freelancer_reputation`) and refreshed when a snapshot is **missing or older than five minutes** (configurable in code via `REPUTATION_SNAPSHOT_MAX_AGE_MS`). This keeps reads cheap at scale while staying close to real-time job data.

## Metrics definitions

| Field | Meaning |
|--------|---------|
| **completionRate** | `jobsCompleted / jobsStarted`, capped 0–1. `jobsStarted` counts all jobs where the user is `freelancer_id` (any non-null assignment). |
| **disputeRate** | Share of those jobs that either have `status = 'disputed'` or at least one row in `disputes` for that `job_id`. |
| **totalVolume** | Sum of `budget` over jobs with `status = 'completed'`. Amounts follow whatever `currency` is on each job; if you mix currencies, treat this as informational or extend the API to group by currency. |
| **onTimeDeliveryPct** | Among completed jobs with both `deadline` and `completed_at`, the fraction where `completed_at <= deadline`. If none qualify, this is `null`. |
| **reputationScore** | Optional display score 0–100: `0.4 * completion + 0.35 * onTime + 0.25 * (1 - dispute)`, with `0.5` used for on-time when there is no on-time sample but the user has started jobs. `null` when `jobsStarted === 0`. |

Rates and the score are **`null`** when denominators are zero (except `totalVolume`, which is `0`).

## Endpoints

### 1. Public profile — `GET /api/freelancers/{userId}/reputation`

- **Path**: `userId` is the integer primary key from `users.id`.
- **Auth**: none.
- **Cache**: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- **Errors**: `400` invalid id, `404` user missing, `503` database failure.

**Example response**

```json
{
  "userId": 42,
  "metrics": {
    "completionRate": 0.92,
    "disputeRate": 0.04,
    "totalVolume": "12500.00",
    "onTimeDeliveryPct": 0.88,
    "jobsStarted": 25,
    "jobsCompleted": 23,
    "jobsWithDispute": 1,
    "completedWithDeadline": 20,
    "onTimeDeliveries": 17
  },
  "reputationScore": 86.7,
  "computedAt": "2026-03-24T12:00:00.000Z"
}
```

### 2. Authenticated freelancer — `GET /api/freelancer/reputation`

- **Auth**: session / access cookie (same as `/api/auth/me`).
- **Resolution**: `users.wallet_address` must match the token’s wallet; returns that row’s reputation.
- **Query**: `?refresh=1` or `?refresh=true` forces a recomputation before responding (use sparingly).
- **Cache**: `Cache-Control: private, no-store`.
- **Errors**: `401` unauthenticated, `404` no `users` row for wallet, `503` database failure.

## Database setup

Run the migration after `001-create-tables.sql` / `002-auth-tables.sql`:

```bash
# Example: pipe into psql or Neon's SQL editor
scripts/003-freelancer-reputation.sql
```

This adds `jobs.completed_at`, table `freelancer_reputation`, and indexes on `(freelancer_id, status)` and completed jobs to keep aggregations fast as data grows.

## Frontend usage

- **Profile pages**: call the public route with the profile’s numeric `userId`.
- **Dashboard “my reputation”**: call `/api/freelancer/reputation` with `credentials: 'include'` (see existing dashboard fetch patterns in `lib/freelancer-dashboard.ts`).

After job completion flows (including the Stellar worker), ensure `completed_at` is set so **on-time delivery** stays accurate; the worker updates it when marking a job `completed` from escrow release.
