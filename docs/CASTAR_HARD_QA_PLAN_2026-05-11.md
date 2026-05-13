# Castar Hard QA Plan — 2026-05-11

Scope: app-first Castar MVP/core stack through AI intent resolver, budgets/category limits, recurring transactions, debt/lending, offline sync, tombstones, and financial audit logs.

Status before this QA pass:
- Local implementation and TypeScript validation passed.
- Remote deploy / production D1 migration is intentionally out of scope.
- Real-device voice, keyboard, navigation, and authenticated sync smoke remain required.

## QA principles

1. Test the value loop end-to-end, not isolated screens only: capture → review → save → Home/list/detail → budget/debt side effect → sync queue → audit log.
2. Treat all financial writes as critical: no silent save with wrong amount, wrong direction, wrong account balance, or lost audit trail.
3. Offline-first must be proved: local save works without network, queue survives app restart, sync later drains safely.
4. AI/resolver output is always draft/review-safe: it must never silently save uncertain records.
5. Interface language and voice language are independent: RU/UZ/EN spoken input must work regardless of UI language.
6. User-facing copy must not say “candidate”; use draft/review/preview language.

## Environments

### Required
- iOS real device or simulator.
- Android real device or emulator.
- Fresh local app install.
- Existing local app install with previous SQLite DB.
- Offline mode / airplane mode.
- Safe non-prod backend + D1 with migrations through `0008_audit_logs.sql`.
- Test account with auth token.

### Optional but recommended
- Slow network / flaky network profile.
- Device locale EN, RU, UZ.
- UI language EN, RU, UZ if exposed in settings.
- Small-screen Android and larger iPhone.

## Release exit criteria

Pass only if all critical criteria below are true:

- No TypeScript/build validation failures.
- App does not crash during all P0/P1 flows.
- Every financial create/update/delete/restore produces the correct local state and a sync queue item.
- Every audited financial change produces a local `audit_logs` row with correct entity/action and useful before/after JSON where applicable.
- Offline-created records remain visible after app restart and sync later without duplication.
- Pull never overwrites a record that has a pending local queue change.
- Tombstones delete records on another device after sync, except when a local conflict guard intentionally skips.
- Debt repayments create correct linked ledger transactions and account balance adjustments.
- Budget alerts de-duplicate by budget + period + level.
- Voice/text parsing always lands in review before save.

## P0 — Smoke and data safety

### P0.1 Fresh install opens and seeds safely
Steps:
1. Install app fresh.
2. Open app and complete minimal auth/onboarding if required.
3. Navigate through Home, Add, Transactions, Tasks, Profile/Categories.
4. Kill and reopen app.

Acceptance criteria:
- App opens without crash.
- Default account/categories exist exactly once after reopen.
- Home does not show NaN/undefined/null.
- No duplicate default categories are created after restart.
- No sync queue failures are created by simple navigation.

### P0.2 Existing DB migration safety
Steps:
1. Install a build with an older SQLite DB if available, or simulate by using an existing app install before latest migrations.
2. Open latest app build.
3. Navigate to Budgets, Recurring, Debts, Add, Transactions.
4. Create one record in each feature area.

Acceptance criteria:
- Runtime SQLite patch creates missing advanced budget, debt, repayment, recurring, transaction debt_id, and audit_logs fields/tables.
- No duplicate-column crash on app open.
- All new records save locally.
- Audit log table exists and receives rows.

### P0.3 App restart persistence
Steps:
1. Create one transaction, one budget, one recurring rule, one debt, one repayment.
2. Kill app completely.
3. Reopen app.
4. Revisit every created record.

Acceptance criteria:
- All records are still present.
- Account balances remain consistent.
- Debt remaining amount remains consistent.
- Budget progress still reflects saved transactions.
- Sync queue pending count is not lost.

## P0 — Transaction capture and review

### P0.4 Single text expense happy path
Steps:
1. Open Add.
2. Enter `coffee 25000`.
3. Tap parse/review action.
4. Confirm one draft transaction appears.
5. Verify amount, type, category fallback, currency, date, description.
6. Save.
7. Open Home and Transactions.

