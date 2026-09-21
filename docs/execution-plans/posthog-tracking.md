# PostHog tracking — execution plan

Status: implemented

## Plan (as agreed)

MVP funnel + core (~25 events), opt-in banner, client-only EU capture:

1. Foundations: `posthog-js`, `src/lib/analytics/events.ts` (singleton,
   consent store, route tracker, identify), `AnalyticsBootstrap` in
   `__root.tsx`, `ConsentBanner`, `TrackingCard` in Settings.
2. Core events across landing, dashboard, plan, transactions, planning,
   reports, forecast, goals, subscriptions, accounts/bank, CSV import,
   credit/loans/installments, analyst, docs, settings, command menu,
   notifications, upgrade CTA.
3. Staging QA, then prod tag. Docs EN+IT in the same release.

## Decisions taken along the way

- Wizard not used: no TanStack Start support documented; manual install.
- Managed proxy (not Worker): PostHog-managed CNAME, DNS-only.
- Single project staging+prod with `app_env` prop (user).
- Kill-switch `VITE_POSTHOG_ENABLED` + replay 100% (user).
- Single Accept/Reject banner (user); no per-scope toggles.
- `login_completed` emitted at app bootstrap on first userId (WorkOS
  redirect breaks client session continuity); `signup_completed` not
  separately observable — signup and login share the callback path.
- `upgrade_cta_clicked` renamed to impression semantics: the CTA button is
  `disabled` (no paywall yet), so the event fires on view with
  `{surface, daily_limit_reached}`. Rename on paywall launch.
- `goal_created`/`goal_contribution_added` were dropped as separate names:
  goals reuse `MoneyBoxFormDialog`/`RegisterContributionDialog`, so goals
  surface emits `money_box_created`/`money_box_funded` (+ `goal_created`
  alongside when `surface === 'goals'`). `goalContributionAdded` key kept in
  the event map for future direct use.
- `opt_out_capturing_by_default: true` added after review: SDK-level
  second gate under the localStorage gate.

## Inconsistencies found while building

- `posthog-js` 1.434 API: no `posthog.optedOut()` — `has_opted_out_capturing()`
  is the check; `opt_in/opt_out_capturing()` manage state; `reset()` after
  `opt_in` silently stops capture (documented footgun) — logout and
  revocation paths handle re-opt-in explicitly.
- Test env is `edge-runtime` (no `window.localStorage`): analytics test file
  needs `// @vitest-environment jsdom`.
- `tsc` in this checkout reports a pre-existing `content-collections` error
  (generated types absent); unrelated to this change, filtered in checks.
- npm 11 vs repo lockfile churn: `npm install` rewrites the whole
  `package-lock.json`; dependency added via surgical lockfile patch instead
  (12 new entries only). Maintainer: regenerate the lockfile with the pinned
  toolchain before merge if preferred.

## Bugs fixed

- Consent reject path called `trackEvent` before any SDK init (silent no-op by
  design) — simplified to local-only store write; `tracking_consent_changed`
  with `accepted` still emitted on accept.
- `reset()` clearing `app_env` super-prop — re-register on identify path so
  staging/prod separation survives logout/login.

## Current Verification Evidence

- `npx vitest run src/lib/analytics/events.test.ts`: 6 passed.
- `tsc --noEmit`: clean excluding the pre-existing `content-collections`
  generated-types error, unrelated to this change.
- `eslint --max-warnings 0`: clean on all touched files.
- Open before merge: staging QA (pre-consent silence, banner, revocation,
  replay masks, anon->logged funnel, proxy 200s), operator steps (DPA,
  managed-proxy CNAME, per-target env, Person-delete checklist), full
  `npm test` + `npm run lint` on the pinned toolchain.
