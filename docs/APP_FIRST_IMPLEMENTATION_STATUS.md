# Castar App-First Implementation Status

> Updated: 2026-05-12  
> Overall plan progress: ~96%  
> Scope: mobile app-first Castar MVP/core stack.  
> Source plan: `docs/APP_FIRST_CORE_PRD.md` and `docs/APP_FIRST_IMPLEMENTATION_ROADMAP.md`.

## Legend

- [x] Done
- [~] In progress / partially done
- [ ] Not started
- [!] Blocked / requires approval or decision


## Analytics Pro implementation — 2026-05-12

Goal: upgrade Castar from basic expense analytics to a stronger app-first fintech analytics suite.

- [x] Added `docs/ANALYTICS_PRO_IMPLEMENTATION_PLAN.md`.
- [x] Added pure local Analytics Pro engine: spending breakdown, cashflow, monthly buckets, budget forecast/safe-to-spend, recurring intelligence, transaction review summary, net worth/accounts snapshot, and smart insights.
- [x] Upgraded BI formulas for spending comparisons, cashflow deltas, savings rate, budget burn rate, and subscription detection confidence.
- [x] Subscription amount-change detection now compares latest amount against median historical baseline, with cadence consistency and volatility scoring.
- [x] Analytics UI consistency pass applied against repo design tokens/grid; exact Figma pixel audit still requires `FIGMA_ACCESS_TOKEN`.
- [x] Strict 2026-05-12 UX/UI code-level audit completed for Analytics Pro and nearby changed screens:
  - [x] Analytics drill-down/review screens use safe-area-aware top spacing and 24px grid padding.
  - [x] Income Analytics header/content aligned to `spacing.xl` grid and tokenized elevated nav background.
  - [x] Transaction list/detail now use shared `BackButton` instead of raw text chevrons.
  - [x] Budget/Tasks right chevrons now use SVG icon pattern instead of text glyphs.
  - [x] Remaining 1:1 Figma parity is explicitly blocked without Figma access/screenshots.
- [x] CJM drill-down fixes completed after product flow review:
  - [x] `Transactions` accepts optional prefilters for category/type/period.
  - [x] Category detail history rows open transaction detail.
  - [x] Category detail spent card opens transactions prefiltered by that category.
  - [x] Category detail limit card opens budget detail when a budget exists, otherwise category edit.
  - [x] Monitoring latest transaction rows open transaction detail while the header opens the full list.
  - [x] Categories now include income categories instead of hiding them from category management.
- [x] Budget allocation logic added:
  - [x] Shared monthly-equivalent normalization for budget periods.
  - [x] Category limit form now supports `1D / 7D / 14D / 30D` periods.
  - [x] Budget/category forms show monthly equivalent for non-monthly limits.
  - [x] Budget/category forms warn when normalized category limits exceed the active total budget.
  - [x] Warning is non-blocking by design; users can intentionally over-allocate while seeing the risk.
- [x] Category tier policy slice added:
  - [x] New users seed 5 editable expense starter categories plus locked Other Expense.
  - [x] New users seed Salary, Freelance, and locked Other Income.
  - [x] Other categories are the protected fallback for unmatched AI/text/voice categories.
  - [x] Free tier blocks custom category creation; paid tiers are prepared for unlimited custom categories.
  - [x] Backend categories and sync reject renaming/type-changing/deleting locked Other categories.
- [x] Inbox feature implemented as deterministic review engine:
  - [x] Repurposed Tasks screen into Inbox while keeping Recurring and Debts under Automation.
  - [x] Added no-AI Inbox engine for unresolved review items: unreviewed transactions, Other-category suggestions, possible duplicates, unusual spend, budget alerts, allocation warnings, recurring due/overdue, and debt due/overdue.
  - [x] Home card now shows real Inbox open/critical/warning counts and opens Inbox.
  - [x] Confirmed transactions stay out of Inbox unless a later unresolved issue is detected.
  - [x] Tab label changed from Tasks to Inbox across locale files.