Acceptance criteria:
- One review item appears before save.
- Save is disabled if amount is missing/invalid.
- Saved transaction appears in recent Home and transaction list.
- Monthly expense increases by 25000.
- Account balance decreases by 25000 for expense.
- `transactions:create` is queued.
- `audit_logs:create` is queued with `entityType=transactions`, `action=create`, `afterJson` populated.
- No raw audio is stored.

### P0.5 Single income happy path
Steps:
1. Add `salary 5000000 income` or equivalent supported income phrase.
2. Review and save.
3. Check Home and Transactions.

Acceptance criteria:
- Type is income or can be corrected before save.
- Monthly income increases by 5000000.
- Account balance increases by 5000000.
- Audit action is `create`.

### P0.6 Invalid amount guard
Steps:
1. Enter `coffee abc`.
2. Try save.
3. Enter `coffee -100`.
4. Try save.
5. Enter `coffee 0`.
6. Try save.

Acceptance criteria:
- App does not save invalid/zero/negative amount.
- UI shows clear “fix amount” / validation state.
- No transaction row is created.
- No audit log is created for failed attempts.
- No sync queue row is created for failed attempts.

### P0.7 Multi-transaction text save
Steps:
1. Enter `milk 20000, bread 8000, taxi 25000`.
2. Confirm 3 draft transactions appear.
3. Edit bread amount to 9000.
4. Remove taxi.
5. Save all.

Acceptance criteria:
- Exactly 3 drafts appear before editing.
- Removed draft is not saved.
- Exactly 2 transactions are saved.
- Bread amount is 9000.
- Account balance changes by 29000 total.
- Exactly 2 transaction audit create rows are created.
- Exactly 2 transaction sync queue rows are created.

### P0.8 Manual fallback save
Steps:
1. Open Add.
2. Use manual fields only: expense, amount 12345, category Food, description `manual qa`.
3. Save.

Acceptance criteria:
- Manual save works without parser.
- Category selected by user is preserved.
- `source` in audit/logging path indicates manual/add flow where available.
- Home/list/detail show same values.

### P0.9 Transaction edit updates balance and audit
Steps:
1. Open a saved expense amount 25000.
2. Edit amount to 30000.
3. Change category and description.
4. Save.

Acceptance criteria:
- Detail displays updated values.
- Home/list reflect updated amount/category.
- Account balance delta is corrected, not double-counted.
- Sync queue has final `transactions:update` for the record.
- Audit log has `action=update`, `beforeJson.amount=25000`, `afterJson.amount=30000`.

### P0.10 Transaction delete and undo
Steps:
1. Open transaction detail.
2. Delete transaction.
3. Verify it disappears from list/Home.
4. Tap undo/restore.
5. Verify it returns.

Acceptance criteria:
- Delete reverses account balance impact.
- Restore reapplies account balance impact once.
- Sync queue compaction ends in the correct final intent for that record.
- Audit logs include `delete` and `restore` actions with useful before/after JSON.
- No duplicate transaction appears after undo.

## P0 — Debt/lending

### P0.11 Create “I owe” debt manually
Steps:
1. Open Tasks → Debts & lending.
2. Create debt: direction `I owe`, person `John`, amount 100000, account Cash, category repayment expense category.
3. Save.
4. Open debt detail.

Acceptance criteria:
- Debt appears as active.
- Principal = 100000, remaining = 100000.
- No ledger transaction is created at debt creation.
- Account balance does not change at debt creation.
- Sync queue has `debts:create`.
- Audit log has `entityType=debts`, `action=create`.

### P0.12 Partial repayment for “I owe”
Steps:
1. Open John debt.
2. Add repayment 30000.
3. Return to debt detail and transaction list.

Acceptance criteria:
- Remaining becomes 70000.
- Debt status remains active.
- A linked expense transaction exists with `debtId=John debt id`.
- Account balance decreases by 30000 exactly once.
- Sync queue includes `debt_repayments:create`, `debts:update`, `transactions:create`.
- Audit logs include repayment create, linked transaction create, and debt update.

