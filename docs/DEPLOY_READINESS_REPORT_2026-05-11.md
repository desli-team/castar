# Castar Deploy Readiness Report — 2026-05-11

Scope: no-device QA pass for app-first MVP/core stack. This report covers static/local validation, financial side-effect review, sync/deploy readiness, and remaining requests before any deployment.

## Executive summary

Status: **not ready for production deploy yet**.

Confidence after no-device QA: **medium-high for local TypeScript/static correctness**, **medium for backend deployability**, **low-to-medium for real release readiness** until real-device and authenticated non-prod sync smoke tests pass.

Recommended next gate: **staging/non-prod deploy only**, after Владлен approves remote D1 migrations/deploy target and provides safe test auth/access.

Estimated implementation/readiness progress: **~90%** for local MVP/core code, but **deploy readiness is ~70–75%** because device QA, remote migration, sync smoke, and secrets/release-channel decisions are still pending.

## Validation gates executed

- [x] Expo Doctor: `npx expo-doctor` — **17/17 passed** after dependency fixes.
- [x] App TypeScript: `npm exec -- tsc --noEmit` — passed.
- [x] Backend TypeScript: `cd backend && npm run typecheck` — passed.
- [x] Git whitespace/conflict check: `git diff --check` — passed.
- [x] App npm audit high/critical check: **0 high, 0 critical** after safe dependency fixes; 8 moderate remain in dev/tooling paths requiring breaking-force upgrades.
- [x] Backend npm audit high/critical check: **0 vulnerabilities** after Hono/Wrangler update.
- [x] Local D1 audit migration: `0008_audit_logs.sql` applied locally successfully.
- [x] Local D1 audit schema inspection: `audit_logs` table and indexes confirmed.
- [x] Static scan for sensitive logs: OTP code logging removed; Telegram callback no longer logs full params/full URL.

## Fixes made during this no-device QA pass

### P0/P1 financial audit coverage

- Added audit log coverage for Home budget quick create/update and automatic budget currency conversion.
- Added audit log coverage for recurring rule create/update/pause/resume/delete.
- Added audit log coverage for recurring catch-up generated transactions and recurring rule advancement.

Files:
- `src/features/transactions/screens/HomeScreen.tsx`
- `src/features/recurring/screens/CreateRecurringScreen.tsx`
- `src/features/recurring/screens/RecurringsScreen.tsx`
- `src/shared/services/recurring/recurringGenerator.ts`

### Release/security hardening

- Removed OTP code logging from backend auth flows.
- Removed sensitive Telegram callback params/full URL logging.
- Redacted email/phone recipient logging in email/SMS services.
- Upgraded backend direct runtime dependency `hono` to remove known high vulnerability.
- Upgraded backend `wrangler` tooling; backend audit now reports 0 vulnerabilities.
- Upgraded app `drizzle-orm`, `uuid`, vulnerable transitive packages via safe `npm audit fix`.
- Fixed Expo Doctor release blockers:
  - installed missing `react-native-worklets`
  - aligned `expo-dev-client` and `expo-linking` with Expo SDK 54 expected patch versions.

Files:
- `backend/src/routes/auth.ts`
- `backend/src/services/email.ts`
- `backend/src/services/sms.ts`
- `backend/package.json`
- `backend/package-lock.json`
- `package.json`
- `package-lock.json`

## Current blockers before production deploy

### Must pass before any production release

- [ ] Real-device P0 QA:
  - fresh install and existing DB migration
  - app restart persistence
  - text/voice/manual transaction capture
  - multi-transaction review/edit/save
  - transaction detail edit/delete/undo balance side effects
  - budgets/category/alerts UI flows
  - recurring create/pause/resume/delete/app-open catch-up
  - debt/lending manual and quick parser flows
  - keyboard, navigation, forms, empty/error states.
- [ ] Authenticated non-prod sync smoke:
  - push/pull for transactions, categories, accounts, budgets, recurrings, debts, repayments
  - deletes/tombstones
  - conflict guard behavior with pending local changes
  - append-only `audit_logs` push/pull.
- [ ] Remote D1 migrations applied to the target environment and verified.
- [ ] Backend Worker deployed to a staging/non-prod target and smoke-tested.
- [ ] Mobile build path confirmed and tested: Expo dev/staging build or production channel.
- [ ] Voice reliability benchmark on real devices/providers. Current code path is connected, but reliability is not proven.
- [ ] Secrets/environment check for backend:
  - `JWT_SECRET`
  - Telegram bot token
  - Resend API key if email login is enabled
  - Eskiz token if phone login is enabled
  - Google STT/voice config if online voice is enabled.

### Should resolve before production, can be staged if explicitly accepted

- [ ] App audit still has 8 moderate vulnerabilities in dev/tooling dependency chain (`expo`/metro and `drizzle-kit`/esbuild). Fixing them requires breaking/force upgrades, so they should be handled in a separate dependency-compatibility task, not silently forced.
- [ ] OS-level budget notifications are not implemented; in-app alert history exists.
- [ ] Budget alert records are local-first; full sync as first-class backend records remains optional.
- [ ] Figma API consistency audit is blocked without `FIGMA_ACCESS_TOKEN`; current UX audit is static/manual.
- [ ] Real external AI provider is intentionally postponed; resolver uses `rules_fallback`.
- [ ] Server-side recurring cron depends on approved/configured Cloudflare Cron. App-open catch-up exists.

## What we need to request from Владлен

1. **Deploy target decision**
   - staging/non-prod first or direct production?
   - Recommendation: staging/non-prod first.

2. **Explicit approval for remote actions**
   - apply remote D1 migrations
   - deploy Cloudflare Worker
   - run safe sync smoke against remote backend.

3. **Cloudflare/Wrangler access path**
   - account/project access or CI route
   - target D1 database binding/environment
   - target Worker environment name.

4. **Safe test auth account/session**
   - Telegram/email/phone test login that can be used for sync smoke
   - no real user data.

5. **Mobile release channel/build decision**
   - Expo EAS staging build vs internal APK/TestFlight
   - target platforms for first QA: Android, iOS, or both.

6. **Voice/AI product decision for launch**
   - keep `rules_fallback` resolver for MVP or approve external AI provider later
   - choose voice provider benchmark candidates and acceptable pass threshold.

7. **Security/dependency remediation decision**
   - approve separate app dependency upgrade task for remaining moderate audit issues
   - do not run `npm audit fix --force` blindly because it proposes breaking package changes.

8. **Notifications decision**
   - in-app budget alerts only for launch, or approve OS-level notifications work.

## Deployment recommendation

Do **not** deploy production yet.

We can be ready for **staging deploy** after Владлен approves remote migrations/deploy and gives safe test auth/access.

Production deploy should wait until:
- real-device P0 is green
- authenticated non-prod sync smoke is green
- remote D1 migration verified
- backend env/secrets verified
- mobile staging build verified
- dependency/security risk is explicitly accepted or remediated.