- [x] Upgraded Analytics screen with insights, cashflow trend, spending breakdown, budget forecast, recurring intelligence, and net worth cards.
- [x] Added spending category drill-down screen.
- [x] Added transaction review workflow:
  - [x] Local transaction `reviewed` flag and safe runtime migration patch.
  - [x] Backend schema/API/sync support for `reviewed`.
  - [x] D1 latest migration `backend/migrations/0012_transaction_review.sql` for existing databases.
  - [x] Transaction detail reviewed toggle.
  - [x] Review queue screen for unreviewed, uncategorized, and possible duplicate transactions.
- [x] Updated guarded backend migration scripts so remote latest only applies the reviewed migration when explicitly approved.

Validation:
- [x] `npm run check`
- [x] `git diff --check`

Remaining blockers:
- [!] Remote D1 migration/deploy not run; requires explicit approval.
- [!] Real device QA still needed.
- [!] Authenticated non-prod sync smoke still needed after migration.

## Audit hardening pass — 2026-05-12

Goal: fix launch-readiness audit findings in small verified slices before any deploy or remote D1 migration.

- [x] P0 backend ownership hardening.
  - [x] Sync rejects cross-user caller-provided IDs instead of overwriting global records.
  - [x] Transaction/debt/sync routes validate referenced accounts, categories, debts, recurring rules, and linked transactions belong to the authenticated user.
  - [x] Account balance updates are scoped by `id + user_id`.
- [x] P0 sync correctness hardening.
  - [x] Client pushes dependent local accounts/categories before records that reference them.
  - [x] Pull creates local fallback deleted account/category records for nullable references, so valid rows are not dropped while the cursor advances.
  - [x] Pull pagination now fails closed if page cap is reached before all pages apply.
- [x] P1 removed unused account-transfer product ghost.
  - [x] Product-facing financial types are now limited to `income` and `expense`.
  - [x] Transaction, category, recurring, validation, API, backend, and schema types no longer advertise unsupported account transfers.
- [x] P1 balance atomicity.
  - [x] Direct transaction create/update/delete batches ledger row changes with balance adjustments.
  - [x] Sync transaction create/update/delete batches ledger row changes with balance adjustments.
  - [x] Debt repayment creation batches linked transaction, balance adjustment, repayment row, and debt remaining/status update.
- [x] P1 budget correctness.
  - [x] Budget progress screens read more local transaction history instead of relying on the first 100 in-memory rows.
  - [x] Client budget math ignores unconvertible cross-currency transactions instead of mixing raw currencies.
  - [x] Backend budget progress honors `start_date` and filters spend by budget currency.
- [x] P2 UX/semantics hardening.
  - [x] Category limit disable deactivates and syncs the previous budget instead of leaving an active stale limit.
  - [x] Delete account now clearly blocks as unsupported instead of pretending to delete while only logging out.
  - [x] Phone/email/Telegram profile edits now block as unsupported instead of saving local-only values.
  - [x] Pulled account/budget deletes preserve soft-delete semantics locally.

Validation:
- [x] `npm run check`
- [x] `git diff --check`

Remaining blockers:
- [!] Real device QA.
- [!] Authenticated non-prod sync smoke.
- [!] Backend income analytics staging smoke.
- [!] Remote D1 migration/deploy requires explicit approval.
- [!] Account-transfer feature is intentionally out of MVP scope and removed from the active model.

## Milestone 1 — Capture UI and transaction candidates

Goal: make the core app action usable.

- [x] Replace `AddTransactionScreen` stub with app-first capture screen.
  - [x] Text input
  - [x] Voice button connected to existing voice service
  - [x] Manual fallback fields
  - [x] Parsed transaction candidate preview
  - [x] Confirm/save/edit/discard actions
- [x] Add transaction candidate model in client code.
  - [x] Amount, currency, type, category, date, description
  - [x] Confidence
  - [x] Source: voice/text/manual
  - [~] Raw text is available; audio URI is not persisted yet
- [x] Extract transaction candidate utilities into `src/features/transactions/utils/transactionCandidates.ts`.
- [x] Extend parser to support multi-transaction inputs.
- [x] Map parsed category hints to existing categories with fallback to Other.
- [x] Save confirmed candidates via local SQLite + Zustand `transactionStore`.
- [x] Queue created transactions in `sync_queue` for future backend sync.
- [x] Track safe analytics events without raw descriptions, names, audio, or exact amounts.
- [x] Add review status UX for candidates: `Ready`, `Review`, `Fix amount`.
- [x] Block saving when candidate is invalid.

