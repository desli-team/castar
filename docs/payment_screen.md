# Castar Subscription / Payment Screen PRD

## 1. Purpose

Create a single adaptive Subscription screen for Castar.

The screen should not behave like a generic pricing comparison table. It should answer one simple question based on the user's current state:

- Free user: “What do I get with Premium, and where will I upgrade when payment is ready?”
- Premium user: “Am I Premium, what benefits do I have, and until when?”
- Payment issue / expired user: “What is my status, and where will I fix/reactivate it when payment is ready?”

This screen prepares the product for payment/subscription integration, but this task does not implement the payment flow itself.

## 2. Product goals

1. Show the user’s current subscription status clearly.
2. For Free users, present Premium as the natural next step without a comparison-table UI.
3. For Premium users, reassure them that Premium is active and show the validity date when available.
4. Keep the payment/subscription button structurally ready for future payment flow.
5. Avoid fake checkout, fake pricing, or unsupported payment-provider assumptions.
6. Preserve Castar’s calm dark fintech visual style.

## 3. Non-goals

- No real payment processing.
- No payment-provider integration.
- No pricing finalization unless product provides real prices.
- No App Store / Play Store / Stripe / Payme / Click assumptions.
- No Voice AI limits or Voice AI monetization changes.
- No role display (`user`, `support`, `admin`) in user-facing UI.
- No two-column Free vs Premium pricing table.

## 4. Core design decision

Do not use columns.

Reason:

- A Free user does not need a full side-by-side table; we need to sell/communicate Premium value.
- A Premium user does not need to compare against Free; they need confirmation, status, benefits, and expiry.
- A single adaptive screen is more product-focused, cleaner, and easier to align with Figma.

Screen uses one structure, but content adapts by subscription state.

## 5. Source data

Use `useSettings()` / `/settings` response:

- `tier`: `free | premium`
- `subscriptionStatus`: `none | trialing | active | past_due | canceled`
- `premiumUntil`: `number | null`
- `entitlements`:
  - `canCreateCustomCategories`
  - `canUseAnalyticsPro`
  - `canUseBudgetAlerts`
  - `canUseRecurringAutomation`
  - `canUseMultiDeviceSync`
  - `maxSyncDevices`

Optional secondary data:

- `useSyncDevices()` / `/sync/devices`
  - active device count
  - max device slots

## 6. Screen states

### 6.1 Free user

Condition:

- `tier = free`
- `subscriptionStatus = none` or missing

Primary screen intent:

- Show that user is currently Free.
- Present Premium benefits as the next available upgrade.
- Keep payment CTA ready, but do not start payment until provider exists.

Status chip:

- `Free`

Hero title:

- `Upgrade to Premium`

Hero subtitle:

- `Get advanced tools for deeper control over your money.`

Alternative quieter subtitle:

- `Unlock advanced Castar tools when Premium becomes available.`

CTA button:

- `Upgrade to Premium`

CTA behavior for now:

- Button is structurally present.
- If payment is not connected, pressing shows a non-blocking placeholder state/modal/toast:
  - `Payments are coming soon`
- No fake checkout.
- No fake success.

Secondary note:

- `Payments are coming soon`

### 6.2 Premium active user

Condition:

- `tier = premium`
- `subscriptionStatus = active`
- `premiumUntil` is null or in the future

Primary screen intent:

- Confirm Premium is active.
- Show benefits already available.
- Show date until which Premium is active when available.

Status chip:

- `Premium`

Hero title:

- `Premium is active`

Hero subtitle:

- If date exists: `Active until <date>`
- If no date: `Your Premium access is active`

CTA button:

- `Manage subscription`

CTA behavior for now:

- Button is structurally present.
- If subscription management is not connected, pressing shows:
  - `Subscription management is coming soon`

Secondary note:

- If date exists: `Your Premium benefits remain available until <date>`
- If no date: `Your Premium benefits are available now`

### 6.3 Trialing user

Condition:

- `tier = premium`
- `subscriptionStatus = trialing`

Primary screen intent:

- Show trial is active.
- Show date when it ends if available.
- Prepare management/payment CTA.

Status chip:

- `Trial`

Hero title:

- `Premium trial is active`

Hero subtitle:

- If date exists: `Trial ends <date>`
- If no date: `Explore Premium features during your trial`

CTA button:

- `Manage trial`

CTA behavior for now:

- If payment/subscription management is not connected, pressing shows:
  - `Subscription management is coming soon`

### 6.4 Past-due user

Condition:

- `subscriptionStatus = past_due`

Primary screen intent:

- Calmly show that Premium needs attention.
- Keep payment update action ready.

Status chip:

- `Payment issue`

Hero title:

- `Premium needs attention`

Hero subtitle:

- `Update payment to keep Premium features active.`

CTA button:

- `Update payment`

CTA behavior for now:

- If payment update is not connected, pressing shows:
  - `Payment updates are coming soon`

Visual tone:

- Use subtle warning accent, not aggressive red/error language.

### 6.5 Canceled or expired user

Condition:

- `subscriptionStatus = canceled`, or
- `premiumUntil` is in the past and normalized backend entitlement has fallen back to Free

Primary screen intent:

- Show Premium is no longer active.
- Present Premium reactivation path.

Status chip:

- `Free`

Hero title:

- `Premium is inactive`

Hero subtitle:

- `Reactivate Premium to use advanced Castar tools.`

CTA button:

- `Reactivate Premium`

CTA behavior for now:

- If payment is not connected, pressing shows:
  - `Payments are coming soon`

## 7. Screen structure

The screen has four sections.

### 7.1 Header

Elements:

- Back button.
- Title: `Subscription`.

Acceptance criteria:

- Back button returns to Profile.
- Header respects safe area.
- Header follows existing Castar profile/subscription style.

### 7.2 Adaptive hero/status card

This is the main card and should be visually strongest.

Elements:

- Small status chip.
- Main hero title.
- Subtitle/status detail.
- Optional validity date.
- Optional small tier icon.
- Primary CTA button inside or immediately below the card.

State examples:

Free:

```text
[Free]
Upgrade to Premium
Get advanced tools for deeper control over your money.
[Upgrade to Premium]
Payments are coming soon
```

Premium active:

```text
[Premium]
Premium is active
Active until 12 Jun
[Manage subscription]
Subscription management is coming soon
```

Trialing:

```text
[Trial]
Premium trial is active
Trial ends 12 Jun
[Manage trial]
Subscription management is coming soon
```

Past due:

```text
[Payment issue]
Premium needs attention
Update payment to keep Premium features active.
[Update payment]
Payment updates are coming soon
```

Expired/canceled:

```text
[Free]
Premium is inactive
Reactivate Premium to use advanced Castar tools.
[Reactivate Premium]
Payments are coming soon
```

Acceptance criteria:

- The screen never shows irrelevant Free/Premium columns.
- User’s current state is clear within 2 seconds.
- `premiumUntil` appears only when present and relevant.
- Expired Premium never displays as active.
- CTA is present and ready for payment integration.
- CTA does not launch fake payment.

### 7.3 Premium benefits section

One benefits list. It adapts title depending on state.

Title by state:

- Free: `Premium includes`
- Premium active: `Included with your Premium`
- Trial: `Included during your trial`
- Past due: `Premium features`
- Expired/canceled: `Premium includes`

Benefits:

1. `Custom categories`
2. `Analytics Pro`
3. `Budget alerts`
4. `Recurring automation`
5. `Multi-device sync`

Optional detail copy:

- `Create your own category system`
- `See deeper cashflow and spending insights`
- `Get notified before budgets become risky`
- `Automate repeat payments and income`
- `Use Castar across your devices`

Do not mention:

- Voice AI limits.
- Priority support unless product approves it.
- Any unsupported feature.

Acceptance criteria:

- Benefit list is identical for Free and Premium users, but title changes.
- Premium users understand these are already included.
- Free users understand these are Premium benefits.
- No Voice AI mention.

### 7.4 Payment readiness note

A small note near CTA or bottom of screen.

For now:

- Free/expired: `Payments are coming soon`
- Premium/trial: `Subscription management is coming soon`
- Past due: `Payment updates are coming soon`