### P0.13 Full settlement for “I owe”
Steps:
1. Add repayment 70000 to same debt.
2. Check debt list/detail.

Acceptance criteria:
- Remaining becomes 0.
- Status becomes settled.
- `settledAt` is populated.
- Linked expense transaction exists.
- Audit debt action is `settle`.
- Settled debt appears in settled/history section, not active totals.

### P0.14 Create “owes me” debt and repayment
Steps:
1. Create debt: `Sarah owes me`, amount 50000.
2. Add repayment 20000.

Acceptance criteria:
- Remaining becomes 30000.
- Linked transaction type is income.
- Account balance increases by 20000.
- Active receivable total decreases correctly.
- Audit trail mirrors repayment side effects.

### P0.15 Debt quick parser create
Steps:
1. In Debts quick input, enter `I owe John 100`.
2. Save parsed result.
3. Repeat with `Sarah owes me 50`.
4. Repeat RU: `Я должен Сергей 1000`, `Сергей должен мне 500`.

Acceptance criteria:
- Parser creates draft/understood intent safely, not silent unrelated transaction.
- Correct direction/person/amount/currency default.
- Created debt appears active.
- No ledger transaction is created on debt creation.
- Audit log action create exists.

### P0.16 Debt quick parser repayment matching
Steps:
1. Ensure John and Sarah active debts exist.
2. Enter `paid John 30`.
3. Enter `Sarah paid me 20`.

Acceptance criteria:
- Parser matches existing active debt by person/direction.
- John repayment creates expense and reduces John remaining.
- Sarah repayment creates income and reduces Sarah remaining.
- If multiple matching active debts exist, app must not silently pick ambiguous wrong debt; it should ask/reject until disambiguated.
- Audit logs include repayment, transaction, debt update/settle.

### P0.17 Debt repayment overpay guard
Steps:
1. Open debt with remaining 70000.
2. Try repayment 80000.
3. Try repayment 0.
4. Try repayment -100.

Acceptance criteria:
- Save is blocked.
- User sees amount range error.
- No repayment/transaction/audit/sync row is created.

### P0.18 Debt delete
Steps:
1. Delete an active debt with no repayments.
2. Delete or attempt delete of a debt with repayments.
3. Sync/pull if available.

Acceptance criteria:
- Deleted debt disappears locally.
- Deletion queues tombstone/sync delete.
- Audit log has debt delete with beforeJson.
- Existing linked ledger transactions are not silently corrupted.
- If deletion of debt with repayment history is allowed, expected behavior is documented and consistent; otherwise UI blocks with clear message.

## P0 — Budgets, limits, alerts, category integration

### P0.19 Create category budget
Steps:
1. Open Profile → Categories.
2. Select expense category Food.
3. Tap Set category budget.
4. Create monthly budget amount 100000, warning 80%, critical 100%, hard limit on.

Acceptance criteria:
- Create Budget opens with Food preselected.
- Budget saves and appears in Budgets.
- Category row shows budget status/progress.
- Sync queue has `budgets:create`.
- Audit log has budget create.

### P0.20 Duplicate active budget guard
Steps:
1. With Food monthly budget already active, try creating another active Food monthly budget.
2. Try creating Food weekly budget.
3. Try creating all-expenses monthly budget.

Acceptance criteria:
- Second Food monthly active budget is blocked with clear duplicate warning.
- Food weekly is allowed.
- All-expenses monthly is allowed if no all-expenses monthly exists.
- Failed duplicate attempt creates no budget/audit/sync row.

### P0.21 Budget thresholds and alerts
Steps:
1. Food monthly budget = 100000, warning 80, critical 100.
2. Add Food expense 70000.
3. Add Food expense 15000.
4. Open Budget Alerts.
5. Add Food expense 20000.
6. Open Budget Alerts again.