Acceptance gate status:
- [x] User can log one expense from text.
- [~] User can log one expense from voice if STT route works in runtime; code path is connected, real device/provider test still needed.
- [x] User can log multiple expenses from one text input.
- [x] User can edit before saving.

## Milestone 2 — Home and transaction list value loop

Goal: show value immediately after logging.

- [x] Home monthly value snapshot.
  - [x] Current month income
  - [x] Current month expenses
  - [x] Net
  - [x] Top category
  - [x] Recent transactions preview
- [x] Home Figma pass updated for screenshot-aligned budget/remainder card.
  - [x] Large remainder amount and spent-percent caption.
  - [x] Category spending visualization and legend.
  - [x] Latest Transactions card replaces user-facing “posts” wording in English UI.
  - [x] Existing 1D/7D/14D/30D filter logic preserved for budget spend window.
- [x] Full transaction list improvements.
  - [x] Chronological list polish
  - [x] Filter by period/type/category
  - [x] Search by description/category
- [~] Transaction detail improvements.
  - [x] Edit amount, description, type, category
  - [x] Delete with local SQLite removal + sync queue delete
  - [x] Immediate undo for deleted transaction
  - [ ] Undo recently saved transaction from Add flow

Acceptance gate status:
- [x] After saving a transaction, Home can update from Zustand/local state.
- [x] User can find, edit, and delete a saved transaction.

## Milestone 3 — Multi-transaction parsing production hardening

Goal: make multi-entry usable, not just technically possible.

- [x] Basic split by commas, semicolons, new lines, and common conjunctions.
- [ ] Shared merchant/context support.
  - Example: `milk 20k, bread 8k from Korzinka` should apply merchant/context where useful.
- [x] Candidate list UI.
  - [x] Confirm all
  - [x] Edit one
  - [x] Remove one
- [x] Confidence rules.
  - [x] Amount required
  - [x] Type/category can default but stay visible

Acceptance gate status:
- [x] A shopping-list sentence creates multiple editable candidates.

## Milestone 4 — Backend CRUD and sync

Goal: turn local app into reliable multi-device-ready app.

- [~] Local sync queue is now populated, compacted, pushes pending operations to `/sync/push`, and pulls server changes from `/sync/pull` when authenticated/online.
- [~] Fill backend CRUD routes — core routes exist and typecheck; real endpoint/device verification pending.
  - [~] Transactions — CRUD exists, tombstones aligned
  - [~] Categories — CRUD exists, income/expense type aligned
  - [~] Accounts — CRUD exists, tombstones aligned
  - [~] Budgets — CRUD exists, tombstones aligned
  - [~] Recurrings — CRUD exists, income/expense type aligned
  - [~] Settings — basic get/update exists
- [~] Apply/verify D1 migrations — migration files updated and backend typecheck passes; not applied to remote.
- [~] Implement sync endpoint with conflict strategy — client guard + backend/CRUD tombstones done, real backend/device verification pending.
- [ ] Connect React Query hooks to real endpoints where needed.
- [x] Keep SQLite as offline source of truth.
- [x] Compact duplicate/conflicting sync queue entries per record.
  - [x] create + update => create with latest payload
  - [x] create + delete => no-op
  - [x] update + delete => delete
  - [x] delete + undo/create => update for remote records, create for local-only records
- [x] Sync service push foundation.
  - [x] Skips safely when offline or unauthenticated
  - [x] Converts queued rows to `/sync/push` operations
  - [x] Marks successful queue rows synced
  - [x] Records failure attempts for invalid/server/network errors
- [x] Sync pull/apply foundation.
  - [x] Stores per-user last sync timestamp in SecureStore
  - [x] Pulls categories/accounts/transactions/budgets/recurrings/debts/debt repayments from `/sync/pull`
  - [x] Upserts pulled rows into local SQLite
  - [x] Refreshes Zustand stores after apply
  - [x] Runs after app startup when authenticated
