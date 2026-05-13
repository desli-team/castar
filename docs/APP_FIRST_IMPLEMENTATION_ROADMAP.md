# Castar App-First Implementation Roadmap

> Status: draft v1  
> Based on repo inspection on current `main` checkout and `docs/APP_FIRST_CORE_PRD.md`.

## 1. Current repo baseline

Repo already has a strong app foundation:
- Expo SDK 54 / React Native 0.81 / TypeScript.
- Feature-first structure.
- Auth/onboarding screens.
- Local SQLite + Drizzle schema/query layer.
- Backend scaffold on Cloudflare Workers + Hono + D1 migrations.
- Voice service layer: cloud recognition, offline recognition, parser, unified voice service.
- Categories, budgets, recurrings, accounts, transactions schemas exist.
- Main UI screens exist but Add Transaction is currently only a stub.

Important current gap: the app has architecture for several core pillars, but the capture UX and product flows are not yet implemented deeply enough.

## 2. Immediate build order

### Milestone 1 — Capture UI and transaction candidates
Goal: make the core app action usable.

Tasks:
1. Replace `AddTransactionScreen` stub with app-first capture screen:
   - voice record button
   - text input
   - manual fields
   - parsed transaction candidate preview
   - confirm/save/edit/discard actions
2. Add transaction candidate model in client code:
   - amount, currency, type, category, date, description
   - confidence
   - source: voice/text/manual
   - rawText/audioUri
3. Extend parser to support multi-transaction inputs.
4. Map parsed category hints to existing categories, fallback to Other.
5. Save confirmed candidates via `transactionStore`.
6. Track analytics events without sensitive raw descriptions.

Acceptance gate:
- User can log one expense from text.
- User can log one expense from voice if STT returns text.
- User can log multiple expenses from one text input.
- User can edit before saving.

### Milestone 2 — Home and transaction list value loop
Goal: show value immediately after logging.

Tasks:
1. Home summary:
   - current month expenses
   - current month income
   - net
   - top 3 categories
   - recent transactions
2. Transactions list:
   - chronological list
   - filter by period/type/category
   - search by description
3. Transaction detail:
   - edit/delete
   - undo recently saved transaction

Acceptance gate:
- After saving a transaction, Home updates immediately.
- User can find and edit/delete a saved transaction.

### Milestone 3 — Multi-transaction parsing production hardening
Goal: make multi-entry usable, not just technically possible.

Tasks:
1. Split inputs by commas, semicolons, conjunctions, and language-specific separators.
2. Support shared merchant/context:
   - “milk 20k, bread 8k from Korzinka” → merchant/context applies to all if useful.
3. Candidate list UI:
   - confirm all
   - edit one
   - remove one
4. Confidence rules:
   - amount required
   - type/category can default but must be visible

Acceptance gate:
- A shopping-list sentence creates multiple editable candidates.

### Milestone 4 — Backend CRUD and sync
Goal: turn local app into reliable multi-device-ready app.

Tasks:
1. Fill backend CRUD routes:
   - transactions
   - categories
   - accounts
   - budgets
   - recurrings
   - settings
2. Apply/verify D1 migrations.
3. Implement sync endpoint with conflict strategy.
4. Connect React Query hooks to real endpoints where needed.
5. Keep SQLite as offline source of truth.

Acceptance gate:
- Local changes sync to backend.
- Pull restores data after reinstall/login.

### Milestone 4.5 — Financial audit log
Goal: preserve accountability for financial creates, edits, deletes, restores, settlements, and repayment side effects.

Tasks:
1. Add local `audit_logs` schema/query layer. ✅
2. Add backend D1 migration `0008_audit_logs.sql`. ✅
3. Add sync support for append-only `audit_logs`. ✅
4. Record audit events for transaction create/update/delete/restore. ✅
5. Record audit events for budget create/update/delete. ✅
6. Record audit events for debt create/update/delete/settle and repayment-created ledger transactions. ✅

Acceptance gate:
- Financial changes have before/after JSON where useful.
- Audit logs are append-only and queued for backend sync.
- Audit logging must not block user-visible local save if remote sync is unavailable.

### Milestone 5 — Budgets and recurring core
Goal: deliver automation pillars.

Tasks:
1. Budget list, create/edit budget, progress calculation.
2. Budget alert event creation.
3. Recurring create/list/edit/pause/delete.
4. Recurring generation job strategy:
   - server cron if available
   - or app-open catch-up generation as fallback
5. Generated transactions must link to recurringId.

Acceptance gate:
- User creates recurring Netflix/rent and sees next due date.
- User creates Food budget and sees progress after spending.

### Milestone 6 — Debt/lending
Goal: support IOUs without corrupting expense/income logic.

Tasks:
1. Add local and backend schema for debts and repayments. ✅
2. Add Debt/Lending UI under Tasks/Automation. ✅
3. Add parser intents: ✅
   - borrowed from / I owe
   - lent to / owes me
   - paid back
   - got paid back
4. Repayment creates linked real transaction. ✅

Acceptance gate:
- User can track “I owe John 100” and partial repayment — implemented, device QA pending.
- User can track “Sarah owes me 50” and settlement — implemented, device QA pending.

Remaining debt/lending slice:
- Human/device QA for navigation, keyboard, account/category selection, quick parser, and repayment history.
- Safe authenticated sync smoke in non-prod.
- Optional: wire debt intent parsing into global Add/voice capture after debt-specific quick parser is validated.


### Milestone 6.5 — AI intent resolver
Goal: make Castar AI-native for capture while preserving review safety.