Later, when payment is connected, this note can be removed or replaced with provider/legal copy.

Acceptance criteria:

- The user is not misled into thinking payment is live.
- The button structure remains ready for future integration.

### 7.5 Optional device detail row

If we want to reinforce multi-device sync without a comparison table, add a small row only inside benefits or details:

Free:

- `Multi-device sync` as a Premium benefit, no need to emphasize current limitation.

Premium:

- `Up to 5 devices` or `2/5 devices connected` if `useSyncDevices()` is available.

Acceptance criteria:

- Not shown as a Free-vs-Premium column.
- Does not clutter the main hero.

## 8. Visual direction

Use the existing `SubscriptionManagementScreen` visual system, but simplify content hierarchy.

Style:

- Dark background.
- Existing glow assets can remain.
- Header/back button as currently implemented.
- One primary hero card.
- Benefits as glass rows/cards.
- Premium accent: subtle green border/glow.
- Trial accent: green or soft neutral premium accent.
- Past due accent: subtle amber/warning border.
- Free accent: neutral white/gray.

Avoid:

- Two-column pricing table.
- Large price cards unless real pricing is approved.
- Fake trial pricing copy.
- Aggressive sales visuals.

## 9. Copy rules

Tone:

- Calm.
- Short.
- Productive.
- Premium, not pushy.

Approved baseline copy:

- `Subscription`
- `Free`
- `Premium`
- `Trial`
- `Payment issue`
- `Upgrade to Premium`
- `Premium is active`
- `Premium trial is active`
- `Premium needs attention`
- `Premium is inactive`
- `Active until <date>`
- `Trial ends <date>`
- `Premium includes`
- `Included with your Premium`
- `Included during your trial`
- `Payments are coming soon`
- `Subscription management is coming soon`
- `Payment updates are coming soon`

Avoid:

- `Starter categories` in the Profile chip.
- `Limited time offer`.
- `Don’t miss out`.
- Fake prices.
- Fake free-trial promises before product approval.

## 10. Functional requirements

### FR-1: Render adaptive state from settings

Create a small view-model helper for the screen.

Input:

- `tier`
- `subscriptionStatus`
- `premiumUntil`

Output:

- `state`: `free | premium_active | trialing | past_due | expired`
- `chipLabel`
- `heroTitle`
- `heroSubtitle`
- `benefitsTitle`
- `primaryButtonLabel`
- `paymentReadinessNote`
- `accent`: `neutral | premium | warning`

Acceptance criteria:

- Missing settings defaults to Free state.
- Unknown status defaults safely.
- Expired `premiumUntil` falls back to expired/free state.
- Role is never used for UI copy.

### FR-2: Button is ready but payment-safe

The primary button must exist for all states.

Acceptance criteria:

- Button label changes by state.
- No real payment flow starts.
- Pressing button shows placeholder note/modal/toast or disabled state until payment is integrated.
- Future payment handler can be attached in one place.

### FR-3: Show active Premium date

Acceptance criteria:

- Active Premium with future `premiumUntil` shows `Active until <date>`.
- Trial with future `premiumUntil` shows `Trial ends <date>`.
- No invalid date text appears.
- Expired date does not show as active.

### FR-4: Benefits are entitlement-aligned

Acceptance criteria:

- Benefits match current entitlement model.
- Voice AI is absent.
- Unsupported benefits are absent.

### FR-5: One screen layout

Acceptance criteria:

- Free, Premium, Trial, Past due, and Expired all use the same screen skeleton.
- No Free/Premium comparison columns.
- The screen remains visually coherent when state changes.

## 11. Engineering task breakdown

### Slice 1 — Replace pricing-table mental model

Tasks:

- Remove annual/monthly plan-card selection as the primary structure unless real pricing is approved.
- Remove two-column comparison concept from implementation.
- Keep existing header/glow/back style.

Acceptance criteria:

- Screen no longer looks like selecting between monthly/annual plans.
- No fake trial or price copy remains.

### Slice 2 — Add subscription view model

Tasks:

- Implement pure helper in screen or utility.
- Normalize Free/Premium/Trial/Past-due/Expired states.
- Format `premiumUntil` date.