- [x] Client conflict guard.
  - [x] Documented in `docs/SYNC_CONFLICT_POLICY.md`
  - [x] Pull skips server rows when same record has pending local queue changes
  - [x] Sync result reports `skippedLocalConflicts`
- [x] Backend tombstone/change-log foundation for deletes.
  - [x] Added migration `backend/migrations/0003_sync_tombstones.sql`
  - [x] Sync delete operations record tombstones
  - [x] Direct CRUD deletes also record tombstones
  - [x] Direct CRUD creates clear old tombstones for recreated/restored IDs
  - [x] `/sync/pull` and `/sync/full` return `deletions`
  - [x] Client applies pulled deletions unless local pending changes exist
  - [x] Added migration `backend/migrations/0010_sync_tombstones_tables.sql` so tombstones support debts and debt repayments on migrated D1 databases.
- [x] Backend/app payload alignment fix pass.
  - [x] Added migration slot `backend/migrations/0004_mvp_income_expense_types.sql` as a no-op after removing the unused account-transfer model.
  - [x] Fresh backend schema supports only `income`/`expense` financial types.
  - [x] Backend category/transaction/recurring validation accepts only `income`/`expense`.
  - [x] Client API/types accept only `income`/`expense` for active financial records.

Acceptance gate status:
- [x] Sync create balance adjustment is now idempotent for duplicate transaction creates.
- [x] Backend transaction account-change updates now rebalance old/new accounts.
- [x] Canonical sync contract documented in `docs/SYNC_CONTRACT.md`.
- [x] Added focused backend tests for transaction balance adjustment idempotency and account-change rebalance.
- [x] Added backend `npm test` script using Node's built-in test runner.
- [x] Added scale indexes for sync pull, transaction analytics/lists, accounts, debts, debt repayments, and local sync queue lookup.
  - [x] Backend migration: `backend/migrations/0011_scale_indexes.sql`.
  - [x] Local safe schema patch adds matching app-side indexes where applicable.
- [x] Added NetInfo-based online/offline sync trigger.
- [x] Added sync diagnostics in Settings: online state, pending count, failed count, last sync, last error, retry action.
- [x] Added paginated `/sync/pull` contract with stable `updated_at:id` cursors, limits, `has_more`, and client-side pull loop.
- [x] Virtualized heavier list screens with `FlatList`/`SectionList`: transactions, budgets, budget alerts, categories, recurring rules, and debts.
- [x] Added analytics payload sanitizer to prevent accidental raw text/name/audio/exact-amount event properties.
- [x] Added D1 migration runbook and guarded default remote migration script from rerunning the full migration chain.
- [~] Local changes sync to backend — client push foundation done, real backend/device verification pending.
- [~] Pull restores data after reinstall/login — client pull/apply foundation done, real backend/device verification pending.

## Milestone 4.5 — Financial audit log

Goal: make financial changes auditable before broader monetization/production hardening.

- [x] Added local `audit_logs` schema and safe runtime SQLite patch.
- [x] Added local audit query layer: `src/shared/services/database/auditLogQueries.ts`.
- [x] Added backend migration: `backend/migrations/0008_audit_logs.sql`.
- [x] Added `audit_logs` to sync table contract as append-only records.
- [x] Added client pull/apply handling for remote audit logs.
- [x] Recorded audit events for transaction create/update/delete/restore.
- [x] Recorded audit events for budget create/update/delete.
- [x] Recorded audit events for debt create/update/delete/settle.
- [x] Recorded audit events for debt repayment side effects: repayment record, linked transaction, and debt balance/status update.
- [x] Recorded audit events for Home budget quick create/update and automatic budget currency conversion.
- [x] Recorded audit events for recurring rule create/update/pause/resume/delete.
- [x] Recorded audit events for recurring catch-up generated transactions and rule advancement.

