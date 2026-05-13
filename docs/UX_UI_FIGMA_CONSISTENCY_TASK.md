# Castar UX/UI Consistency Task

> Goal: ensure new implementation work stays consistent with the original Castar repository design rules and the Figma file.

## Source of truth

1. Original repository design system:
   - `src/shared/constants/colors.ts`
   - `src/shared/constants/typography.ts`
   - `src/shared/constants/spacing.ts`
   - `src/shared/constants/scaling.ts`
   - existing polished screens, especially Home/Profile/Auth flows
2. Figma file provided for Castar:
   - `https://www.figma.com/design/Cq6gZWh6z4rLFhvB82Imjq/Castar?node-id=0-1&t=1rPqDCzgSfMcP4ol-1`

## Audit scope

Screens recently added or heavily modified:

- Add Transaction
- Transactions list
- Transaction detail
- Budgets list
- Budget detail
- Create/Edit budget
- Tasks screen
- Recurring list
- Create/Edit recurring
- Home changes related to transactions/budget cards

## Required checks

### Colors

- Use `colors.background` for app background.
- Use `colors.surface` / `colors.surfaceElevated` for cards/sheets.
- Use `colors.text`, `colors.textSecondary`, `colors.textTertiary` for hierarchy.
- Avoid hardcoded colors unless copied from an existing original component/Figma token.
- Status colors should use existing `success`, `warning`, `error`, `information` palettes.

### Grid and spacing

- Page horizontal padding should follow existing grid/page margin patterns.
- Card internal padding should use shared `spacing` tokens.
- Border radii should use shared `borderRadius` tokens.
- Fixed bottom actions should match existing modal/profile/home patterns.
- Avoid arbitrary spacing values unless there is a documented Figma reason.

### Typography

- Use existing Inter typography tokens from `typography.ts`.
- Maintain hierarchy already visible in Home/Profile/Auth screens.
- Avoid custom font sizes/line heights except where existing screens already do this for icon-like text.

### Icons

- Prefer existing SVG icon style: Solar-style bold/rounded icons already used in `TabNavigator` and Home.
- Avoid mixing emoji/icon styles for primary navigation unless the original screen pattern uses it.
- Category icons can remain emoji if that is already part of category model.

### Components and interaction patterns

- Reuse shared `Button`, `Input`, `Card` where suitable.
- Chips/toggles should visually match existing dark pill patterns.
- Destructive actions should use existing danger styling and confirmation dialogs.
- Empty states should have clear title/body/primary CTA and match dark card style.

### Navigation and IA

- Keep app-first flow: Home for capture/value loop, Tasks for automation, Monitoring for insights, Profile for settings.
- New automation screens must feel part of Tasks, not separate app sections.

## Acceptance criteria

- No newly added screen looks like a generic template outside Castar visual language.
- New screens use shared tokens for color/spacing/type wherever possible.
- Any hardcoded visual values are justified by existing original UI or Figma.
- Budget and recurring screens visually align with Home/Profile card and modal styles.
- A design review can compare implementation screenshots against Figma without obvious mismatch in colors, grid, radii, icon style, or typography.

## Execution plan

1. Pull Figma references for relevant frames/components.
2. Capture screenshots from current app screens where possible.
3. Compare against source tokens and Figma:
   - colors
   - grid/margins
   - typography
   - icon style
   - card/sheet/button/chip patterns
4. Apply small UI corrections, not a redesign.
5. Run TypeScript check.
6. Report files changed and remaining visual risks.

## Status

- Task added to roadmap/status.
- Audit/fix pass pending.
