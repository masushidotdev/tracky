# 0022: PostHog product analytics (opt-in, EU, client-only)

Status: accepted

## Decision

Client-only PostHog via `posthog-js`, lazy init after explicit opt-in banner:

- Single EU project for staging+prod; `app_env` super-prop + hostname filter
  separate traffic (user decision: no separate staging project).
- Managed proxy on neutral subdomain `e.trytracky.app` (`api_host`); `ui_host`
  `https://eu.posthog.com`. No custom Worker, no Convex secrets.
- `opt_out_capturing_by_default: true` + localStorage gate (`unknown` default):
  zero beacons before accept. Kill-switch `VITE_POSTHOG_ENABLED=false`.
- Manual `$pageview` on TanStack route change (debounced, `route_id`
  normalized, query stripped). `autocapture: false`. A `before_send` hook
  rewrites SDK-added URL props (`$current_url`, `$pathname`) to the
  normalized route id and drops `$referrer`/`$referring_domain`, so raw
  Convex ids, query, hash, and referrer never leave the browser.
- Identify on WorkOS user id only; alias anon->logged; `reset()` + opt-out on
  logout. No emails, names, amounts, notes, bank names, prompt text in props.
- Session replay 100% sample (user decision), `maskAllInputs`, text/block
  selectors for financial surfaces.
- Single Accept/Reject banner; revocation in Settings -> Usage analytics.
- Account deletion: Phase 1 manual PostHog Person delete (operator checklist);
  automation deferred.
- The deletion survey records only the fixed reason and whether an `Other`
  comment exists in PostHog, under the existing analytics opt-in. The free text,
  email, and name remain in Convex; they are never event properties.

## Why

Public OOS product needs funnel + feature-usage data to plan improvements,
but financial PII and GDPR forbid default tracking. Opt-in client-only with
enum/bucket props gives usable aggregates with minimal data. Managed proxy
recovers adblocked traffic without operating Worker code. Single project keeps
the free plan and ops simple; staging noise is filterable.

## Alternatives considered

- `@posthog/wizard` auto-setup: rejected — no documented TanStack Start
  support, uncontrolled file changes.
- Separate staging project: rejected by user — one project, filtered views.
- Backend capture via Convex: rejected for MVP — no server secrets, no DPA
  expansion; revisit for sync jobs with legal review.
- Autocapture: rejected — financial DOM leaks PII by default.

## Verification

- `npx vitest run src/lib/analytics/events.test.ts`, `tsc`, `eslint`.
- Staging checklist: no beacon pre-consent (DevTools), banner accept/reject,
  revocation, replay masks on balances/chat, anon->logged funnel, CSP-safe
  proxy host.
