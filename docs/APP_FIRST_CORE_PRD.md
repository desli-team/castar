# Castar App-First Core PRD

> Status: draft v1  
> Source: old Telegram PRD + current Castar repo analysis  
> Product direction: mobile app first, with Telegram as optional acquisition/support channel, not the primary UX.

## 1. Product definition

Castar is a mobile-first personal finance assistant for fast expense/income capture, recurring finance automation, debts/lending, budgets, and simple insights.

The product is not just an “AI parser”. The core promise is:

> Record spending in under 10 seconds, then understand where money goes without spreadsheet work.

## 2. Primary JTBD

When I spend or receive money, I want to record it with minimal effort and later see clear insights about my spending, so I can stay aware and make better money decisions.

Supporting JTBDs:
- When I have repeated bills or income, I want them tracked automatically.
- When I borrow or lend money, I want a clear balance without mixing it into normal spending incorrectly.
- When I set a spending limit, I want timely warnings before I overspend.
- When I use the app often, I want language, currency, and categories to match my real life.

## 3. Target users

### MVP primary user
Individual user in Uzbekistan / CIS context who wants quick personal finance tracking in Uzbek, Russian, or English.

### Secondary users
- Family users who may later need shared budgets.
- Freelancers/small operators who mix personal income, expenses, debts, and recurring commitments.

## 4. Core product pillars

These are part of the core stack and must stay in the product architecture from day one:

1. Conversational/manual transaction management
2. Multi-transaction parsing
3. Category management
4. Recurring transactions
5. Debt/lending management
6. Advanced budgets and alerts
7. Financial overview and insights
8. User personalization: language, currency, timezone
9. Subscription and monetization
10. Online/offline voice-to-text

## 5. MVP strategy

Because the core stack is broad, MVP should be phased by implementation order, not by removing core pillars.

### Phase 1 — App capture foundation
Goal: prove users can capture transactions faster than with normal finance apps.

Must include:
- Onboarding: language, currency, PIN/auth, default categories.
- Add Transaction screen with three input modes:
  - voice
  - text
  - manual form
- Expense and income logging.
- Multi-transaction parsing from one voice/text input.
- Confirmation card before/after save.
- Edit, delete, undo.
- Categories.
- Local SQLite persistence.
- Offline queue for unsynced changes.
- Basic transaction list.
- Basic dashboard: month spend, income, net, top categories.
- Analytics events for validation.

### Phase 2 — Core finance automation
Goal: prove the app becomes useful beyond logging.

Must include:
- Recurring transactions.
- Budget creation and progress.
- Budget alerts: 80%, 100%, serious overspend.
- Debt/lending records.
- Partial/full repayments.
- Deeper insights: trends, comparison vs previous period, category anomalies.

### Phase 3 — Business layer
Goal: prepare monetization without damaging trust.

Must include:
- Subscription screen.
- Free/paid limits.
- Premium prompts in relevant moments.
- Graceful downgrade without data loss.
- Export or advanced analytics as potential premium value.

## 6. App information architecture

Recommended tabs:

1. Home
- Quick capture button
- Month summary
- Recent transactions
- Budget warnings
- Upcoming recurring items

2. Add / Capture
- Large voice button
- Text input
- Manual form fallback
- Parsed result review

3. Monitoring / Insights
- Spending by category
- Income vs expenses
- Budget progress
- Trends by week/month

4. Tasks / Automation
- Recurring transactions
- Debts and loans
- Budget alerts to review
- Uncategorized cleanup

5. Profile / Settings
- Language
- Currency
- Categories
- Accounts/payment methods
- Subscription
- Security/PIN

If tab count must stay at 4, merge Add into Home as a floating action button and keep Tasks as the automation hub.

## 7. Main user flows

### 7.1 Voice expense capture
1. User taps microphone.
2. App records audio.
3. If online, app sends audio to cloud STT via backend proxy.
4. If offline, app uses local STT if available; otherwise stores audio locally for later transcription.
5. Parsed text is converted into one or more transaction candidates.
6. App shows confirmation card/list:
   - amount
   - currency
   - type
   - category
   - date
   - description
   - confidence/needs review state
7. User confirms, edits, or discards.
8. Transaction is saved locally and queued for sync.

Acceptance criteria:
- User can log a normal single expense in under 10 seconds.
- If amount is missing, app asks for amount.
- If category confidence is low, app defaults to Other but allows quick category edit.
- If offline, user can still record and not lose the input.

### 7.2 Text capture
Example inputs:
- “15 bucks for coffee”
- “spent 120000 sum taxi yesterday”
- “salary 500 dollars”
- “milk 20000, bread 8000, taxi 25000”

