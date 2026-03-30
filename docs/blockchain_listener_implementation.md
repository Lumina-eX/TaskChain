# Blockchain Event Listener Service

## Overview
Implemented a background worker service that subscribes to Stellar blockchain events to keep the application state in sync. The service handles escrow deposits, releases, and refunds for both entire jobs and individual milestones.

## Key Components

### 1. Database Schema Extensions
- **Milestones Table (`scripts/004-milestones.sql`)**: Stores milestone-level progress, linked to jobs.
- **Notifications Table (`scripts/005-notifications.sql`)**: Stores platform-wide notifications for users.

### 2. Upgraded Background Worker (`scripts/worker.ts`)
- **Stellar Horizon Streaming**: Subscribes to payments for the platform escrow account.
- **Memo-based Logic**: Distinguishes between Job-level (`JOB-{id}`) and Milestone-level (`MIL-{id}`) operations using transaction memos.
- **Role-aware Processing**: Fetches client and freelancer wallet addresses to automatically identify whether a payment from escrow is a **Release** (to freelancer) or a **Refund** (to client).
- **Idempotency**: Checks `escrow_transactions` before processing to prevent duplicate updates from the same blockchain transaction.
- **Automatic Job Completion**: Synchronizes the main Job status to `completed` once all associated milestones have been released.
- **Real Notifications**: Inserts notification records directly into the database during event processing.

## How to Run
1. Ensure the new SQL migrations are applied to your database:
   ```bash
   # Run these in your Neon console or via psql
   scripts/004-milestones.sql
   scripts/005-notifications.sql
   ```
2. Set the necessary environment variables in `.env`:
   - `DATABASE_URL`: Your Postgres connection string.
   - `ESCROW_ACCOUNT_ID`: The Stellar account monitoring for escrow payments.
   - `STELLAR_HORIZON_URL`: (Optional) Defaults to Testnet.
3. Start the worker:
   ```bash
   npm run worker
   ```

## Design Decisions
- **Separation of Concerns**: Kept the worker as a separate script to avoid blocking Next.js API routes.
- **Resilience**: Implemented `SIGINT` handling for graceful shutdown and used SDK streaming for automatic reconnection.
- **Scalability**: Used async/await and non-blocking SQL queries to handle concurrent events.
