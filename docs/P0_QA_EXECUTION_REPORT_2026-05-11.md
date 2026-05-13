# Castar P0 QA Execution Report — 2026-05-11

Scope: first hard P0 QA pass after financial audit log + sync foundation chunk.

## What was executed by agent

### Validation gates

- [x] App TypeScript: `npm exec -- tsc --noEmit`
- [x] Backend TypeScript: `cd backend && npm run typecheck`
- [x] Git whitespace/conflict check: `git diff --check`
- [x] Local D1 audit migration: `npx wrangler d1 execute castar-db --local --file=migrations/0008_audit_logs.sql`
- [x] Local D1 audit schema inspection: `PRAGMA table_info(audit_logs);`
- [x] Static sync scan confirms `audit_logs` is wired in:
  - client API sync table type
  - client sync table allowlist
  - client pull/apply path
  - backend sync allowed tables
  - backend audit table columns
  - local Drizzle schema

### Static QA audits

- [x] Audit-log write coverage scan for financial flows.
- [x] User-facing “candidate” terminology scan in Add Transaction screen.
- [x] Transaction detail balance side-effect review.

## Findings

### P0-FIXED-001 — User-facing “candidate” terminology leaked in manual Add flow

Severity: P1 product/UX, fixed during QA.

Evidence:
- Button title in `AddTransactionScreen.tsx` was `Create candidate`.
- Internal code terminology is allowed, but user-facing copy should use draft/preview/review language.

Fix:
- Changed button title to `Create preview`.
- Changed thrown validation error from `Invalid candidate amount` to `Invalid draft transaction amount`.

Acceptance after fix:
- User-facing Add flow no longer shows “candidate” in visible button/error copy found by static scan.
- Internal names/types/events can remain technical.

Validation:
- App TypeScript passed.
- Backend TypeScript passed.
- `git diff --check` passed.

### P0-FIXED-002 — Transaction edit/delete/undo did not update local account balance

Severity: P0 financial correctness, fixed during QA.

Why it matters:
- Transaction create already adjusted local account balance.
- Debt repayment and recurring generation already adjusted local account balance.
- Transaction detail edit/delete/undo changed transaction rows but did not locally reverse/apply account balance deltas.
- This could leave account balances wrong until server sync or forever in offline-first mode.

Fix:
- Added local signed amount helper in `TransactionDetailScreen.tsx`.
- On transaction edit:
  - compute `newSignedAmount - oldSignedAmount`
  - apply only the delta to the account.
- On delete:
  - reverse the transaction’s signed amount.
- On undo/restore:
  - reapply the transaction’s signed amount once.

Acceptance after fix:
- Editing expense 25000 → 30000 applies account delta `-5000`, not `-30000`.
- Editing expense 25000 → income 25000 applies account delta `+50000`.
- Deleting expense 25000 applies `+25000`.
- Restoring same expense applies `-25000` once.
- Deleting income 25000 applies `-25000`.
- Restoring same income applies `+25000` once.

Validation:
- App TypeScript passed.
- Backend TypeScript passed.
- `git diff --check` passed.

## Current P0 status

### Passed by agent/local validation

- TypeScript validation for app/backend.
- Diff whitespace validation.
- Local audit-log D1 migration and schema inspection.
- Static audit-log wiring for sync push/pull/backend.
- Static confirmation that key financial flows record audit logs:
  - transaction create/update/delete/restore
  - budget create/update/delete
  - debt create/update/delete/settle
  - debt repayment + linked transaction + debt update/settle
- Static fix for user-facing candidate terminology leak.
- Static fix for transaction detail local account balance side effects.

### Still needs human/device/non-prod execution

- P0.1 Fresh install opens and seeds safely.
- P0.2 Existing DB migration safety on installed app DB.
- P0.3 App restart persistence.
- P0.4–P0.10 transaction capture/detail flows on real device.
- P0.11–P0.18 debt/lending flows on real device.
- P0.19–P0.23 budget/category/alert/rollover flows on real device.
- P0.24–P0.26 recurring flows on real device.
- P0.27–P0.30 resolver/voice/privacy flows.
- P0.31–P0.36 offline sync, tombstones, conflict guard, append-only audit backend in safe non-prod.

## Recommended next fixes/tests

1. Add automated unit coverage for transaction balance deltas:
   - expense amount edit
   - expense → income type switch
   - delete/restore
2. Add unit coverage for sync queue compaction, especially delete → restore and audit log append-only behavior.
3. Add a dev-only Audit Log viewer/export for QA builds so device testers can verify audit rows without DB access.
4. Run real-device P0.1–P0.18 next; these are most likely to expose navigation, keyboard, and local SQLite issues before non-prod sync.

## Current release confidence

Confidence: medium for local code correctness, low-to-medium for real-device release readiness until P0 device and non-prod sync smoke pass.

Do not move to monetization until:
- P0 transaction/debt/budget/recurring device flows are green.
- Non-prod sync smoke verifies transactions, debts, repayments, budgets, recurring, tombstones, and audit_logs.

## Additional no-device QA pass — deploy readiness

### Additional validation gates

- [x] Expo Doctor: `npx expo-doctor` — 17/17 checks passed after dependency fixes.
- [x] App dependency audit high/critical gate: 0 high, 0 critical; 8 moderate remain in app dev/tooling dependency chain.
- [x] Backend dependency audit gate: 0 vulnerabilities after `hono`/`wrangler` update.
- [x] Sensitive backend log scan: OTP code logging removed; Telegram callback full params/full URL logging removed; email/phone recipient logs redacted.

### P0-FIXED-003 — Audit coverage gaps in Home budget and recurring flows

Severity: P0/P1 auditability, fixed during QA.

Fix:
- Home quick budget create/update now records and sync-queues audit logs.
- Automatic Home budget currency conversion now records and sync-queues audit logs.
- Recurring create/update/pause/resume/delete now records and sync-queues audit logs.
- Recurring catch-up generated transactions and rule advancement now record and sync-queue audit logs.

### P0-FIXED-004 — Backend auth logs exposed sensitive OTP/auth data

Severity: P0 security/privacy before deploy, fixed during QA.

Fix:
- Removed OTP code logging.
- Removed Telegram callback full params/full URL logging.
- Redacted email/phone recipient logs in email/SMS services.

### P1-FIXED-005 — Expo/dependency release blockers

Severity: P1 deploy readiness, fixed during QA.

Fix:
- Installed missing `react-native-worklets`.
- Aligned `expo-dev-client` and `expo-linking` with Expo SDK 54 patch expectations.
- Backend audit now reports zero vulnerabilities.
- App audit high/critical vulnerabilities are cleared; only moderate tooling-chain findings remain.

Deploy readiness details: `docs/DEPLOY_READINESS_REPORT_2026-05-11.md`.

