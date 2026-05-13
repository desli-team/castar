# Recurring Generation Strategy

> Scope: app-first MVP. No production cron/deploy has been applied.

## Goal

Recurring rules should generate real transactions without corrupting balances or creating duplicates.

## Current implementation

### App-open catch-up fallback

Implemented in `src/shared/services/recurring/recurringGenerator.ts`.

On authenticated app startup, `AppProviders`:
1. loads local SQLite data into Zustand stores;
2. loads recurring rules into `useRecurringStore`;
3. runs `runRecurringCatchUp(userId)`;
4. then runs `syncService.syncNow()`.

For every active recurring rule with `nextDate <= now`, catch-up:
- creates generated transactions locally;
- marks generated transactions with `isRecurring: true` and `recurringId`;
- adjusts local account balance;
- queues generated transactions to `sync_queue` as `transactions:create`;
- advances the recurring rule to the next future occurrence;
- queues the recurring rule as `recurrings:update`.

### Duplicate protection

Before generating each occurrence, catch-up checks whether a transaction already exists with the same `recurringId` and exact scheduled `date`.

### Safety cap

Catch-up generates at most 24 occurrences per recurring rule per run. This prevents a very old daily rule from creating hundreds or thousands of transactions in one app open.

## Server cron strategy — next backend slice

When server-side scheduling is enabled, use the same behavior on backend:

1. Cloudflare Worker scheduled handler runs periodically.
2. It selects active `recurrings` where `next_date <= now`.
3. For each due occurrence:
   - check for an existing transaction with same `recurring_id` and scheduled `date`;
   - insert generated transaction;
   - adjust account balance;
   - advance `next_date`;
   - cap generated occurrences per rule per run.
4. Client pull receives generated transactions and recurring updates.

## Conflict rule

If app-open catch-up and server cron both run around the same time, duplicate check by `(recurring_id, date)` must keep generation idempotent.

## Pending

- Backend scheduled handler implementation.
- Optional DB uniqueness/index support for generated recurring transactions.
- Real-device QA for generated transactions appearing on Home/List after startup.