Tasks:
1. Add backend `/intent/resolve` contract. ✅
2. Add resolver prompt and strict JSON schema. ✅
3. Send context: UI language, default currency, categories, accounts, active debts. ✅
4. Return draft actions for transaction, debt creation, debt repayment, budget, recurring, dashboard query, or unknown. ✅
5. Wire Add Transaction text/voice capture through resolver first. ✅
6. Keep local parser as fallback when resolver is unavailable. ✅
7. Wire Debt quick parser through resolver first, with deterministic fallback. ✅
8. Later: connect approved AI model/provider behind the same contract.

Acceptance gate:
- User text/voice can be classified into the correct financial intent before save.
- Categories are chosen from the user's existing category list only.
- Ambiguous input returns `missing_fields` + `next_question`.
- No AI output silently creates records without review.

### Milestone 7 — Subscription/monetization
Goal: add business model only after core flows are credible.

Tasks:
1. Define free/paid limits.
2. Add subscription schema/API.
3. Subscription screen UI.
4. Contextual upgrade prompts.
5. Graceful downgrade behavior.

Acceptance gate:
- User understands premium value.
- Downgrade does not delete historical data.

### Continuous quality gate — Original UX/UI + Figma consistency
Goal: every new screen must stay consistent with the original repository and Castar Figma file.

Tasks:
1. Audit new screens against original repo design tokens: colors, typography, spacing, grid, radii.
2. Audit new screens against Figma: layout proportions, visual hierarchy, icon style, card/sheet/button/chip patterns.
3. Fix drift in Budget, Recurring, Transactions, Add Transaction, and Tasks flows with small corrections, not redesigns.
4. Keep app-first IA: Home capture/value, Tasks automation, Monitoring insights, Profile settings.

Acceptance gate:
- New screens do not look like generic templates outside Castar visual language.
- Colors/grid/icons/typography match original repo/Figma rules or have explicit documented reason.

## 3. Schema gaps found

Already present:
- transactions
- categories
- accounts
- budgets
- recurrings
- sync queue / sync metadata
- exchange rates

Missing or needs extension:
1. Debts/loans tables.
2. Debt repayments table.
3. Subscriptions table.
4. Audit log for edits/deletes. ✅
5. Transaction parse metadata:
   - source is partially represented by `voiceInput`, but better as `source` enum.
   - confidence/parse metadata not represented.
6. Budget thresholds:
   - warning/critical thresholds, soft/hard limit flag, and rollover-enabled flag are now implemented locally and in backend payloads.
   - rollover balance calculation and local threshold alert events are implemented.
   - in-app budget alert inbox/history is implemented.
   - remaining: OS-level local/push notification presentation if product wants proactive alerts outside the app.
7. Recurring start/end metadata:
   - current recurring schema has nextDate but no startDate/endDate/lastGeneratedAt.
8. Backend D1 schema is behind local Drizzle schema in some fields:
   - local has remoteId/syncedAt/familyGroupId/amountInDefault/exchangeRate.
   - backend migration currently lacks some of these.

Recommended next schema migration:
- Add debts.
- Add debt_repayments.
- Add audit_log.
- Add subscriptions.
- Add transaction source/parse_metadata_json.
- Add recurring start_date/end_date/last_generated_at.
- Budget thresholds are implemented as typed columns: `warning_threshold`, `critical_threshold`, `is_hard_limit`, `rollover_enabled`.
- Budget alert events now have local/backend-parity table `budget_alerts` and a dedicated in-app inbox/history. Remaining decision: whether to sync alerts across devices as first-class records.

## 4. STT implementation plan

Interface language and voice input language are separate. The UI may be in any supported interface language, while voice recognition must handle Russian, Uzbek, or English regardless of UI locale.

Current implementation uses provider-specific cloud route. Keep this, but make it provider-abstracted.

Tasks:
1. Update backend `/api/voice/recognize` internals to use a provider interface.
2. Add env/provider selection:
   - `STT_PROVIDER=google|groq|deepgram`
3. Keep current Google implementation as default until benchmark finishes.
4. Add Groq implementation behind the same API if approved.
5. Build benchmark script/dataset:
   - 50–100 short utterances minimum
   - spoken languages: Uzbek, Russian, English
   - mixed UI/spoken-language cases, e.g. Russian UI + English speech
   - accents/noise typical for users
   - expected text + expected parsed transaction
6. Score by:
   - full pipeline success: audio → transcript → parser → candidate → DB save
   - STT word accuracy
   - parse success
   - latency
   - cost
   - error rate

Decision rule:
- Pick provider that maximizes parse success per dollar, not raw STT accuracy alone.

## 5. Product analytics implementation

Add tracking at key points:
- capture_opened
- voice_record_started
- voice_record_completed
- stt_completed / stt_failed
- parse_completed / parse_low_confidence
- transaction_candidate_edited
- transaction_saved
- multi_transaction_saved
- transaction_deleted
- budget_created
- recurring_created
- debt_created
- repayment_logged

Do not send raw descriptions, audio, names, or exact amounts unless explicitly privacy-reviewed.

## 6. Recommended immediate next dev task

Start with Milestone 1, because it activates the main JTBD and uses already-created services.

First coding slice:
1. Add transaction candidate types/utilities.
2. Extend `voiceParser.ts` to return multiple candidates.
3. Build AddTransactionScreen UI with text parsing first.
4. Connect save to `transactionStore`.
5. Then connect voice button to `voiceService`.

This is small enough to review and directly validates the product direction.
