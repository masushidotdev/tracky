# Banking MVP Execution Plan

Status: active.

## Goal

Build the foundation for a personal banking, expense tracking, budgeting,
subscription, transfer, and planned expense app using TanStack Start, Convex,
WorkOS, and Enable Banking.

## Phases

1. Harness and architecture - complete
   - Add repository-readable architecture docs and MVP assumptions.
   - Establish branch/worktree-capable Git workflow.

2. Backend domain foundation - complete for first tranche
   - Replace the placeholder schema with user-scoped banking, transaction,
     subscription, transfer, planning, and import job tables.
   - Add shared auth helpers and validators.
   - Add WorkOS/AuthKit webhook-backed user profile sync for app-owned user
     lifecycle state.
   - Keep provider-specific data isolated from normalized domain tables.

3. Enable Banking MVP integration - backend skeleton complete
   - Add provider config and JWT signing support.
   - Add start-connection action and callback HTTP endpoint.
   - Add account/session persistence and sync state.
   - Add cron-driven background sync with continuation-key handling and
     rate-limit backoff.
   - Add account-scoped manual sync plus pause/resume controls.
   - Add optional post-callback redirect to the accounts UI with authenticated
     status lookup.
   - Add consent expiry/revocation handling that marks connections, accounts,
     and sync states as requiring reauthorization.

4. Detection and manual controls - first tranche complete
   - Add subscription candidate detection.
   - Add manual conversion from transaction to subscription.
   - Add transfer candidate detection and manual match mutation.
   - Persist system transfer candidates during transaction import and allow
     user confirmation or rejection.
   - Auto-confirm high-confidence exact transfer matches during import while
     keeping lower-confidence or fee-bearing matches in the review queue.
   - Add planned expense and money box mutations.
   - Add suggested planned expenses and money boxes from sizeable recurring
     transaction patterns.
   - Share transfer confirmation logic between user-driven matches and future
     system-driven matching.
   - Add credit facilities and installment plan tracking for overdrafts, card
     lines, additional card lines, and installment credit.
   - Generate upcoming repayment schedules from active credit installment plans
     so planning can show future monthly obligations.
   - Reconcile imported debit transactions against active installment plans,
     persist repayment history, and mark confirmed repayment transactions as
     internal so budgets do not double-count financed purchases.
   - Support optional principal, interest, and fee breakdowns for installment
     repayments so only principal reduces used credit and outstanding debt.

5. UI - first tranche complete
   - Replace placeholder dashboard with upcoming payments, funding gaps,
     account health, and sync alerts.
   - Replace the template root route with a Tracky entry point wired to
     WorkOS sign-in/sign-up and the authenticated dashboard.
   - Add transactions list with classification, subscription conversion, and
     transfer matching.
   - Show persisted transfer candidates in the review queue with confirm and
     reject actions.
   - Add subscriptions and money boxes screens.
   - Add category budget screen and monthly budget progress.
   - Add manual contribution capture for money boxes.
   - Add a suggested money boxes panel that previews next due date and monthly
     funding target before acceptance.
   - Show server-computed money box funding status, remaining amount, and
     monthly contribution target.
   - Show credit facilities on dashboard and accounts with manual creation,
     utilization, available capacity, and active installment debt.
   - Add manual installment plan creation and quick repayment recording in the
     credit facilities panel.
   - Show upcoming credit repayments in the planning screen for the next six
     months, including overdue installments.
   - Show imported repayment suggestions in the credit facilities panel and let
     the user confirm transaction-to-installment links from the UI.

6. i18n and AI analyst - in progress
   - Add English and Italian UI resources with English as default language -
     first tranche complete for the public entry point, app navigation, banking
     panels, planning, budgets, accounts, credit facilities, and transactions.
   - Extend English and Italian coverage to secondary subscription creation
     and authenticated template routes.
   - Keep backend money storage provider-compatible with ISO currency codes.
   - Add a conversational AI analyst surface backed by scoped, audited Convex
     read APIs before enabling any write action - first read-only local analyst
     tranche complete.
   - Add an authenticated `analyst.ask` Convex action that can call OpenAI from
     the backend with the bounded analyst snapshot, while falling back to a
     deterministic read-only local answer when `OPENAI_API_KEY` is missing or
     the provider call fails.
   - Persist analyst conversations and messages in user-scoped Convex tables
     with source/model/warning metadata for audit and continuity.
   - Add soft archive for analyst conversations so users can remove old chats
     from active history without losing audit metadata.
   - Add bounded conversation export and explicit hard-delete retention
     controls for analyst chat history.
   - Split new analyst audit metadata into dedicated audit rows while keeping
     user-visible chat messages backward compatible.