Acceptance gate status:
- [x] Local code path exists and typechecks.
- [x] Audit records are queued to sync.
- [x] Local D1 migration `0008_audit_logs.sql` applies successfully and schema was inspected.
- [~] Remote D1 migration is prepared but not applied; no production/remote action taken.
- [ ] Real authenticated sync smoke for audit logs pending.
- [x] Hard QA matrix created: `docs/CASTAR_HARD_QA_PLAN_2026-05-11.md`.
- [x] First P0 agent-verifiable QA execution report created: `docs/P0_QA_EXECUTION_REPORT_2026-05-11.md`.
- [x] Fixed P0 financial correctness issue: transaction detail edit/delete/undo now adjusts local account balances.
- [x] Fixed user-facing terminology leak: manual Add button now says preview instead of candidate.
- [x] Deploy readiness report created: `docs/DEPLOY_READINESS_REPORT_2026-05-11.md`.
- [x] Expo Doctor passes 17/17 after dependency alignment.
- [x] Backend npm audit reports 0 vulnerabilities; app high/critical audit issues cleared.

## Milestone 4.6 — Income sources and income analytics

Goal: make income first-class, not just the opposite of expense.

- [x] Income transactions already supported by shared transaction model, local DB, backend CRUD, and sync.
- [x] Default income categories exist: Salary, Freelance, Investments, Other income.
- [x] Manual Add flow can be opened in income mode from analytics.
- [x] Manual Add flow now has currency chips so income can be logged in UZS/USD/EUR/RUB/default currency.
- [x] Added Monitoring → Income Analytics screen.
  - [x] Period filters: This month / 3 months / All time.
  - [x] Total income converted to profile/default currency.
  - [x] Income sources breakdown by income category.
  - [x] Original-currency display per source.
  - [x] Currency breakdown with approximate default-currency value.
  - [x] Six-month income trend.
  - [x] Recent income list.
- [x] Added Monitoring entry point/card for Income Analytics.
- [x] Refactored Income Analytics to backend-authoritative with local cache/fallback.
  - [x] Screen first shows cached backend analytics when available.
  - [x] Screen refreshes from backend `/transactions/income-analytics` when online/authenticated.
  - [x] Fresh backend analytics is cached locally for fast future loads and offline viewing.
  - [x] If backend/cache is unavailable, screen falls back to local SQLite/Zustand calculations.
  - [x] UI shows source state: backend / cached backend / offline local fallback.
- [x] Added backend `/transactions/income-analytics` aggregation endpoint for source/currency/month/recent income groups.
- [~] Backend endpoint is typechecked but still needs authenticated non-prod smoke after staging deploy.

Acceptance gate status:
- [x] User can log income with a chosen manual currency locally.
- [x] User can view income by source and currency locally.
- [x] App has scalable backend-authoritative analytics contract with offline cache fallback.
- [~] Remote income analytics endpoint verification pending with authenticated staging backend.

## Milestone 5 — Budgets and recurring core

Goal: deliver automation pillars.

- [x] Budget schema and Home budget UI exist.
- [x] Budget list/create/edit/progress hardening.
  - [x] Added active budget list screen
  - [x] Added budget detail screen with spend/remaining/progress
  - [x] Added create/edit form with period and category selection
  - [x] Budget create/update/delete writes local SQLite + Zustand
  - [x] Budget changes are queued to `sync_queue`
  - [x] Home quick budget modal also queues budget sync changes
- [~] Advanced budgets and limits.
  - [x] Added warning threshold per budget
  - [x] Added critical threshold per budget
  - [x] Added soft/hard limit flag
  - [x] Added rollover-enabled flag
  - [x] Budget list/detail now show safe/warning/critical/over status
  - [x] Budget create/edit now manages thresholds and flags
  - [x] Local SQLite schema patch adds advanced limit columns safely
  - [x] Backend schema/routes/sync allow advanced budget fields
  - [x] Rollover balance calculation across previous periods
  - [~] Actual in-app notifications/push alerts when thresholds are crossed: local alert events and in-app alert history exist; OS push/local notification presentation still pending