Acceptance criteria:
- Single transaction parses into one candidate.
- Multi-transaction input parses into multiple candidates.
- User can confirm all or edit individual candidates.
- App does not silently save ambiguous critical fields.

### 7.3 Manual transaction
Acceptance criteria:
- User can create expense/income without AI.
- Required fields: type, amount, currency, category, date.
- Optional fields: description, account/payment method, note.

### 7.4 Recurring transaction
Acceptance criteria:
- User can create a recurring expense/income with amount, category, start date, frequency, optional end date.
- App shows next due date.
- User can pause, edit, delete.
- Generated transactions are editable/deletable and keep recurring_id link.

### 7.5 Debt/lending
Acceptance criteria:
- User can record “I owe someone” and “someone owes me”.
- Debt records are separate from the main transaction ledger until repayment happens.
- Repayment creates a real transaction and reduces remaining balance.
- Partial repayments are supported.
- Settled debts move to history.

### 7.6 Advanced budgets
Acceptance criteria:
- User can set category budgets by period.
- Budget progress is visible on Home and Monitoring.
- Alerts trigger at 80%, 100%, and configurable serious overspend threshold.
- Budget calculations use transaction date and user timezone.

### 7.7 Subscription/monetization
Acceptance criteria:
- User can see free vs paid benefits.
- Upgrade prompts appear contextually, not aggressively.
- Downgrade never deletes historical user data.
- Disabled premium entities become read-only/inactive if needed.


## 8. AI intent resolver architecture

Castar should be AI-native for capture. Speech-to-text only converts audio into text; the AI intent resolver is responsible for understanding what the user wants to record.

### Resolver responsibilities

Input may come from typed text or a voice transcript. The resolver must classify and extract:
- intent: `transaction`, `debt_create`, `debt_repayment`, `budget_create`, `recurring_create`, `dashboard_query`, or `unknown`
- amount, currency, date/time if present
- transaction type: expense/income
- best matching `categoryId` from the user's existing categories
- person/debt direction for debts and repayments
- missing fields and a clear next question when not enough information is available

### Prompt contract

System prompt:

```text
You are Castar's finance intent resolver. Convert user text/transcripts into strict JSON only.

Rules:
- Do not save anything. Create review-safe drafts.
- Classify intent as one of: transaction, debt_create, debt_repayment, budget_create, recurring_create, dashboard_query, unknown.
- Choose categories only from provided category IDs. Never invent IDs.
- If confidence is low or a required field is missing, include missing_fields and next_question.
- Debts are not normal expenses/income until repayment.
- Repayment creates a real transaction later, but this resolver only returns a draft.
- Preserve privacy: do not include unnecessary raw personal/financial context.
- Return JSON matching the provided schema; no markdown.
```

### Strict JSON schema

```json
{
  "intent": "transaction | debt_create | debt_repayment | budget_create | recurring_create | dashboard_query | unknown",
  "confidence": 0.0,
  "drafts": [
    {
      "kind": "transaction",
      "confidence": 0.0,
      "missing_fields": [],
      "next_question": null,
      "transaction": {
        "type": "expense | income",
        "amount": 45000,
        "currency": "UZS",
        "category_id": "existing-category-id",
        "category_name": "Food",
        "description": "lavash",
        "date": 1760000000000
      }
    }
  ],
  "missing_fields": [],
  "next_question": null,
  "provider": "model-or-fallback-provider",
  "model": "model-name-or-null"
}
```

### Safety/product rules

- Resolver output is always a draft/review item; it must not directly save financial records.
- If category confidence is weak, Castar may preselect the best category but must keep the item editable.
- If the resolver detects debt/repayment/budget/recurring intent from the global Add flow, the app should route or explain the correct review flow instead of silently creating the wrong entity.
- Deterministic parser remains as fallback for offline/provider failure.

## 9. STT architecture

### Current repo direction
Current Castar docs/code already point to:
- Online: Google Cloud Speech-to-Text V2 via backend proxy.
- Offline: VOSK via `react-native-vosk`.
- Parser: local `voiceParser.ts` for text-to-transaction extraction.

### Recommendation after cost/fit review
Keep provider abstraction and run a benchmark before locking provider.

Recommended online providers to test:
1. Groq Whisper Large v3 Turbo
   - Very low cost (~$0.04/hour transcribed in current pricing page).
   - Fast.
   - Needs empirical RU/UZ/EN accuracy test.
2. Google Cloud STT V2
   - Already integrated in current repo direction.
   - Supports Uzbek/Russian/English.
   - More expensive than Groq but mature cloud STT.
3. Deepgram Nova-3 multilingual
   - Good speech API product and formatting.
   - More expensive than Groq, likely simpler production features.

