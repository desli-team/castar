# Castar Analytics Pro Implementation Plan

> Created: 2026-05-12  
> Goal: move Castar from expense tracker analytics to strong fintech analytics without speculative rebuilds.  
> Method: Karpathy-way-of-code — small slices, each with a validation gate.

## Product principle
Analytics should answer practical money questions:

- Where did my money go?
- What changed vs last period?
- How much can I safely spend?
- What recurring payments are coming?
- Which transactions need review?
- Am I improving month over month?

## Non-goals for this epic

- No bank integrations in this pass.
- No production deploy or remote D1 migration without explicit approval.
- No paid AI provider requirement.
- No raw transaction descriptions in analytics events.
- No speculative investment analytics until account/investment data exists.

## Feature set

### 1. Spending Breakdown 2.0
**User value:** understand expenses by category and drill into the actual transactions.

Scope:
- Category spend ranking.
- Current period vs previous period delta.
- Category detail drill-down.
- Top transactions inside category.
- Support 7D / 14D / 30D / month.

Success gate:
- User can tap a category and see transactions that explain the amount.
- TypeScript passes.

### 2. Cashflow Report
**User value:** understand whether money situation is improving.

Scope:
- Income, expense, net cashflow.
- Monthly buckets.
- Average monthly spend.
- Burn rate.
- Projected end-of-month net.

Success gate:
- Analytics screen shows income vs expense and net for selected period.
- Monthly trend data is derived locally from transaction ledger.

### 3. Budget Forecast / Safe-to-Spend
**User value:** make budgets actionable before user overspends.

Scope:
- Daily safe-to-spend.
- Pace-based projected spend.
- Forecast over-budget date.
- Category risk ranking.

Success gate:
- For each active budget, user sees safe daily amount and risk status.

### 4. Recurring / Subscription Intelligence
**User value:** reveal repeating payments and upcoming obligations.

Scope:
- Use explicit recurring rules first.
- Detect likely recurring transactions from similar description/category/amount cadence.
- Upcoming recurring payments.
- Amount changed warning.

Success gate:
- User can see upcoming explicit recurrings and likely subscriptions.

### 5. Transaction Review Workflow
**User value:** keep the ledger clean.

Scope:
- Reviewed/unreviewed state.
- Needs-category state.
- Potential duplicate warning.
- Review queue card.

Success gate:
- User can mark a transaction reviewed and analytics reflects remaining review count.

### 6. Net Worth / Accounts Analytics
**User value:** understand total position, not only spending.

Scope:
- Total account balances by currency.
- Asset/debt/receivable snapshot using accounts + debt/lending model.
- Basic trend only after balance history exists; current snapshot first.

Success gate:
- User sees current assets, debts owed, receivables, and net snapshot.

### 7. Smart Insights Feed
**User value:** no need to interpret dashboards manually.

Scope:
- Rule-based local insight cards first.
- Examples:
  - category spend up/down vs previous period
  - budget at-risk
  - recurring payment upcoming
  - unreviewed transactions
  - cashflow negative this month

Success gate:
- Analytics screen displays actionable insight cards with navigation targets.

## Implementation slices

### Slice 1 — Analytics engine foundation — Done
Files:
- `src/shared/services/analytics/analyticsPro.ts`

Deliver:
- Pure TypeScript local analytics functions.
- No UI assumptions.
- Inputs: transactions, categories, budgets, accounts, debts, recurrings.
- Outputs: cashflow, category breakdown, budget forecasts, recurring summary, net snapshot, insights.

Verify:
- `npm run typecheck`

### Slice 2 — Analytics screen upgrade — Done
Files:
- `src/features/analytics/screens/AnalyticsScreen.tsx`

Deliver:
- Show insights, cashflow, category breakdown, budget forecast, recurring, net snapshot cards.
- Keep existing UI style.
- Use existing navigation where possible.

Verify:
- `npm run typecheck`

