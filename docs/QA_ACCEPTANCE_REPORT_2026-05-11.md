# Castar QA Acceptance Report — 2026-05-11

## Scope

QA pass for the current app-first MVP slice after budget limits, rollover, budget alerts inbox, category-budget integration, and Debt/Lending chunk 1 work.

Changed feature areas reviewed:

- Transaction capture: text/manual/voice path wiring, candidate review, local save.
- Home value loop and transaction list/detail.
- Multi-transaction parsing.
- Offline sync foundation and backend migrations.
- Budgets: create/edit/progress, advanced limits, rollover, alert events, alert inbox/history, category integration.
- Recurring transactions: list/create/edit/pause/delete and app-open catch-up.
- UX/UI consistency changes for new budget/recurring/task screens.
- Debt/lending: manual IOU creation, quick parser intents, partial/full repayment, settled history, linked transactions, and sync schema foundation.

## Agent-verifiable checks run

- [x] App TypeScript: `npm exec -- tsc --noEmit`
- [x] Backend TypeScript: `npm run typecheck`
- [x] Git whitespace/conflict check: `git diff --check`
- [x] Backend local D1 migrations: `npm run db:migrate:local`
- [x] Local D1 schema inspection confirms:
  - `budgets.warning_threshold`
  - `budgets.critical_threshold`
  - `budgets.is_hard_limit`
  - `budgets.rollover_enabled`
  - `budget_alerts` table with expected columns
  - `debts` and `debt_repayments` migration applied locally
  - `transactions.debt_id` exists locally/backend migration

## Acceptance criteria status

### Milestone 1 — Capture UI and transaction candidates

Acceptance:

- [x] User can log one expense from text.
  - Status: code path implemented; TypeScript passes.
- [~] User can log one expense from voice.
  - Status: voice button → STT → parse → review → save code path is wired.
  - Blocker: needs real device/provider test before full pass.
- [x] User can log multiple expenses from one text input.
  - Status: parser split + candidate list + confirm all implemented.
- [x] User can edit before saving.
  - Status: candidate edit/remove/category cycling implemented.

Human/device QA needed:

1. Open Add Transaction.
2. Enter `milk 20000, bread 8000, taxi 25000`.
3. Confirm 3 review items appear.
4. Edit one amount/category.
5. Save all.
6. Confirm transactions appear in Home/list.
7. Repeat with voice in RU/UZ/EN.

### Milestone 2 — Home and transaction list value loop

Acceptance:

- [x] After saving a transaction, Home can update from Zustand/local state.
  - Status: Add flow inserts SQLite + Zustand and Home reads store.
- [x] User can find, edit, and delete a saved transaction.
  - Status: list/detail/edit/delete/undo code paths implemented.
- [~] Undo recently saved transaction from Add flow.
  - Status: not implemented; delete undo exists in detail.

Human/device QA needed:

1. Save an expense.
2. Check Home monthly spend/net/recent list updates.
3. Open Transactions.
4. Search/filter by type/category/period.
5. Open detail, edit amount/description/category.
6. Delete, then undo.

### Milestone 3 — Multi-transaction parsing hardening

Acceptance:

- [x] A shopping-list sentence creates multiple editable candidates.
  - Status: implemented and type-safe.
- [ ] Shared merchant/context support.
  - Status: missing. Example `milk 20k, bread 8k from Korzinka` does not yet reliably apply merchant/context to all items.

Human/device QA needed:

1. Test comma/semicolon/newline/conjunction splits.
2. Test invalid amount → save disabled.
3. Test mixed income/expense phrase where possible.

### Milestone 4 — Backend CRUD and sync

Acceptance:

- [~] Local changes sync to backend.
  - Status: sync queue push/pull foundation implemented; backend typecheck passes.
  - Agent verified: local D1 migrations run successfully.
  - Blocker: real endpoint/device authenticated sync smoke still pending.
- [~] Pull restores data after reinstall/login.
  - Status: pull/apply code exists with conflict guard.
  - Blocker: needs authenticated device/non-prod backend test.

Human/non-prod QA needed:

1. Apply migrations to safe non-prod D1 only.
2. Create transaction/budget/recurring on device A.
3. Verify queue drains.
4. Login on device B/reinstall.
5. Verify pull restores records.
6. Delete a record on A, verify tombstone delete on B.
7. Create local pending edit on B, pull from server, verify local conflict guard does not overwrite pending change.

### Milestone 5 — Budgets and recurring core

Budget acceptance:

- [~] User creates Food budget and sees progress after spending.
  - Status: implemented; budget list/detail progress uses local transactions.
  - Agent verified: advanced budget fields and budget_alerts schema exist in local D1.
  - Human/device QA still needed for UI/keyboard/visual behavior.
- [x] Advanced budget thresholds.
  - Status: warning/critical thresholds, soft/hard limit, rollover-enabled flag implemented.
- [x] Rollover calculation.
  - Status: effective amount includes previous periods' allowance minus previous spend when rollover is enabled.
- [x] Budget alert event creation.
  - Status: alerts evaluate on transaction save and app startup; de-duped by budget + period + level.
- [x] Budget alerts inbox/history.
  - Status: screen, unread badge, mark-one/mark-all-reviewed implemented.
- [~] OS-level notifications.
  - Status: not implemented; package `expo-notifications` is not installed.

Budget/category human/device QA needed:

1. Open Profile → Categories and confirm expense categories show budget status/progress when budgets exist.
2. For a category without budget, tap “Set category budget” and confirm Create Budget opens with that category selected.
3. Try creating a second active budget for the same category + period; confirm save is blocked with duplicate warning.
4. Create monthly Food budget amount 100000, warning 80%, critical 100%, hard limit on.
5. Add Food expense 70000 → budget stays Safe.
6. Add Food expense 15000 → Warning alert is created.
7. Open Budgets → Alerts badge appears.
8. Open Alerts → warning alert visible with spent/limit/%.
9. Mark reviewed → badge decreases.
10. Add another expense crossing 100% → Critical/Over alert visible.
11. Enable rollover on a budget with previous-period transactions → effective budget shows rollover adjustment.

Recurring acceptance:

- [~] User creates recurring Netflix/rent and sees next due date.
  - Status: code path implemented.
  - Blocker: real-device QA pending.
- [x] App-open catch-up fallback.
  - Status: implemented with duplicate guard and 24-occurrence safety cap.

Recurring human/device QA needed:

1. Create recurring monthly expense.
2. Pause/resume it.
3. Edit amount/date/category.
4. Set next date in past, restart app, verify generated transaction and advanced next date.
5. Confirm duplicate transaction is not generated on second restart.

### Milestone 6 — Debt/lending

Acceptance:

- [~] User can track `I owe John 100` and partial repayment.
  - Status: manual UI + local SQLite + Zustand + sync queue code paths implemented.
  - Repayment creates linked expense transaction and reduces remaining balance.
- [~] User can track `Sarah owes me 50` and settlement.
  - Status: manual UI + local SQLite + Zustand + sync queue code paths implemented.
  - Repayment creates linked income transaction and settles at zero.

Agent-verifiable status:

- [x] Tasks → Debts & lending navigation wired.
- [x] `DebtsScreen`, `CreateDebtScreen`, `DebtDetailScreen`, `AddRepaymentScreen` added.
- [x] Quick IOU parser added on Debts screen.
- [x] Parser smoke passed for: `I owe John 100`, `Sarah owes me 50`, `paid John 30`, `Sarah paid me 20`, `Я должен Сергей 1000`, `Сергей должен мне 500`.
- [x] Local schemas/query/store added for `debts` and `debt_repayments`.
- [x] Runtime SQLite patches create debt tables and `transactions.debt_id`.
- [x] Backend migration `0007_debts.sql` added and executed locally.
- [x] Backend `/debts` route foundation added.
- [x] Sync supports `debts` and `debt_repayments` tables.

Debt/lending human/device QA needed:

1. Open Tasks → Debts & lending.
2. Create `I owe John`, amount 100000, account + category selected.
3. Add repayment 30000 → confirm remaining 70000 and expense transaction appears in ledger.
4. Add repayment 70000 → confirm status becomes Settled.
5. Create `Sarah owes me`, amount 50000.
6. Add repayment 20000 → confirm remaining 30000 and income transaction appears.
7. Delete a debt and confirm it disappears locally and queues sync deletion.
8. Repeat while offline, then authenticate/sync in safe non-prod and confirm queue drains.

Remaining: global Add/voice debt intent routing is deferred until debt-specific quick parser is device-tested.

### Milestone 7 — Subscription/monetization

Acceptance:

- [ ] User understands premium value.
- [ ] Downgrade does not delete historical data.

Status: subscription screen exists, but monetization logic/free-paid limits/downgrade behavior are not implemented.

## P0 QA execution

First hard P0 agent-verifiable QA pass is recorded in `docs/P0_QA_EXECUTION_REPORT_2026-05-11.md`.

Fixed during QA:
- User-facing “candidate” wording in Add Transaction manual flow changed to preview/draft language.
- Transaction detail edit/delete/undo now adjusts local account balance deltas correctly.

## Hard QA matrix

A full P0/P1/P2 use-case matrix with specific steps and acceptance criteria is maintained in `docs/CASTAR_HARD_QA_PLAN_2026-05-11.md`.

## QA blockers

1. No automated unit/e2e test suite is configured in `package.json`.
2. Real-device QA is required for React Native navigation, keyboard, voice, and visual behavior.
3. Figma pixel QA remains blocked without Figma access/export alternative.
4. Remote/non-prod sync smoke requires an approved safe D1/backend environment.
5. OS notifications require a product decision and dependency/config work, likely `expo-notifications`.

## Recommended next fixes before moving to new product features

1. Add lightweight parser/utility tests for:
   - multi-transaction parsing
   - budget rollover math
   - alert de-duplication
   - sync queue compaction
2. Run real-device QA for Add → Home → List → Detail → Budget → Alerts → Recurring.
3. Do safe non-prod backend sync smoke.
4. Device-test Debt/Lending manual flow before implementing parser/voice debt intents.


## Financial audit log QA

Status: implementation ready; TypeScript/local D1 validation passed; device/authenticated backend smoke pending.

Checklist:
- [ ] Create transaction from Add flow and verify an `audit_logs` create row is queued.
- [ ] Edit transaction and verify before/after JSON is recorded.
- [ ] Delete and undo transaction and verify delete/restore audit events.
- [ ] Create/update/delete budget and verify audit events.
- [ ] Create debt, add repayment, settle/delete debt and verify debt + repayment + linked transaction audit events.
- [x] Apply local D1 migration and inspect `audit_logs` schema.
- [x] Run app TypeScript, backend TypeScript, and diff whitespace validation.
- [ ] Run authenticated sync smoke and verify audit logs reach backend without allowing deletes.

Risk:
- Remote D1 migration `0008_audit_logs.sql` is prepared but intentionally not applied without deployment approval.