- [x] Budget alert event creation.
  - [x] Added local `budget_alerts` schema/query module
  - [x] Evaluates budget alerts after transaction save
  - [x] Evaluates budget alerts on app startup
  - [x] De-duplicates alerts by budget + period + level
  - [x] Added backend migration `backend/migrations/0006_budget_alerts.sql` for future backend parity
  - [x] Added `BudgetAlertsScreen` inbox/history
  - [x] Added Alerts entry point + unread badge on Budgets screen
  - [x] Added mark-one / mark-all-reviewed actions
  - [x] Connected budgets to expense categories in `CategoriesScreen`
  - [x] Category rows show active budget count, status, progress, spent/limit
  - [x] Categories without budgets can open preselected category budget creation
  - [x] Budget creation prevents duplicate active budget for same category/all-expenses + period
  - [x] Budget category selector shows when a category already has an active budget for selected period
- [x] Recurring schema exists.
- [x] Recurring create/list/edit/pause/delete UI.
  - [x] Added recurring Zustand store
  - [x] Added Tasks entry point for recurring transactions
  - [x] Added recurring list screen with active/paused states
  - [x] Added create/edit form with type, amount, description, frequency, next date, account, and category
  - [x] Pause/resume updates local SQLite + Zustand and queues sync update
  - [x] Delete removes local rule and queues sync delete
  - [x] Create/update queues sync changes
- [~] Recurring generation job strategy.
  - [ ] Server cron if available
  - [x] App-open catch-up fallback
- [x] Generated transactions link to `recurringId`.
  - [x] Generated transactions are marked `isRecurring: true`
  - [x] Generated transactions queue `transactions:create`
  - [x] Recurring rule advancement queues `recurrings:update`
  - [x] Duplicate guard checks existing `recurringId + date`
  - [x] Safety cap limits catch-up to 24 generated occurrences per rule per run

Acceptance gate status:
- [~] User creates recurring Netflix/rent and sees next due date — code path implemented, app-open catch-up implemented, real device UX test pending.
- [~] User creates Food budget and sees progress after spending — code path implemented, real device UX test pending.

## Milestone 6 — Debt/lending

Goal: support IOUs without corrupting expense/income logic.

- [x] Add local and backend schema for debts and repayments.
  - [x] Added local Drizzle schemas: `debts`, `debt_repayments`, and `transactions.debtId`
  - [x] Added runtime SQLite safe patches for installed local DBs
  - [x] Added backend migration `backend/migrations/0007_debts.sql`
  - [x] Added backend `/debts` CRUD/repayment route foundation
  - [x] Added sync support for `debts` and `debt_repayments`
- [x] Add Debt/Lending UI under Tasks/Automation.
  - [x] Added Tasks card: `Debts & lending`
  - [x] Added debt list with active/settled sections and summary totals
  - [x] Added create/edit debt flow for `I owe` and `Owes me`
  - [x] Added debt detail screen with progress and repayment history
  - [x] Added add repayment screen
- [x] Add parser intents.
  - [x] Borrowed from / `I owe` / `borrowed from`
  - [x] Lent to / `owes me`
  - [x] Paid back / `paid John 30`
  - [x] Got paid back / `Sarah paid me 20`
  - [x] RU examples covered in parser smoke: `Я должен Сергей 1000`, `Сергей должен мне 500`
- [x] Repayment creates linked real transaction.
  - [x] `I owe` repayment creates an expense transaction
  - [x] `Owes me` repayment creates an income transaction
  - [x] Transaction links to `debtId`
  - [x] Repayment reduces remaining balance and settles at zero
  - [x] Account balance is adjusted locally and via backend route

Acceptance gate status:
- [~] User can track `I owe John 100` and partial repayment — manual + quick-parser code paths implemented, real-device QA pending.
- [~] User can track `Sarah owes me 50` and settlement — manual + quick-parser code paths implemented, real-device QA pending.


## Milestone 6.5 — AI intent resolver

Goal: make capture AI-native while keeping deterministic fallback and user review.

- [x] Added backend resolver endpoint: `POST /intent/resolve`.
- [x] Added resolver schema/prompt endpoint: `GET /intent/schema`.
- [x] Added strict intent/draft contract for:
  - [x] transaction
  - [x] debt_create
  - [x] debt_repayment
  - [x] budget_create
  - [x] recurring_create
  - [x] dashboard_query / unknown placeholders