Offline:
- VOSK is acceptable as offline fallback, especially for RU/EN and basic UZ.
- whisper.cpp/sherpa-onnx are alternatives if VOSK UZ quality is too weak, but they add model size and integration/performance risk.

MVP decision:
- Keep online STT behind backend interface: `/api/voice/recognize`.
- Add provider field internally: `google | groq | deepgram | offline`.
- Do not expose provider to client.
- For first production build: use whichever wins our 50–100 sample RU/UZ/EN benchmark on accuracy, latency, and cost.

## 10. Data model additions/checks

Current schema should be checked for these required concepts:

### Transactions
Required fields:
- id
- user_id
- type: expense/income
- amount
- currency
- category_id
- date
- description
- payment_method/account_id
- source: manual/text/voice/recurring/import
- confidence_json or parse_metadata_json
- recurring_id nullable
- debt_id nullable for repayment links
- sync fields: created_at, updated_at, deleted_at, last_synced_at

### Transaction candidates
Needed for AI parsing before final save, especially multi-transaction inputs:
- temporary client id
- parsed fields
- confidence per field
- original_text
- audio_uri nullable
- status: pending/confirmed/discarded

This can be in client state only for MVP, unless draft recovery is required.

### Recurrings
Required fields:
- id, user_id, type, amount, currency, category_id, description
- frequency
- interval
- start_date
- next_date
- end_date nullable
- is_paused
- last_generated_at

### Debts/loans
Add if missing:
- id, user_id
- direction: i_owe / owed_to_me
- person_name
- original_amount
- remaining_amount
- currency
- description
- status: active/settled/cancelled
- created_at, settled_at nullable

### Debt repayments
Add if missing:
- id, debt_id, transaction_id
- amount, currency
- date

### Budgets
Required fields:
- id, user_id, category_id nullable for global budget
- amount, currency
- period: weekly/monthly/custom
- start_date
- end_date nullable
- alert thresholds
- is_active

### Subscriptions
Add when monetization phase starts:
- id, user_id, provider, status, plan, started_at, expires_at, metadata_json

### Audit log
Financial edit/delete operations should be auditable:
- id, user_id, entity_type, entity_id, action, before_json, after_json, created_at

## 11. Analytics events

Minimum events for product validation:

Capture funnel:
- capture_opened
- voice_record_started
- voice_record_completed
- stt_completed
- stt_failed
- parse_completed
- parse_low_confidence
- transaction_candidate_edited
- transaction_saved
- multi_transaction_saved
- transaction_undone

Retention/value:
- dashboard_viewed
- insights_viewed
- budget_created
- budget_alert_seen
- recurring_created
- recurring_generated_transaction
- debt_created
- repayment_logged

Monetization:
- subscription_screen_opened
- upgrade_prompt_seen
- upgrade_started
- upgrade_completed
- downgrade_applied

Important: mask or avoid raw financial descriptions in analytics payloads.

## 12. Key product metrics

Activation:
- First transaction saved within first session.
- Time-to-first-transaction.
- % users who use voice/text vs manual.

Quality:
- Parse success rate.
- Edit-after-parse rate.
- Undo rate.
- Low-confidence rate by language.
- STT failure rate by provider/language.

Retention:
- D1/D3/D7 retention.
- Transactions per active user per day.
- % users viewing insights after logging.

Monetization readiness:
- Budget creation rate.
- Recurring creation rate.
- Category limit hit rate.
- Upgrade prompt conversion.

## 13. Main risks

1. Scope risk: all core pillars are important, but building all at once will slow learning.
   - Mitigation: phase implementation while keeping architecture ready.

2. STT quality risk for Uzbek.
   - Mitigation: benchmark real user-style samples before provider lock.

3. AI trust risk.
   - Mitigation: confirmation UI, field confidence, edit/undo, no silent ambiguous saves.

4. Financial data privacy risk.
   - Mitigation: avoid sending sensitive descriptions to analytics, use backend proxy for STT keys, secure local storage, audit log.

5. Offline complexity.
   - Mitigation: offline queue first; true offline transcription can be fallback/beta.

## 14. Immediate implementation plan

1. Align docs with app-first PRD and current repo reality.
2. Inspect existing schema and stores for missing debt/subscription/audit/multi-candidate support.
3. Build capture UI around existing voice service and parser.
4. Add confirmation candidate flow for single and multi-transaction parsing.
5. Add analytics events with safe payloads.
6. Fill backend CRUD/sync stubs.
7. Run STT provider benchmark before replacing Google Cloud or adding Groq.

## 15. Open decisions

1. STT provider benchmark owner and sample set.
2. Whether debts/lending are visible in Phase 1 UI or only schema-ready.
3. Free/paid limits for Phase 3.
4. Exact subscription provider for mobile payments.
5. Whether Telegram remains only auth/support or also a companion logging channel.