7. Verification
   - Run `npm run lint`.
   - Run `npm run build`.
   - Add focused Convex tests when schema and business logic stabilize.
   - Verify key UI routes in browser once the frontend is connected.

## Current Verification Evidence

- Convex guidelines were read from `convex/_generated/ai/guidelines.md`.
- Enable Banking documentation confirms continuation-key paging and ASPSP
  background rate-limit behavior.
- The repository has a baseline commit and work is on
  `feature/banking-mvp-foundation`.
- `npx convex codegen` passes.
- `npm run build` passes.
- `npm run lint` passes across the full repo after cleaning up template UI
  import ordering, type-only imports, shadowed variables, and unnecessary
  optional chains.
- Tailwind's root stylesheet import is pinned to `tailwindcss/index.css` so
  both client and SSR builds resolve it consistently.
- WorkOS AuthKit webhook events now sync `userProfiles`; existing WorkOS users
  can be replayed with `npx convex run auth:backfillUsers`.
- Added `/app/accounts`, `/app/transactions`, and `/app/planning` routes.
- Added `/app/budgets` route.
- Dashboard `/app` now shows planning, account sync, and transaction panels.
- Dashboard `/app` now includes monthly budget progress.
- Public `/` now renders the Tracky entry point instead of the template
  placeholder and links into WorkOS auth with `/app` as return target.
- Unused shadcn demo dashboard/table components and the duplicate template app
  layout were removed so the app surface is limited to Tracky-specific routes
  and components.
- `/app/accounts` supports pausing/resuming account sync and triggering a
  manual account refresh without bypassing server-side ownership checks.
- `/app/accounts` can show the outcome of an Enable Banking callback using the
  returned state and a user-scoped Convex query.
- `/app/accounts` now loads ASPSPs from Enable Banking through Convex and starts
  consent only after the user selects a returned bank.
- Successful Enable Banking callbacks now schedule an immediate first sync for
  active accounts on the authorized connection, with small per-account delays,
  so the user does not have to wait for the next 6-hour cron tick.
- Enable Banking callback exchanges, initial imports, cron syncs, and manual
  refreshes now write bounded `importJobs` audit rows that are visible from
  `/app/accounts` with status, trigger, retry time, provider error, page count,
  balance count, and transaction count.
- Account sync now requests both balance and transaction access, imports
  `/balances` snapshots before paginated `/transactions`, and shows the latest
  imported balance in the account sync UI.
- Enable Banking auth diagnostics showed the app id must be the restricted
  production app `<your-enable-banking-app-id>` for the Convex redirect,
  and the private key must match that app certificate or the API returns
  `401 Wrong signature`.
- Convex dev env has been updated to the production app id and the
  `ENABLE_BANKING_PRIVATE_KEY` has been reset from the app-specific PEM file
  `<your-enable-banking-app-id>.pem`. A signed `GET /application`
  returns `200` with `active:true`, `environment:PRODUCTION`, and service `AIS`;
  signed ASPSP discovery for Italy returns `200` with 323 ASPSPs.
- `/app/accounts` shows consent expiry warnings and blocks sync actions when a
  bank connection must be reauthorized.
- `/app/accounts` can start an Enable Banking reauthorization for an existing
  provider connection. The callback updates the existing session and reconciles
  accounts instead of duplicating the connection.
- Reauthorization account reconciliation now treats Enable Banking account
  `uid` as volatile and matches existing accounts by stable identification hash
  or masked IBAN/currency fallback before inserting. This prevents duplicated
  accounts when a renewed consent returns new provider account ids for the same
  bank account.
- `/app/accounts` now also runs a user-scoped duplicate account identity repair
  pass once when the account overview loads, keeping the oldest canonical
  account, updating it with the current provider id, and pausing duplicate sync
  states left by earlier renewals.
