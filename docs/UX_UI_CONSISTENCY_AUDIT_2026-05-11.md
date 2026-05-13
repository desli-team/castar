# Castar UX/UI Consistency Audit — 2026-05-11

## Scope audited

New or recently changed MVP screens:

- `src/features/budget/screens/BudgetsScreen.tsx`
- `src/features/budget/screens/BudgetDetailScreen.tsx`
- `src/features/budget/screens/CreateBudgetScreen.tsx`
- `src/features/recurring/screens/RecurringsScreen.tsx`
- `src/features/recurring/screens/CreateRecurringScreen.tsx`
- `src/features/tasks/screens/TasksScreen.tsx`
- Existing transaction screens were inspected for token drift; deeper screenshot QA is still pending.

## Source rules checked

From original repository design system:

- Colors: `src/shared/constants/colors.ts`
- Grid/spacing/radius: `src/shared/constants/spacing.ts`
- Typography: `src/shared/constants/typography.ts`
- Existing visual patterns: Home/Profile/Auth dark-card app style

Figma file reference:

- `https://www.figma.com/design/Cq6gZWh6z4rLFhvB82Imjq/Castar?node-id=0-1&t=1rPqDCzgSfMcP4ol-1`

## Figma access status

Direct Figma API audit was not completed because `FIGMA_ACCESS_TOKEN` is not present in the runtime environment.

What was completed:

- Code-level audit against repository design tokens.
- Small consistency fixes using existing repo rules.

What remains:

- Export/inspect exact Figma frames/components once Figma token/access is available.
- Compare screenshots against Figma proportions and icon set.

## Fixes applied

### Shared back button

Added:

- `src/shared/components/BackButton.tsx`

Reason:

- New screens used raw text chevrons (`‹`) with custom font sizes.
- This drifted from the original SVG/Solar-style icon approach used in app navigation and Home.

Result:

- Budget and Recurring sub-screens now use a shared SVG back button with tokenized background/radius/spacing.

### Safe-area/grid alignment

Updated:

- Budget list/detail/create screens
- Recurring list/create screens
- Tasks screen

Reason:

- Several new screens used hardcoded `paddingTop: 56` / `60`.
- Original app patterns use safe-area-aware top spacing, especially Home.

Result:

- New screens now apply `useSafeAreaInsets()` and tokenized top spacing via `spacing.xl`.

### Token compliance

Observed:

- Most new screens already use `colors`, `typography`, `spacing`, and `borderRadius` tokens.
- Remaining raw `rgba(16,16,16,0.92)` footer overlays are intentional translucent bottom bars; they should be revisited during screenshot/Figma QA.

## Known visual risks

1. Budget/Recurring screens are consistent with repo tokens, but not yet Figma-pixel-matched.
2. Tasks screen is functional and tokenized, but likely needs richer Figma-aligned automation hub visuals.
3. Some card chevrons still use text `›`; acceptable short-term, but should move to shared SVG icon if Figma confirms icon consistency.
4. Transaction screens still have several local `rgba(...)` styles; deeper pass should decide whether to keep as original visual texture or replace with tokens.
5. Copy is currently English in newer Budget/Recurring/Tasks screens; interface i18n completion remains pending.

## Validation

- App TypeScript: passed.
- Backend TypeScript: passed.

## Next UI pass

When Figma access/screenshot tooling is available:

1. Export relevant Figma frames/components.
2. Capture current app screenshots.
3. Compare:
   - colors
   - grid/margins
   - radii
   - typography scale
   - icon style
   - card/chip/button/sheet patterns
4. Apply small corrections only; avoid redesigning working flows.

---

## Addendum — Analytics Pro strict code-level audit — 2026-05-12

### Scope

Audited the new Analytics Pro surfaces and nearby changed navigation/list screens against the original repository UI language:

- `src/features/analytics/screens/AnalyticsScreen.tsx`
- `src/features/analytics/screens/IncomeAnalyticsScreen.tsx`
- `src/features/analytics/screens/SpendingCategoryDetailScreen.tsx`
- `src/features/analytics/screens/TransactionReviewScreen.tsx`
- `src/features/transactions/screens/TransactionsScreen.tsx`
- `src/features/transactions/screens/TransactionDetailScreen.tsx`
- `src/features/budget/screens/BudgetsScreen.tsx`
- `src/features/tasks/screens/TasksScreen.tsx`
- `src/features/profile/screens/SettingsScreen.tsx`

### Repository rules checked

- 24px page grid via `spacing.xl`.
- Dark app background via `colors.background`.
- Elevated cards via `colors.surfaceElevated` / `colors.surface`, `borderColor: colors.borderLight`, and `borderRadius['2xl']`/`xl`.
- Typography hierarchy via `typography.heading*`, `body*`, `caption*`.
- Shared navigation affordance via `BackButton` and SVG chevrons instead of text glyphs.
- Safe-area-aware top spacing via `useSafeAreaInsets()` rather than fixed `paddingTop: 60`.
- Privacy-safe analytics UI: no raw audio/name telemetry added in this pass.

### Surgical fixes applied

- Analytics drill-down and review screens now use safe-area-aware top padding and tokenized horizontal/bottom padding.
- Income Analytics header/content now uses the 24px grid (`spacing.xl`) and tokenized elevated nav-button background.
- Settings sync diagnostics now uses safe-area-aware top padding and tokenized page padding.
- Transaction list and transaction detail now use the shared `BackButton` instead of raw `‹` text glyphs and fixed top padding.
- Budget list and Tasks cards now use SVG right chevrons instead of raw `›` text glyphs.

### Findings after fixes

- P0/P1 visual drift: none found at code-token level for Analytics Pro surfaces.
- P2: several tiny chart primitives intentionally use small numeric dimensions (`5`, `8`, `12`, `38`, `42`, `48`, etc.). This matches chart/icon geometry needs and should be verified visually rather than blindly tokenized.
- P2: some existing/new translucent overlays still use raw rgba values, especially bottom footers and older transaction card texture. They are consistent with the repo’s original dark-card texture but need screenshot/Figma confirmation before replacing.
- P2: newer copy remains English in multiple product surfaces. This is an i18n completion task, not a visual-token blocker.

### Cannot verify 1:1 without Figma/screenshots

- Exact pixel spacing, icon proportions, chart density, and card heights against Figma frames.
- Whether Analytics Pro density should be simplified for small devices.
- Final icon-set parity for every analytics mini-icon/category glyph.
- True device safe-area behavior on iPhone/Android cutouts.

### Validation

- `npm run typecheck` passed.
- `npm run check` passed.
- `git diff --check` passed.

### UX confidence

- Code-level design-token consistency: high.
- Original repo pattern consistency: medium-high.
- Figma pixel parity: blocked until `FIGMA_ACCESS_TOKEN` or screenshots are available.
