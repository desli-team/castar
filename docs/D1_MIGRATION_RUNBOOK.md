# D1 Migration Runbook

Production/remote migrations require explicit approval.

## Rules

- Do not run the full migration chain against an existing remote D1 database.
- Apply only reviewed, pending migration files.
- Run staging/non-prod first.
- After migration, smoke test auth, sync push/pull, deletes/tombstones, audit logs, and income analytics.

## Current pending scale-safety migrations

Apply in order after approval:

1. `backend/migrations/0010_sync_tombstones_tables.sql`
2. `backend/migrations/0011_scale_indexes.sql`

Convenience command after approval:

```bash
cd backend
npm run db:migrate:remote:latest
```

## Why the default remote script is guarded

Older migration files include table rebuilds and non-idempotent schema changes. Re-running the full chain on an already migrated D1 database can fail and makes deploy confidence worse. The default `db:migrate:remote` script intentionally refuses to run; use the reviewed latest-only script or apply one file manually.

## Local development

For a fresh local D1 database:

```bash
cd backend
npm run db:migrate:local:fresh
```

For the latest local scale-safety migrations only:

```bash
cd backend
npm run db:migrate:local:latest
```
