# Castar Sync Conflict Policy

> Status: MVP client policy. Backend/device verification still required.

## Principles

1. SQLite is the local source of truth while the app is offline.
2. `sync_queue` is the authority for unsynced local intent.
3. Pull must not overwrite a record that has pending local changes.
4. Push happens before pull in `syncNow()`.
5. Conflict handling is deterministic and conservative: preserve local unsynced work first.

## Push queue compaction

Before a queue row is stored, Castar compacts pending changes by `tableName + recordId`:

- `create + update` → one `create` with latest payload
- `create + delete` → no-op; nothing is sent to the server
- `update + update` → one `update` with latest payload
- `update + delete` → one `delete`
- `delete + create` / undo:
  - remote record exists (`remoteId`) → `update`
  - local-only record → `create`
- `delete + update` → keep `delete`

## Pull/apply conflict guard

When `/sync/pull` returns server changes, each row is checked against local `sync_queue`:

- If the same record has pending local changes, skip applying the server row.
- If there is no pending local change, upsert the server row into local SQLite.
- After apply, refresh Zustand stores from SQLite.

This prevents server data from overwriting local edits that have not successfully synced yet.

## Timestamp behavior

- Last sync timestamp is stored per user in SecureStore.
- `syncNow()` runs push first, then pull.
- Pull advances the last sync timestamp after the response is processed.
- Skipped local-conflict rows are intentionally treated as local-wins-pending; the next successful push should resolve server state.

## Delete/tombstone behavior

Backend sync deletes and direct CRUD deletes write `sync_tombstones` rows with `table_name`, `record_id`, and `deleted_at`. Direct CRUD creates clear old tombstones for the same record ID.

When `/sync/pull` returns `deletions`:

- Client deletes the local record if there is no pending local change for the same record.
- Client skips the deletion if local pending work exists, preserving local intent.
- `skippedLocalConflicts` includes skipped deletions.

## Current limitations

- Pull apply is verified by TypeScript only; real backend/device verification is still pending.
- Conflict policy is last-local-intent-wins for pending rows, not full CRDT/merge.
- Tombstone retention cleanup policy is not implemented yet.

## Next hardening tasks

1. Add sync diagnostic screen or debug log for `pending/synced/failed/skippedLocalConflicts`.
2. Verify `/sync/push` and `/sync/pull` on real device with authenticated user.
3. Add tests for queue compaction, pull conflict guard, and tombstone application.
4. Add tombstone retention cleanup policy.