### Slice 3 — Spending drill-down screen — Done
Files:
- `src/features/analytics/screens/SpendingCategoryDetailScreen.tsx`
- navigation types / navigator wiring

Deliver:
- Category → period spend → previous-period delta → transaction list.

Verify:
- `npm run typecheck`

### Slice 4 — Review workflow data model — Done
Files:
- local transaction schema/migrations
- sync/API types if needed
- transaction detail/list UI

Deliver:
- reviewed flag locally and through sync.
- Review queue card.

Verify:
- app typecheck + backend typecheck + tests.

### Slice 5 — Recurring detection — Done
Files:
- analytics service
- recurring screen/card UI

Deliver:
- Explicit recurring rules + likely recurring groups.
- Upcoming recurring payments.

Verify:
- `npm run typecheck`

### Slice 6 — Final hardening — Done
Deliver:
- Docs update.
- Full check.
- Manual QA checklist.

Verify:
- `npm run check`
- `git diff --check`

## Launch readiness blockers after this epic

- Real device QA.
- Authenticated non-prod sync smoke.
- Backend staging smoke for analytics endpoints.
- Remote D1 migration/deploy approval if schema changes are included.


## Implementation result — 2026-05-12

Completed in Karpathy-style slices and validated with `npm run check` + `git diff --check`.

Implemented:
- Pure local Analytics Pro engine: cashflow, monthly buckets, category breakdown, budget forecasts, recurring intelligence, net worth snapshot, review summary, smart insights.
- Analytics screen upgrade with actionable cards and navigation targets.
- Spending category drill-down screen with period delta and transaction list.
- Transaction review workflow with local/backend/sync `reviewed` flag, detail toggle, and review queue screen.
- D1 latest migration `0012_transaction_review.sql` for existing databases. Remote migration/deploy not run.

Remaining validation blockers:
- Real device QA.
- Authenticated non-prod sync smoke after applying reviewed migration in a non-prod D1.
- Product polish pass on final chart/visual hierarchy with Figma if desired.

## BI formula upgrade — 2026-05-12

Implemented a stronger deterministic BI layer without adding paid/remote AI dependencies.

### Spending comparison formulas
- Current vs previous period remains same-length window comparison.
- Category delta: `(currentAmount - previousAmount) / previousAmount * 100`.
- Category share: `categorySpend / totalExpense * 100`.
- Share shift: `currentShare - previousShare`.
- Cashflow now exposes income delta, expense delta, net delta, and savings rate: `net / income * 100`.

### Budget prediction formulas
- Pace: `spent / elapsedDays`.
- Projected spend: `pace * periodDays`.
- Safe-to-spend/day: `remaining / remainingDays`.
- Burn rate: `pace / allowedDailySpend * 100`.
- Projected over date: `budget.startDate + ceil(budget.amount / pace) days`.

### Subscription intelligence algorithm
Likely subscriptions are detected locally from expense history:
1. Group by normalized description + category + currency.
2. Require at least 3 transactions.
3. Use median gap, not average gap, for cadence robustness.
4. Detect weekly, bi-weekly, or monthly cadence.
5. Score cadence consistency using gap standard deviation.
6. Use median amount as baseline.
7. Score amount volatility by median absolute percentage deviation.
8. Score confidence from cadence consistency, amount stability, sample count, and recency.
9. Flag amount changes when latest amount differs from baseline by at least 10%.

This is still privacy-safe and local-first: no raw descriptions are sent to analytics providers.

### UI/UX consistency pass
- Analytics screen page margin now follows the app grid (`spacing.xl` / 24px), matching Home/Budget patterns.
- BI additions use existing tokens: `colors`, `typography`, `spacing`, `borderRadius`.
- Removed ad-hoc caption line-height from the new analytics insight body.
- Figma API pixel audit remains blocked until `FIGMA_ACCESS_TOKEN` is available; code-level token audit passed.
