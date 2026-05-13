# Castar Device QA Packet — 2026-05-12

Purpose: unblock real-device launch-readiness QA without requiring deploy, push, production action, remote D1 migration, credentials, or destructive changes.

Status at packet creation:
- Local validation gate: `npm run check` passed on 2026-05-12.
- Production deploy readiness: still blocked.
- Remote D1 migrations/deploy: not run.
- Authenticated non-prod sync smoke: not run.
- Real-device QA: not run.

## Tester setup

Use a clean QA build or Expo/dev build connected to local/offline app data unless a safe non-prod backend is explicitly approved.

Required evidence per tested device:
- Device/platform and OS version.
- App build/source branch or commit if available.
- Fresh install vs existing DB install.
- Network mode: online, offline, flaky if tested.
- Screenshots/video for any crash, wrong balance, wrong category, duplicate row, or blocked navigation.

Do not use real customer financial data.

## P0 local device pass — must run before staging deploy

### 1. Fresh install and seed safety
1. Fresh install and open app.
2. Visit Home, Add, Transactions, Monitoring/Analytics, Automation/Inbox, Profile, Categories.
3. Kill and reopen app.

Pass if:
- App does not crash.
- Default account/categories are present once, not duplicated.
- Home shows no `NaN`, `undefined`, `null`, or broken currency values.

### 2. Transaction capture value loop
1. Add text expense: `coffee 25000`.
2. Save from review/preview.
3. Confirm Home/list/detail show the same amount/type/category/date.
4. Edit amount to `30000`, save.
5. Delete, then undo/restore if available.

Pass if:
- Expense decreases balance once.
- Edit applies only the delta.
- Delete reverses balance; undo reapplies once.
- No duplicate transaction appears.

### 3. Multi-transaction draft review
1. Enter `milk 20000, bread 8000, taxi 25000`.
2. Confirm three drafts.
3. Edit bread to `9000`; remove taxi.
4. Save.

Pass if:
- Exactly two transactions are saved.
- Total balance impact is `29000` expense.
- Removed draft is not saved.

### 4. Income path
1. Add income: `salary 5000000 income` or use manual income fields.
2. Confirm Home income/analytics/list.

Pass if:
- Income increases balance once.
- Income appears in income analytics/source breakdown where available.

### 5. Budgets and alerts
1. Create Food/category monthly budget `100000`.
2. Add Food expense `70000`.
3. Add Food expense `15000`.
4. Open Budgets/Alerts.
5. Cross `100000` with another Food expense.

Pass if:
- Progress is stable and currency-safe.
- Warning alert appears once after crossing threshold.
- Critical/over alert appears once after crossing limit.
- Reviewed alerts reduce unread count.

### 6. Recurring automation
1. Create monthly recurring expense with next date in the past.
2. Restart app.
3. Reopen recurring list and transaction list.
4. Restart again.

Pass if:
- One generated transaction appears for due occurrence.
- Rule advances next date.
- Second restart does not duplicate the generated transaction.

### 7. Debt/lending
1. Create `I owe John` debt for `100000`.
2. Add repayment `30000`.
3. Add repayment `70000`.
4. Create `Sarah owes me` debt for `50000`.
5. Add repayment `20000`.

Pass if:
- Debt creation does not affect account balance.
- `I owe` repayments create expense transactions and reduce remaining.
- `Owes me` repayments create income transactions and reduce remaining.
- Fully repaid debt becomes settled.

### 8. Offline persistence
1. Turn on airplane/offline mode.
2. Create one transaction, one budget, one recurring rule, one debt, and one repayment.
3. Kill and reopen app while still offline.

Pass if:
- All records persist locally.
- Pending sync/diagnostic state is visible where implemented.
- No data loss after restart.

### 9. Voice/resolver smoke
1. Test at least one RU, UZ, and EN expense phrase.
2. Keep UI language independent from spoken language when possible.

Pass if:
- Voice/text resolver lands in review before save.
- Uncertain/malformed input can be corrected before save.
- No raw audio or sensitive transcript appears in user-visible diagnostics/logs.

## Non-prod sync smoke — blocked until approval/access

Run only after explicit approval for safe non-prod backend, D1 migrations, and test auth.

Minimum sync cases:
1. Device A creates transaction/category budget/recurring/debt/repayment.
2. Queue drains successfully.
3. Device B or reinstall pulls records.
4. Device A deletes a record; Device B receives tombstone delete.
5. Device B edits same record while local queue is pending; pull must not overwrite pending local change.
6. Audit log rows sync append-only and are not mutated/deleted.

## Exit decision template

- Device QA status: green / yellow / red.
- Critical blockers found:
- Non-critical issues found:
- Screenshots/videos attached:
- Recommendation: continue local fixes / approve staging deploy prep / block release.
