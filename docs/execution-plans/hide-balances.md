# Hide balances

Status: in progress.

## Goal

Give the authenticated app a persistent privacy switch that hides every real or derived balance,
so the user can open Tracky in public, share a screen, or take a screenshot without exposing amounts.

- The control lives in the app header next to the theme switcher and the language selector, so it
  persists across the whole `/app` navigation.
- It is icon-only: an open eye when balances are visible, a closed eye when they are hidden.
- Hiding covers account balances and every dynamically computed amount: dashboard KPIs, reports,
  future planning, forecast, goals, plan, subscriptions, credit facilities, charts, and notifications.
- Individual transaction amounts in the Transactions section stay readable.
- The preference persists across navigation and reloads, per browser.

## Decisions

- **Masking, not CSS blurring.** A CSS-only treatment leaves the real number in the DOM, where the
  inspector, select-all, DOM exports, and screen readers still reach it. `Amount` renders a
  placeholder instead, so the value never enters the document.
- **This is visual privacy, not an access control.** Convex streams the real values to the client
  over the websocket and React Query caches them, so devtools always reach the underlying data. The
  masking removes amounts from the rendered page; it does not remove them from the client.
- **Cookie as the source of truth for the first render.** The preference is read server-side in the
  `/_authenticated/_app` loader and passed to the provider as its initial state, so the very first
  client render is already correct: no `useEffect` flash, no hydration mismatch. `localStorage`
  mirrors the value and syncs open tabs through the `storage` event; it is also the fallback when
  cookies are unavailable.
- **Sensitive by default.** `Amount` masks unless a call site opts out with `sensitive={false}`, so
  new code is protected by default and the exceptions are explicit and greppable.
- **Exception rule.** The amount of a *single transaction* stays visible — in the table, in the
  detail sheet, and in the dialogs that show one transaction. Balances, totals, aggregates,
  projections, and progress figures are always masked, including inside the Transactions section.
- **Charts keep their shapes.** When balances are hidden, currency axis ticks are dropped and tooltip
  values are masked. The series shapes stay visible; without axis values they carry no absolute
  amounts, and the page stays readable as a trend.
- **The Analyst chat prose is not masked.** Amounts interpolated into free-form assistant text cannot
  be intercepted reliably; masking the whole message would make the chat useless. The structured
  parts (charts, tables, tool confirmations) go through `Amount` and are masked.

## Assumptions

- The preference is per browser, not synced to the Convex user profile.
- With JavaScript disabled or cookies blocked and no mirrored `localStorage` value, balances render
  visible. There is no server-side data masking to fall back on.
- The `account.hidden` flag on the accounts page is a different concept and stays untouched.

## Phases

1. **Foundations.** Pure cookie/storage helpers plus unit tests, the `BalancePrivacyProvider` and
   `useBalancePrivacy` hook, the server-side cookie read wired into the `_app` loader, and the
   `privacy.*` translation keys in both catalogs. No visible change yet.
2. **Header toggle.** The icon-only control in `SiteHeader` between the notification bell and the
   theme switcher, plus the matching command-menu entry.
3. **`Amount` masking.** `sensitive` defaults to `true`; the twelve single-transaction call sites opt
   out.
4. **Call sites that bypass `Amount`.** The `formatMoney` / `compactMoney` usages, by section:
   accounts, dashboard, reports, planning, forecast, goals, plan, subscriptions, credit,
   installments, imports, charts, and notification bodies.
5. **Verification.** Lint, tests, build, a live pass over every section with the toggle on and off,
   an inspector check that no amount remains in the DOM while hidden, a reload check that the page
   starts masked, plus changelog and user-documentation updates.

## Current Verification Evidence

Pending: the plan is being executed.