Acceptance criteria:
- At 70000 no warning alert.
- At 85000 warning alert created once.
- Alert badge appears.
- Mark reviewed reduces unread badge.
- At 105000 critical/over alert created once.
- Reopening app does not duplicate same level alert for same budget+period.
- Budget progress and category progress match transaction totals.

### P0.22 Budget edit and delete audit
Steps:
1. Edit Food budget amount 100000 → 120000 and warning 80 → 75.
2. Delete/deactivate budget from detail.

Acceptance criteria:
- Budget detail/list reflect updated thresholds.
- Audit update row has before/after values.
- Delete/deactivate hides from active budget list and category active budget count.
- Audit delete row has beforeJson.
- Sync queue final state is correct.

### P0.23 Rollover calculation
Steps:
1. Create monthly budget with rollover enabled.
2. Ensure previous period spend is below previous period limit.
3. Move/test with current period calculation or seeded dates.
4. Compare displayed effective amount.

Acceptance criteria:
- Unspent previous allowance increases current effective limit.
- Overspend does not create impossible negative effective budget unless explicitly designed.
- Display explains rollover enough for user to understand.
- Rollover off shows base amount only.

## P0 — Recurring transactions

### P0.24 Create recurring rule
Steps:
1. Open Tasks → Recurring.
2. Create monthly expense: Netflix, 50000, next date tomorrow.
3. Save and reopen detail/list.

Acceptance criteria:
- Rule appears active.
- Next date is correct.
- No transaction is generated before due date.
- Sync queue has `recurrings:create`.

### P0.25 App-open catch-up generation
Steps:
1. Create recurring monthly expense with next date in the past.
2. Kill/reopen app.
3. Check transactions and recurring next date.
4. Kill/reopen again.

Acceptance criteria:
- Due transaction is generated once.
- Generated transaction has `isRecurring=true` and `recurringId` set.
- Account balance updates once.
- Recurring next date advances.
- Second reopen does not duplicate same occurrence.
- Safety cap prevents more than 24 generated occurrences in one run.

### P0.26 Pause/resume/delete recurring
Steps:
1. Pause active rule.
2. Reopen app with due date in past.
3. Resume rule.
4. Delete rule.

Acceptance criteria:
- Paused rule does not generate transactions.
- Resume re-enables future generation.
- Delete removes rule and queues delete/tombstone.
- No orphan duplicate generation after delete.

## P0 — AI intent resolver and language independence

### P0.27 Resolver transaction draft
Steps:
1. With auth/backend available, enter transaction phrase through Add text.
2. Disable network and repeat.

Acceptance criteria:
- Online path calls resolver and returns draft/review item.
- Offline/network failure falls back to deterministic parser.
- User always reviews before save.
- Unknown/low confidence does not silently save.

### P0.28 Resolver debt intent draft
Steps:
1. In Debts quick input, enter debt creation and repayment phrases.
2. Test RU/UZ/EN phrases.

Acceptance criteria:
- Debt create and repayment are routed to debt flow, not generic expense, when understood.
- Ambiguous debt repayment does not silently apply to wrong person/debt.
- Resolver provider shown internally as rules/fallback until real provider approved.

### P0.29 Voice language independent from UI language
Steps:
1. Set UI language EN, speak RU phrase.
2. Set UI language RU, speak EN phrase.
3. Set UI language UZ, speak RU and EN phrase.

Acceptance criteria:
- Cloud STT request includes RU/UZ/EN recognition options regardless of UI locale.
- UI language only affects preferred ordering, not allowed speech languages.
- Transcript appears in review before save.
- App handles STT failure with clear fallback path.

### P0.30 Voice privacy and analytics safety
Steps:
1. Save voice-created transaction.
2. Inspect local transaction/audit/analytics event payloads where possible.

Acceptance criteria:
- Raw audio is not persisted in transaction/audit logs.
- Analytics event does not include raw description, person name, exact amount, or audio.
- Audit log can include financial record before/after but should not include raw audio.

## P0 — Offline sync, tombstones, conflict guard

### P0.31 Offline create queue survival
Steps:
1. Turn on airplane mode.
2. Create transaction, budget, debt, repayment.
3. Kill/reopen app still offline.
4. Turn network on and authenticate.
5. Trigger sync.