- [x] Resolver receives context: UI language, default currency, categories, accounts, active debts.
- [x] Resolver chooses category only from existing category IDs.
- [x] Add Transaction text/voice now calls resolver first, then falls back to local parser if unavailable.
- [x] Debt quick parser now calls resolver first, then falls back to deterministic debt parser.
- [~] Current backend provider is `rules_fallback`; approved real AI model/provider is still a product/security/cost decision.

Acceptance gate status:
- [x] Contract and JSON schema exist.
- [x] App is wired to the resolver layer.
- [~] True AI semantic categorization depends on connecting an approved model behind the same endpoint.
- [ ] Real-device QA for resolver → review → save flows.

## Milestone 7 — Subscription/monetization

Goal: add business model after core flows are credible.

- [ ] Define free/paid limits.
- [ ] Add subscription schema/API.
- [~] Subscription screen exists in navigation, but monetization logic is not complete.
- [ ] Contextual upgrade prompts.
- [ ] Graceful downgrade behavior.

Acceptance gate status:
- [ ] User understands premium value.
- [ ] Downgrade does not delete historical data.

## Voice-to-text status

- [x] Online STT architecture exists: backend proxy route `/api/voice/recognize`.
- [x] Offline STT architecture exists: VOSK via `react-native-vosk`.
- [x] Interface languages are separate from voice input languages.
- [x] Supported MVP voice input languages in code: Uzbek, Russian, English.
- [x] Cloud STT is multilingual by default: UI language is only preferred ordering; RU/UZ/EN are all sent to recognition.
- [x] Voice button in Add Transaction is wired to recognition → parse → review candidates → local DB save.
- [!] Real-device/provider quality benchmark is still needed before claiming 99% reliability.
- [!] Uzbek quality is the main risk; VOSK offline Uzbek may be weak.

Recommended benchmark:
- [x] Create voice QA benchmark plan: `docs/VOICE_QA_BENCHMARK.md`
- [ ] Prepare 50–100 short RU/UZ/EN expense utterances, including mixed UI/input cases such as Russian UI + English speech.
- [ ] Test Google Cloud STT, Groq Whisper, Deepgram.
- [ ] Score by full pipeline success: transcript → parser → candidate review → DB save, not just transcript accuracy.

## UX/UI consistency status

- [x] Added mandatory UX/UI consistency task: `docs/UX_UI_FIGMA_CONSISTENCY_TASK.md`
- [x] Audit new screens against original repo design tokens: colors, typography, spacing, grid, radii.
- [~] Audit new screens against Castar Figma: blocked for direct API export because `FIGMA_ACCESS_TOKEN` is not available in runtime; repository-token audit completed.
- [~] Apply small UI corrections for Budget, Recurring, Transactions, Add Transaction, and Tasks screens.
  - [x] Added shared SVG `BackButton`
  - [x] Replaced raw text back chevrons in Budget/Recurring sub-screens
  - [x] Aligned new screens with safe-area top spacing instead of hardcoded `paddingTop`
- [ ] Capture screenshots or real-device visual evidence where tooling allows.
- [x] Added audit report: `docs/UX_UI_CONSISTENCY_AUDIT_2026-05-11.md`
- [x] Added acceptance QA report: `docs/QA_ACCEPTANCE_REPORT_2026-05-11.md`

## Automation status

- [x] Castar autonomous loop prompt prepared: `/opt/ai-org/workspaces/core-director/projects/castar-ai-team/DAILY_JOB_PROMPT.md`.
- [!] Cron creation is blocked by OpenClaw Gateway scope approval / pairing.
- [ ] After approval, create recurring job every 30 minutes in Telegram topic Castar.

## Current next recommended task

1. Run UX/UI consistency audit against original repo rules and Castar Figma.
2. Build voice benchmark fixture set and parser test runner for RU/UZ/EN mixed UI/spoken cases.
3. Real-device QA for capture/list/detail/budget/recurring/debt/audit-log flows against local SQLite.
4. Safe authenticated sync smoke for transactions, budgets, debts, repayments, tombstones, and audit logs.

## User tiers, roles, and premium entitlement foundation — 2026-05-12

Goal: formalize Castar account access before QA/Figma pricing/locked-state work, without changing Voice AI limits.