- Transaction import now performs a conservative system-side subscription
  classification when a debit recurs with a similar merchant, amount, and
  interval.
- Imported recurring debits now link to matching active subscriptions and
  advance `latestTransactionId` plus `nextDueDate` idempotently when the same
  provider transaction is reimported.
- The transactions screen now includes a review queue for system-detected
  subscription candidates and likely transfer pairs.
- Users can confirm or reject subscription suggestions, confirm suggested
  transfer pairs, and assign categories directly from the transactions list.
- `convex/subscriptions.test.ts` verifies the authenticated user path for
  manual transaction-to-subscription conversion: an imported debit creates a
  user-owned subscription, infers cadence from related imported debits, and
  links/reclassifies the related transactions as user-confirmed subscriptions.
  The same test file verifies that a signed-in user cannot convert another
  user's imported transaction or create a cross-user subscription from it.
- The legacy `simple-table.tsx` transaction table was removed after migration;
  `/app/transactions` now uses the TanStack DataTable implementation with
  Convex cursor pagination as the single transaction list surface.
- `convex/transactions-pagination.test.ts` verifies that transaction listing
  follows Convex `continueCursor` values across more than two pages, covering
  the regression where the UI stopped after 40 rows despite more documents in
  the database. It also covers filtered pages where non-matching rows are
  skipped while still returning full pages until the matching set is exhausted.
- Transaction import now persists likely transfer pairs as `candidate`
  `transferMatches`, including amount deltas for possible fees, and only
  classifies transactions after user confirmation.
- Transaction import now auto-confirms high-confidence exact transfer matches
  and keeps lower-confidence/fee-bearing matches as candidates.
- `convex/banking-transfer.test.ts` now covers the authenticated public manual
  transfer-match mutation, including fee-bearing top-ups, user-confirmed
  transaction classification, and rejection of cross-user transaction matching.
- Manual transaction classification can mark one-off items as `transfer` when
  the user knows they are internal movements but no provider counterpart exists
  or should be linked. Confirmed pairs still use `transferMatches` for an
  auditable source/destination relationship, while unmatched manual transfers
  remain explicit user overrides and stay excluded from budget spending.
- Categories and budgets are user-scoped and budget progress excludes internal
  transfers.
- Creating a monthly budget for the same user, period, and category scope now
  updates the existing budget instead of duplicating the progress row. Overall
  monthly budgets follow the same one-row-per-period rule.
- Tracky now seeds a standard user-scoped category taxonomy idempotently and
  preserves custom categories.
- Imported transactions now receive conservative system categories from MCC and
  keyword rules before budget progress is computed.
- Money boxes support manual contributions that update saved amount.
- The planning screen now suggests money boxes for sizeable recurring debit
  patterns and creates linked planned expenses only after user acceptance.
- Money box funding calculations are centralized in Convex domain helpers and
  surfaced in the planning UI.
- The planning dashboard now has a future cashflow summary that combines
  planned expenses, active subscriptions, credit installment payments, and
  monthly money-box funding targets in a bounded Convex read model.
- Future cashflow expands recurring planned expenses into each concrete
  occurrence within the selected horizon, including recurring expenses whose
  first due date predates the period. Account-grouped monthly summaries sum
  those occurrences rather than the base planned-expense definition.
- Planned expenses can be marked as planned, funding, paid, or cancelled from
  the planning UI. Paid planned expenses complete linked money boxes, cancelled
  expenses archive them, and inactive planned expenses are excluded from active
  future cashflow.
- Credit facilities now track overdrafts, card credit lines, additional card
  lines, installment credit, limit/used/available capacity, and installment
  plans without mixing credit capacity into account cash balances.
- `/app` and `/app/accounts` show credit facilities and allow manual facility
  creation plus quick used-amount updates.
- `/app` and `/app/accounts` can create installment plans for a credit
  facility, estimate or store the monthly repayment, and record repayments.
- The planning UI now includes upcoming credit repayments generated from active
  installment plans.
- Imported debit transactions can now be confirmed as repayments for active
  installment plans. Confirmed repayments create audit rows, reduce installment
  debt and used credit capacity, and mark the source transaction as internal.