Acceptance criteria:
- Records are usable offline immediately.
- Sync queue survives restart.
- Queue drains after network/auth returns.
- No duplicate records after sync.
- Audit logs for offline writes are also queued and pushed.

### P0.32 Push/pull restore on second device
Steps:
1. Device A creates transaction, budget, recurring, debt, repayment.
2. Sync A.
3. Fresh install/login on Device B.
4. Pull/sync B.

Acceptance criteria:
- B receives all record types: categories/accounts/transactions/budgets/recurrings/debts/debt_repayments/audit_logs.
- Linked IDs are preserved: transaction.debtId, repayment.transactionId, recurringId.
- Home totals match A.
- Audit log rows are present locally on B if inspection tooling available.

### P0.33 Tombstone delete propagation
Steps:
1. Device A creates and syncs a transaction/budget/recurring/debt.
2. Device B pulls and confirms it exists.
3. Device A deletes record and syncs.
4. Device B pulls.

Acceptance criteria:
- B applies deletion/tombstone for supported tables.
- Budgets/accounts soft-delete behavior is represented correctly.
- Audit logs are not deleted by tombstones.
- Pull result includes deletion count.

### P0.34 Local conflict guard
Steps:
1. Device A and B start synced with same transaction.
2. Device B goes offline and edits transaction amount.
3. Device A edits same transaction and syncs.
4. Device B comes online and pulls before its queue drains if possible.

Acceptance criteria:
- B does not overwrite its pending local change with A’s server row.
- `skippedLocalConflicts` increments/reporting exists.
- After B pushes, final state is deterministic according to current policy.
- No crash or duplicate queue rows.

### P0.35 Sync queue compaction
Steps:
1. Offline, create transaction.
2. Edit it twice.
3. Delete it before syncing.
4. Repeat with synced record: edit twice then delete.
5. Repeat with delete then restore.

Acceptance criteria:
- create+update compacts to create with latest payload.
- create+delete compacts/no-ops for local-only records.
- update+delete compacts to delete for remote records.
- delete+restore becomes update/create as appropriate.
- Audit logs remain append-only and are not compacted away if business wants full trace; if compacted, this must be explicitly accepted.

### P0.36 Audit log append-only backend
Steps:
1. Push audit log create to backend.
2. Attempt sync delete operation for same audit log in safe non-prod.
3. Pull audit logs.

Acceptance criteria:
- Create succeeds.
- Delete fails with append-only error.
- Pull returns audit row.
- App handles failed audit delete without breaking other sync operations.

## P1 — UX/UI and accessibility

### P1.1 Navigation coverage
Steps:
1. Visit every new screen from bottom tabs and nested navigation.
2. Use hardware/system back and visible BackButton.

Acceptance criteria:
- No dead ends.
- Back behavior returns to expected previous screen.
- Headers are consistent with Castar style.
- Safe-area spacing is correct on notched devices.

### P1.2 Keyboard behavior
Steps:
1. On small Android/iPhone, open Add, Create Budget, Create Debt, Add Repayment, Create Recurring.
2. Focus every field.
3. Submit/save with keyboard open.

Acceptance criteria:
- Keyboard does not hide required Save button or validation messages.
- Decimal keypad allows valid amounts.
- Date fields remain editable and validate invalid date.
- No layout jumps that make flow unusable.

### P1.3 Empty states
Steps:
1. Fresh app with no user-created transactions, budgets, recurring rules, debts.
2. Visit Home, Transactions, Budgets, Recurring, Debts, Alerts.

Acceptance criteria:
- Empty states explain next action.
- No blank white screens.
- No undefined/null labels.
- Primary CTA is visible where appropriate.

### P1.4 Visual consistency
Steps:
1. Compare new screens with existing Castar design tokens.
2. Check cards, chips, buttons, typography, colors, spacing.
3. Test light/dark mode if available.

Acceptance criteria:
- New screens do not look like a separate app.
- Touch targets are usable.
- Destructive actions are visually distinct and confirmed.
- Progress/alert colors are semantically consistent.

