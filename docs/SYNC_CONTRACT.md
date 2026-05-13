# Castar Sync Contract

This is the canonical contract for app ↔ backend sync payloads.

## Scope

Sync tables:

- `categories`
- `accounts`
- `transactions`
- `budgets`
- `recurrings`
- `debts`
- `debt_repayments`
- `audit_logs`

Deletes are represented by `sync_tombstones` for all sync tables except `audit_logs`.
Audit logs are append-only.

## Push operation

Client sends queued local changes to `/sync/push` or `/sync/full`:

```ts
type SyncAction = 'create' | 'update' | 'delete';

type SyncOperation = {
  table: SyncTable;
  record_id: string;
  action: SyncAction;
  data?: Record<string, unknown>;
};
```

Rules:

- Backend always derives `user_id` from auth, never from client payload.
- Backend only accepts whitelisted columns per table.
- `create` is an upsert for retry safety.
- Transaction creates must adjust account balance only once for identical retry payloads.
- Transaction updates must rebalance when `account_id`, `type`, or `amount` changes.
- `audit_logs` accepts create/pull only; delete is rejected.

## Pull response

Backend returns changed rows and tombstones since `last_synced_at`:

```ts
type SyncPullRequest = {
  last_synced_at: number;
  tables?: SyncTable[];
  cursors?: Record<string, number | string>;
  limit?: number;
};

type SyncPullResponse = {
  changes: Partial<Record<SyncTable, unknown[]>>;
  deletions: Array<{
    table_name: Exclude<SyncTable, 'audit_logs'>;
    record_id: string;
    deleted_at: number;
  }>;
  next_cursors: Record<string, string>;
  has_more: boolean;
  total_changes: number;
  server_time: number;
};
```

Rules:

- Client applies pulled rows only when there is no pending local queue item for the same table/record.
- Client applies pulled tombstones only when there is no pending local queue item for the same table/record.
- Client follows `next_cursors` while `has_more` is true.
- Client stores `server_time` as last sync time only after all pages pull/apply successfully.

## Required schema alignment checks

Before staging sync smoke, verify these match across backend schema, local schema, API types, and sync mapping:

- table names
- required/nullable columns
- enum values
- timestamp columns
- protected server-owned fields
- tombstone-supported tables

## Current known caveats

- `/sync/pull` is cursor-paginated per table using stable `updated_at:id` cursors, so rows sharing the same millisecond are not skipped between pages.
- Conflict resolution is last-write/pending-local guard, not record revision based yet.
- Local DB is not encrypted yet.