- [x] Split monetization from permissions:
  - [x] `tier`: `free | premium` for product limits.
  - [x] `role`: `user | support | admin` for operational access.
  - [x] `subscription_status` and `premium_until` added for future payment-provider lifecycle.
- [x] Added backend entitlement service:
  - [x] Free: starter access, one sync device, no custom categories.
  - [x] Premium/support/admin: custom categories, Analytics Pro, budget alerts, recurring automation, multi-device sync entitlement.
  - [x] Voice AI limits intentionally not included or changed.
- [x] Added additive D1 migration `backend/migrations/0013_user_roles_entitlements.sql`:
  - [x] user access columns.
  - [x] `subscriptions` table skeleton for future provider integration.
  - [x] `sync_devices` table for multi-device entitlement tracking.
- [x] Updated auth/settings defaults so newly created users are `free` + `user` + `subscription_status = none`.
- [x] Settings API now returns normalized `tier`, `role`, subscription status, premium expiry, and entitlements.
- [x] Category creation and sync category creation now use centralized entitlement checks instead of ad-hoc `tier !== free` checks.
- [x] Added sync-device endpoints:
  - [x] `GET /sync/devices`
  - [x] `POST /sync/devices`
  - [x] `DELETE /sync/devices/:id`
  - [x] Free users are limited to one active sync device; Premium can use up to five.
- [x] App API types/hooks updated for settings entitlements and sync devices.
- [x] Settings screen now surfaces plan, role, key locked features, and multi-device sync slot count.
- [x] Unit tests added for free/premium/expired/support entitlement behavior, including a guard that Voice AI entitlement is not introduced.

Validation:
- [x] `npm run check`

Remaining blockers:
- [!] Remote D1 migration/deploy not run; requires explicit approval.
- [!] Payment-provider integration is intentionally not implemented yet.
- [!] Final pricing/upgrade copy and Figma locked-state screens still need product/design approval.

## Profile plan badge and user-facing role cleanup — 2026-05-12

Goal: expose subscription status where users naturally look, while keeping internal roles out of user-facing settings.

- [x] Removed `role` from the Settings screen UI; role remains backend-only for ops/support/admin checks.
- [x] Added compact plan badge to the main Profile screen, directly under identity/header actions.
- [x] Free state shows starter access and one-device sync, with an Upgrade CTA routed to Subscription Management.
- [x] Premium state shows Analytics Pro and multi-device sync, with Manage CTA and optional premium expiry text.
- [x] Badge follows existing Castar dark glass/card style and uses a subtle premium green glow only for Premium.
- [x] Voice AI limits remain untouched.

Validation:
- [x] `npm run check`
- [x] `git diff --check`

## Profile tier chip simplification — 2026-05-12

Correction after product review: the Profile surface should show only the user's tier/status, not explanatory plan marketing copy.

- [x] Replaced the larger Profile plan badge/card with a compact tier chip.
- [x] Chip shows only `Free` or `Premium` with a small status dot.
- [x] Removed user-facing copy like “Free plan”, “Starter categories”, sync-device copy, and Upgrade/Manage CTA text from the Profile surface.
- [x] Kept tap target routed to Subscription Management for future plan details.
- [x] Settings still hides internal role from users.
- [x] Voice AI limits remain untouched.

Validation:
- [x] `npm run check`

## Device QA packet — 2026-05-12

Goal: convert remaining real-device launch blockers into a concrete tester-ready pass without deploy, push, remote D1 migration, credentials, or destructive actions.

- [x] Added `docs/DEVICE_QA_PACKET_2026-05-12.md`.
- [x] Included P0 local device pass for fresh install, seed safety, transaction capture, multi-draft save, income, budgets/alerts, recurring, debt/lending, offline persistence, and voice/resolver smoke.
- [x] Included evidence requirements and pass/fail criteria so QA can report release readiness instead of vague feedback.
- [x] Kept non-prod sync smoke explicitly blocked until approved backend/D1/test-auth access exists.

Validation:
- [x] `npm run check`

Remaining blockers:
- [!] Real-device QA still not executed.
- [!] Authenticated non-prod sync smoke still requires approved environment/access.
- [!] Remote D1 migration/deploy still requires explicit approval.