### P1.5 Accessibility basics
Steps:
1. Increase system font size.
2. Use screen reader labels where practical.
3. Navigate with keyboard/switch if emulator supports.

Acceptance criteria:
- Critical financial values remain readable.
- Buttons have clear labels.
- Important status is not color-only.
- No clipped text on common larger font settings.

## P1 — Edge cases

### P1.6 Currency handling
Steps:
1. Set profile currency UZS.
2. Create records with default currency.
3. If alternate currency input exists, create USD/RUB records.

Acceptance criteria:
- Currency is stored and displayed consistently.
- Budget progress should only include comparable currency transactions unless conversion exists.
- Debt repayment currency matches debt currency unless explicit conversion is supported.

### P1.7 Large numbers and decimals
Steps:
1. Enter 999999999.
2. Enter 12.50.
3. Enter `12,50`.
4. Enter spaces/thousand separators if supported.

Acceptance criteria:
- App parses decimals/comma decimals consistently.
- Large numbers do not overflow display.
- Invalid separators fail safely.

### P1.8 Dates and periods
Steps:
1. Create transactions at start/end of month.
2. Create budget weekly/monthly/yearly.
3. Create recurring next date Feb 28/29 if possible.

Acceptance criteria:
- Budget period totals include correct date boundaries.
- Recurring next date advances correctly across month lengths.
- Date input rejects invalid dates.

### P1.9 Auth/session expiry during sync
Steps:
1. Queue offline changes.
2. Expire/clear token.
3. Trigger sync.
4. Re-authenticate and trigger sync.

Acceptance criteria:
- Sync skips as unauthenticated without losing queue.
- User is not shown false success.
- Queue drains after auth returns.

### P1.10 Backend partial failure
Steps:
1. In safe non-prod, force one bad sync operation mixed with valid operations.
2. Push batch.

Acceptance criteria:
- Valid operations can succeed or failure behavior is clearly reported.
- Failed row keeps retry metadata.
- App does not mark failed row synced.
- User data remains locally available.

## P2 — Product polish

### P2.1 Terminology audit
Acceptance criteria:
- User-facing UI does not say “candidate”.
- Uses draft transaction, preview, review item, ready to save.

### P2.2 Analytics event audit
Acceptance criteria:
- Events are coarse and safe.
- No exact amount, raw description, person names, audio, debt counterparty names.

### P2.3 Monetization readiness regression
Acceptance criteria:
- Existing subscription screen does not block free MVP flows unexpectedly.
- No historical data deletion behavior is introduced before monetization rules are implemented.

## Agent-testable checks to run before every QA build

1. `npm exec -- tsc --noEmit`
2. `cd backend && npm run typecheck`
3. `git diff --check`
4. `cd backend && npx wrangler d1 execute castar-db --local --file=migrations/0008_audit_logs.sql`
5. `cd backend && npx wrangler d1 execute castar-db --local --command="PRAGMA table_info(audit_logs);"`
6. Static scan: verify `audit_logs` is present in API sync types, client sync pull/push tables, backend allowed tables, and backend table columns.

## Known blockers

- No automated Jest/Detox/unit test suite is configured yet.
- Direct Figma API/pixel audit remains blocked without `FIGMA_ACCESS_TOKEN`.
- Remote D1 migration/deploy requires explicit approval and is not part of this pass.
- Full voice reliability cannot be claimed before real-device/provider benchmark.
- Real authenticated sync smoke needs safe non-prod credentials/session.

## Recommended next engineering hardening

1. Add unit tests for parser, debt intents, budget progress/rollover, alert de-duplication, and sync queue compaction.
2. Add a dev-only Audit Log viewer or debug export for QA builds.
3. Add deterministic sync smoke script against local D1/worker mocks.
4. Add Detox or Maestro smoke flows for Add → Home/List, Budget alert, Debt repayment, Recurring generation.
5. Add a voice benchmark fixture runner for RU/UZ/EN phrases independent of UI language.