- The credit facilities panel now surfaces imported repayment candidates with
  confidence, expected amount, and account context before confirmation.
- Installment repayments can now store optional principal/interest/fee splits.
  The total payment remains audited, while only principal reduces outstanding
  debt and used credit capacity.
- Initial i18n now defaults to English, supports Italian, persists locale in
  browser storage, exposes a language selector in the app header, and uses the
  selected Intl locale for visible money/date formatting across banking panels.
- Banking action toasts for account sync, bank consent start, transaction
  review, transfer matching, budgeting, planning, money-box contributions, and
  credit facilities now use the English/Italian i18n catalog instead of
  hardcoded English strings.
- The transactions table now also localizes category group labels and row
  selection accessibility labels in the English/Italian i18n catalog.
- Sidebar document labels and the global not-found surface now use the shared
  English/Italian i18n catalog instead of hardcoded template strings.
- The manual subscription creation route now uses the shared i18n catalog and
  app card/form components instead of template copy and hardcoded toasts.
- `/app/analyst` now exposes a read-only chat-style analyst backed by the
  bounded `analyst.getSnapshot` Convex query. It can summarize accounts,
  sync issues, budget position, recurring subscriptions, money-box funding
  targets, and upcoming credit repayments without mutating financial data.
- `/app/analyst` now sends questions to the authenticated `analyst.ask` Convex
  action. The action uses the OpenAI Responses API only from Convex when
  `OPENAI_API_KEY` is configured, passes a bounded user-scoped snapshot, and
  returns a local read-only fallback otherwise.
- Analyst exchanges are now persisted in Convex as user-scoped conversations
  and messages, including output source, model, and warning metadata. The UI can
  resume recent conversations or start a new one.
- Analyst conversations can now be archived from the UI. Archived conversations
  are removed from active history, keep their existing message audit trail, and
  cannot receive further appended exchanges.
- Analyst conversations can now be exported as bounded JSON from a user-scoped
  Convex query and permanently deleted with batched message cleanup.
- New analyst exchanges now write dedicated `analystAuditEvents` rows with
  source/model/warning and length metadata. Conversation export includes these
  audit rows, and hard delete removes them with the conversation.
- `/app/accounts` now shows an authenticated Enable Banking provider diagnostic
  in the connect panel. It checks `/application` and bounded ASPSP discovery
  from Convex, reports provider readiness without exposing credentials, and
  distinguishes credential mismatch, inactive app, and provider unavailability.
- Enable Banking auth/start/sync errors are normalized in Convex before being
  stored or shown, including wrong signature, inactive app, restricted linked
  account access, ASPSP rate limits, and expired/revoked consent.
- `convex/architecture-invariants.test.ts` now mechanically enforces three
  security/performance rules for agentic development: public Convex
  `query`/`mutation`/`action` functions cannot accept client-supplied `userId`
  args, public Convex functions must derive auth server-side, and Convex
  database query chains cannot use runtime `.filter()` calls.
- The same architecture invariant suite now also guards the banking provider
  boundary by failing if frontend source starts referencing Enable Banking
  environment variables, provider hosts, raw PSD2 endpoints, or provider secret
  names directly. The browser must go through authenticated Convex functions.
- `convex/knowledge-base.test.ts` now mechanically enforces harness-engineering
  documentation hygiene: every durable docs page must be indexed from
  `docs/README.md`, decision records need explicit status metadata, and
  execution plans need status plus verification evidence sections.
- `npm test` runs focused tests for WorkOS profile sync, provider transaction
  dedupe, imported balance snapshots, import job success/rate-limit accounting,
  default category seeding and imported transaction categorization,
  connection-scoped initial sync target selection, recurring debit subscription
  suggestions, future cashflow
  projections, suggested planned expenses, persisted transfer candidates,
  high-confidence transfer auto-confirmation, transfer matching, funding math,
  credit facility math, installment repayment schedules, bank consent
  reauthorization state, and renewal of existing provider connections without
  duplicating accounts.
- Browser verification confirmed `/` renders Tracky and protected routes
  redirect to WorkOS AuthKit with their return paths preserved.

## Next Work

- Verify authenticated app screens in browser after signing in or adding a
  test-auth/dev-seed path.
- Complete translation coverage for any future settings/help surfaces.