Acceptance criteria:

- Handles all states listed in this PRD.
- Easy to unit test or manually mock.

### Slice 3 — Build adaptive hero card

Tasks:

- Add hero card with chip, title, subtitle, and CTA.
- Apply accent styles by state.

Acceptance criteria:

- Free hero sells Premium.
- Premium hero confirms active status and date.
- Trial hero shows trial status.
- Past-due hero shows payment attention calmly.
- Expired hero prompts reactivation.

### Slice 4 — Build benefits list

Tasks:

- Replace old generic advantages with entitlement-aligned Premium benefits.
- Use existing icon row style.
- Title adapts by state.

Acceptance criteria:

- Benefits are accurate.
- No Voice AI mention.
- Visual style matches Castar.

### Slice 5 — Add payment-ready CTA behavior

Tasks:

- Add a single CTA handler placeholder.
- For now, show safe message or disabled state.
- Keep handler ready for future provider integration.

Acceptance criteria:

- Button exists in every state.
- No payment side effects.
- Placeholder copy is state-aware.

### Slice 6 — i18n/copy

Tasks:

- Add or update subscription copy keys.
- Prefer English first only if localization scope is constrained.
- If full localization is required, update all locale JSON files.

Acceptance criteria:

- No missing translation keys.
- No hardcoded long text unless intentionally accepted for MVP.

### Slice 7 — QA and validation

Tasks:

- Run `npm run check`.
- Run `git diff --check`.
- Manually test mocked states.

Acceptance criteria:

- Typecheck passes.
- Backend tests remain green.
- Screen handles all states without crash.

## 12. Manual QA checklist

Free state:

- Status chip shows Free.
- Hero says Upgrade to Premium.
- Benefits list is visible.
- Button says Upgrade to Premium.
- Payment coming soon note appears.
- No columns.
- No Voice AI mention.

Premium active:

- Status chip shows Premium.
- Hero says Premium is active.
- Future `premiumUntil` date appears.
- Button says Manage subscription.
- Benefits title says Included with your Premium.
- No Free comparison column.

Trialing:

- Status chip shows Trial.
- Trial end date appears if available.
- Button says Manage trial.

Past due:

- Status chip shows Payment issue.
- Warning accent appears.
- Button says Update payment.
- Copy is calm.

Expired/canceled:

- Hero says Premium is inactive.
- Button says Reactivate Premium.
- No active Premium date shown.

Layout:

- Works on 393px width.
- No clipped text.
- CTA remains reachable.
- Back button works.

## 13. Analytics events — optional later

Future safe events:

- `subscription_screen_opened`
- `subscription_cta_pressed`
- `subscription_state_viewed`

Do not send:

- payment identifiers
- personal financial data
- exact subscription dates unless approved

## 14. Dependencies and blockers

Dependencies:

- `/settings` entitlement/status data.
- Final payment provider decision.
- Final pricing decision.
- Final Figma visual pass.

Blockers:

- Real upgrade flow cannot be completed until payment provider is selected.
- Subscription management cannot be functional until provider APIs exist.
- Remote entitlement migration must be approved before production/staging reliance.

## 15. Open product questions

1. Should Premium price be hidden until payment provider is chosen? Recommendation: yes.
2. Should the first payment integration be App Store/Play Store subscriptions, Stripe, Payme, Click, or mixed?
3. Do we want trialing state in MVP, or only Free/Premium?
4. Should Premium max sync devices stay 5?
5. Should Budget alerts and Recurring automation be hard Premium-only at launch or just Premium-highlighted during QA?
6. What exact message should appear when user taps CTA before payments are live?

## 16. Definition of done

The task is complete when:

- Subscription screen uses one adaptive layout, not columns.
- Free users see a Premium-focused screen.
- Premium users see active status, benefits, and date until active when available.
- Past-due/expired states are represented.
- CTA exists and is ready for payment/subscription integration.
- CTA does not perform fake payment.
- Benefits do not mention Voice AI limits.
- UI matches Castar dark glass design language.
- `npm run check` and `git diff --check` pass after implementation.
