# Architecture

Tracky is a personal banking, expense tracking, zero-based planning,
subscription, and planned-transaction app built on TanStack Start, Convex, and
WorkOS.

## Boundaries

- TanStack Start owns UI, route composition, and client interactions.
- WorkOS owns authentication and user lifecycle events. Convex receives those
  events through the AuthKit component webhook and syncs app-owned user
  profiles.
- Convex owns backend data, authorization checks, HTTP endpoints, webhooks,
  cron jobs, provider calls, import jobs, detection, matching, and budgeting
  state.
- Banking providers are isolated behind a provider boundary. Enable Banking is
  the MVP provider, but normalized domain tables must not depend on
  Enable-Banking-only field names.
- Browser code must not call banking provider endpoints or read provider
  secrets directly. The UI can invoke authenticated Convex functions such as
  bank discovery, diagnostics, consent start, and manual sync; Convex owns the
  provider HTTP calls, signing, credentials, callback exchange, and cron sync.

## Application Shell And Ledger

The authenticated shell has five primary destinations: Dashboard, Plan, Reports,
All Accounts, and Cash Flow. Forecast, Goals, and Subscriptions live in a
collapsible Tools group. Settings, Get Help, Search, and Analyst are footer
actions rather than peers of the daily workflow.

Accounts are navigation destinations, not only filter values. The sidebar groups
Cash, Credit, and Loans separately, remembers each group's collapsed state, and
shows a group total only when every row has the same currency. Financial accounts
open `/app/accounts/$accountId`; loans open `/app/loans/$facilityId`. The shared
All Accounts route and an account route use the same ledger, but the scoped route
fixes the account filter and hides the redundant Account column.

The desktop ledger uses Account, Date, Payee, Description, Classification,
Category, Memo, Outflow, and Inflow columns. Classification starts hidden but
remains selectable. Fixed table layout allows column resizing; widths persist in
browser storage under separate keys for the shared and account-scoped ledgers.
Transfer rows present the other account as their source or destination instead of
using the imported counterparty as the visible payee.

Sorting and filtering are server-backed across a bounded window of the 5,000 most
recent matching transactions. The interactive filter field parses accounts,
categories, payees, dates, statuses, and inflow or outflow comparisons. Filter
clauses, sort key, and direction live in the URL. The UI reports when the scan cap
prevents it from claiming a complete ordering.

Scheduled rows and the inline creation row render inside the ledger table so they
share its columns and resize state. Scheduled rows normally occupy only a separate
collapsible band above booked rows; an explicit status clause keeps the server's
matching status rows in the paginated table as well. Selecting booked rows raises a floating bulk action bar;
a dialog remains only for editing an existing manual movement.

Authenticated shell and ledger queries use the shared authenticated-query path
and wait for sign-in to settle. Sidebar account groups have a local error boundary
so an account-list failure cannot blank the application shell.

## Convex Domains

- `banking`: provider connections, consents, bank accounts, balances,
  import jobs, raw provider cursors, and normalized transactions.
- `subscriptions`: recurring obligations detected from transactions or created
  manually.
- `transfers`: internal transfer matches between two transactions, including
  optional fee tolerance.
- `planning`: unified planned transactions, money boxes, monthly funding
  targets, and a future cashflow read model that combines persisted expected
  movements, one-off scheduled transaction rows, subscriptions, credit
  instalments, and user-approved suggestions from imported transaction patterns.
  The ledger also consumes a bounded planning read model containing only the next
  unpaid occurrence of each account-bound recurring rule; the client adapts those
  projections, including the rule memo, to table rows without giving them stored
  transaction identity or transaction-oriented actions.
- `plan`: zero-based plans, groups, category buckets, assignments, targets, snapshots, and Ready to Assign.
- `credit`: overdrafts, card credit lines, additional card credit lines,
  instalment credit, mortgages, auto loans, personal loans, amortisation plans,
  and repayment records connected to future cashflow.
- `auth`: WorkOS user lookup, AuthKit webhook handling, app-level profile sync,
  and server-side ownership checks.

## Data Rules

- `userProfiles` stores Tracky-owned profile data keyed by the AuthKit WorkOS
  user id. The AuthKit component keeps its own auth metadata table; product
  features should join against `userProfiles` when they need app-owned profile,
  lifecycle, or future permission state.
- Every user-owned banking table stores `userId` derived server-side from
  WorkOS/AuthKit, not from client arguments.
- Money is stored as `{ amountMinor, currency }`.
- Imported transactions keep a stable provider identity and a normalized
  identity. Raw provider payloads are optional and should be kept compact.
- A transaction can have a classification from import, user override, or
  system analysis. User overrides always win.
- A one-off future movement is stored in `transactions` with `status: "SCHD"`.
  It does not affect a balance or booked activity. A daily mutation promotes due
  rows on manual accounts to `BOOK` and applies the skipped balance delta once.
  Linked accounts accept manual rows only as `SCHD`; their booked truth must
  arrive from the provider.
- Reconciliation keeps the imported `BOOK` row and deletes the matching `SCHD`
  row after carrying user metadata onto the imported row where it is absent.
  Reports, category-spending reads, repayment linking, transfer matching, and
  subscription detection must all choose status explicitly. See
  `decisions/0011-materialised-scheduled-transactions.md`.
- Transfers are modeled as a separate match record, not by mutating one
  transaction into another. Imported transactions can create persisted
  `candidate` transfer matches, but transactions are classified as transfers
  only after the user confirms a candidate or creates a manual match.
- `plannedTransactions` is the single persisted model for expected expenses,
  income, transfers, and internal movements. Its `kind` carries that distinction;
  its optional `note` is distinct from the description/payee metadata and follows
  recurring occurrences into Cash Flow and the ledger. Storage no longer branches
  between `plannedExpenses` and `plannedTransfers`. The public Convex boundary keeps
  legacy operation names and response shapes where the frontend still depends on them.
- Planned transactions and subscriptions can optionally create or link to money
  boxes so the UI can show funding gaps before due dates.
- Suggested planned expenses are derived from bounded transaction reads and are
  not persisted until the user accepts them. Acceptance creates an expense-kind
  `plannedTransactions` row and, by default, a linked `moneyBoxes` row.
- Money box funding calculations live in the Convex domain, not only in the UI,
  so future automations and dashboard surfaces share the same monthly
  contribution math.
- Credit facilities are stored separately from cash balances. The app can show
  limit, used amount, available capacity, utilization, and active installment
  plan debt, but those values do not inflate account liquidity or Plan
  availability.
- An account has exactly one balance for the whole app: the accounting
  position, selected from the latest snapshot by `banking/balances.ts`. A
  provider returns several rows per fetch — some return two, others three — with the
  spendable balance and the booked one as two rows that are identical except
  for the amount — reading the wrong one folds an arranged overdraft into the
  balance, and every consumer that derives availability then counts the limit
  twice. Spendable money is always derived as booked plus the `creditFacilities`
  limit, never taken from the provider.
- Additional card facilities such as a premium card line are represented as
  their own `creditFacilities` row linked to the card/account when possible.
  Each use that creates a repayment schedule is represented by a
  `creditFacilityInstallmentPlans` row so future payments can feed planning.
- Mortgages, auto loans, and personal loans are facility types, not a second debt
  model. Their facility stores the outstanding and optional original principal,
  interest terms, settlement account, optional final payment, and optional
  contractual maturity date. Their instalment plan stores the amortisation
  schedule and recorded payments.
- Active instalment plans expose a generated payment schedule through bounded
  Convex reads. A loan projection starts from the next instalment still to come;
  when a contractual maturity date exists it controls the payoff date, curve,
  and planned occurrences instead of a rate-based estimate. Imported repayment
  transactions can later reconcile against the plan.
- Installment repayment history stores the total paid amount plus optional
  principal, interest, and fee components. Only principal reduces outstanding
  installment debt and used credit capacity; interest and fees remain audited
  payment costs.
- A repayment transaction must sit on an account that actually pays the facility:
  its settlement account, plus its linked account when that is a cash account.
  A facility linked to a CARD account is repaid only from the settlement account,
  because on the card itself a debit is a purchase, never a repayment — an
  instalment plan on a card offered its own purchases as candidates and rejected
  the real bank debit. With neither account configured nothing constrains the
  match and any debit is accepted.
- `listInstallmentLinkOptions` answers what one transaction may be linked to, and
  is the single source for the ledger's linking dialog. It applies the repayment
  account rule above and groups plans by facility and due cycle: a facility repaid
  by one debit for several plans — a card line with three financed purchases — is
  one aggregate option carrying its allocations, never several competing single
  ones. Linking a single plan there would book the whole debit against it and
  leave the others unpaid, which is what the dialog used to allow. Aggregate
  options confirm through `confirmInstallmentPaymentTransactionBatch`, the same
  mutation the Credit panel uses, so both doors onto the same debt behave alike.
- For i18n, UI language is separate from stored financial data. Money keeps the
  provider currency code; currency conversion is out of scope until exchange
  rates and reporting currency rules are designed.
- The initial UI i18n layer lives in `src/lib/i18n.tsx`. It defaults to English,
  supports Italian, persists the selected locale in browser storage, updates the
  document language, and passes the selected Intl locale to money/date
  formatting in product screens.

## Categories And Plan

Categories are user-scoped. Tracky seeds a standard personal-finance taxonomy
idempotently with stable `systemKey` values, while preserving custom user
categories. Imported transactions are classified with conservative MCC and
keyword rules before Plan Activity is computed. Manual user edits still take
precedence over provider or system classification.

Categories use `kind` as their default classification and may declare
`applicableKinds` when one semantic category can span expenses, income, and
transfers. These shared categories use neutral `category:*` system keys; the UI
localizes their canonical database names from the stable key.

Plan buckets organize one or more global categories without changing the
category stored on a transaction. `planBucketCategories.by_planId_and_categoryId`
is read with a complete range and `.unique()`, so a category belongs to at most
one bucket in each plan. Ready to Assign is anchored to observed balances on the
plan's selected accounts; CARD balances are clamped with `min(0, balance)`.
Closed months use snapshots outside a two-month live stability window.

An active instalment plan normally receives a generated protected bucket under
`Instalments`. If a loan is paired to one of the user's Plan categories, that
bucket adopts the `installmentPlanId` instead. It keeps its name, group, target,
assignments, and category mappings; only generated rows are locked. Unpairing
clears the link without moving or deleting the adopted bucket. See
`decisions/0013-loans-adopt-paired-plan-buckets.md`.

## Import Flow

1. A signed-in user starts a provider connection from the UI. The UI reads
   provider availability through an authenticated Convex query and disables the
   connect button when Enable Banking is not configured on the instance, so no
   consent dialog opens without server credentials.
2. Convex can run an authenticated provider diagnostic that calls Enable
   Banking `GET /application` plus bounded ASPSP discovery and returns only
   non-secret status facts to the UI: readiness, active state, environment,
   services, ASPSP count, and normalized setup errors. Missing server
   configuration is reported as plain unavailable without env var names.
3. Convex calls Enable Banking `GET /aspsps` and returns a normalized,
   searchable list of ASPSPs to the UI. The browser never calls Enable Banking
   directly.
4. The UI enables consent only when the selected ASPSP country matches a
   successful provider diagnostic, preventing known-bad redirects before the
   user leaves Tracky.
5. After the user selects an ASPSP, Convex creates a connection authorization
   request with `POST /auth` and returns the provider
   redirect URL. Provider errors are normalized in Convex before being stored
   on auth requests or shown in the UI, so common setup states such as wrong
   signature, inactive app, restricted linked-account access, provider rate
   limits, and expired consent are actionable without exposing credentials.
6. Enable Banking redirects to a Convex HTTP endpoint with the authorization
   code and state.
7. Convex exchanges the code, stores the session and accessible accounts, and
   creates sync state that the user can pause, resume, or refresh manually.
   If the auth request is tied to an existing provider connection, Convex
   replaces that connection's session and reconciles its accounts instead of
   creating a duplicate connection.
   The callback exchange is recorded as an `importJobs` row so auth/session
   failures are visible from the import history in Settings.
8. If `ENABLE_BANKING_RETURN_URL` is configured, Convex redirects back to the
   bank-connections page in Settings with the callback state. The legacy
   `/app/accounts` entry point forwards those search parameters to preserve
   existing callback configuration. The UI reads the final auth request status
   through an authenticated Convex query.
9. Convex cron runs background sync in provider-safe batches. Active,
    rate-limited, and failed sync states share the dispatcher; failures receive a
    growing retry backoff instead of becoming permanently silent.
10. After a successful callback, Convex schedules an initial sync for the active
    accounts on that connection with small per-account delays. This keeps the
    import in Convex scheduled work while avoiding a 6-hour wait for the next
    periodic cron.
11. Each account sync imports balance snapshots from `/balances` before fetching
    paginated booked transactions from `/transactions`. Incremental transaction
    reads start seven days before the last booked date, bounded by the initial
    backfill date and today, because providers can deliver older booking dates
    several days late.
12. Future-dated provider rows may be stored but do not advance the incremental
    cursor beyond today. Each scheduled or manual sync is recorded as an
    `importJobs` row with trigger, status, retry time, page count, balance count,
    transaction count, and provider error details.
13. Imported transactions are deduplicated and normalized. Booked rows then pass
    through subscription and transfer candidate detection; scheduled rows are
    excluded until they become booked facts.

## Auth Sync Flow

1. WorkOS AuthKit handles sign-in and issues JWTs validated by
   `convex/auth.config.ts`.
2. The AuthKit component registers `/workos/webhook` in `convex/http.ts`.
3. WorkOS sends `user.created`, `user.updated`, and `user.deleted` events to
   that endpoint. `WORKOS_WEBHOOK_SECRET` must be configured in Convex env.
4. `convex/auth.ts` forwards those events into `convex/authProfiles.ts`, which
   upserts or soft-deletes `userProfiles`.
5. The authenticated app bootstrap repairs its app-owned profile from the
   server-side AuthKit component user, not from sparse access-token claims.
   If component sync is still pending, the bootstrap preserves any previously
   trusted email, verification, and lifecycle fields instead of clearing them
   or reactivating a soft-deleted profile from a stale token. If neither source
   has a user, bootstrap fails closed and does not create an active profile.
6. Existing WorkOS users can be replayed with `npx convex run auth:backfillUsers`.
7. Protected Convex functions derive the current user server-side and use the
   WorkOS/AuthKit user id for ownership checks.

## Account Erasure Flow

The Settings danger zone offers a final JSON export and requires the current
email to confirm deletion. The client first opens the isolated holding page,
unmounting normal app queries, then calls `accountDeletion.deleteMyAccount`.
That authenticated mutation records an erasure job and schedules the first
server action. A pending request is tied to the confirming WorkOS account, and
the route guard keeps normal screens unmounted if the user presses Back before
the request finishes. It withholds normal screens until it can read tab storage
and offers a retry if storage is unavailable. The holding page reads
`getDeletionStatus` to display progress; it does not drive the wipe. Marker
storage failures cannot interrupt status polling or sign-out after erasure.
If the request itself fails, it offers a return to
Settings before any erasure job exists. The server
disconnects sync, deletes user-owned records in indexed batches, revokes bank
sessions on a best-effort basis, deletes Analyst component threads, then removes
settings and profile before calling WorkOS User Management DELETE. An error
keeps a retryable job; a five-minute cron recovers stale jobs. Normal app calls,
profile webhooks, and asynchronous writers check the job and hashed tombstone
in the transaction that writes data. A callback that receives a new Enable
Banking session after its authorization request was erased records the session
in `detachedConsentRevocations`, then attempts a compensating DELETE; the
five-minute recovery sweep retries failures and drops that retry state after
at most 30 days. The completed erasure job temporarily remains without the
raw user ID so the holding page can observe `done` before the WorkOS session
disappears. See decision 0024 for provider and component retention limits.

## Enable Banking Constraints

Enable Banking may return a `continuation_key`; sync must keep all query
parameters identical while paging and continue until no key remains.
Background data fetches can hit ASPSP limits, often around four fetches per day;
on `ASPSP_RATE_LIMIT_EXCEEDED`, retry after about six hours.
The configured Enable Banking app is the restricted production app
`<your-enable-banking-app-id>`; its registered redirect is the Convex HTTP URL
`https://<your-deployment>.convex.site/enablebanking/callback`.
`ENABLE_BANKING_PRIVATE_KEY` must be the PEM private key matching the
certificate registered on that exact app; using a key from another Enable
Banking app returns `401 Wrong signature` before ASPSP discovery or auth can
start.
Provider private keys, certificates, and future bank-provider secret bundles
must stay out of git. They are either set as Convex environment variables or
kept in ignored local files such as `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`,
or `secrets/`.
The restricted production app's linked accounts are managed in the Enable
Banking Control Panel. `GET /application` does not expose those linked account
IBANs to the API, so Tracky's provider diagnostic reports application readiness,
environment, services, and ASPSP discovery counts, but does not attempt to show
provider-side linked IBANs. The connect UI shows this restricted-app caveat so
the bank list is not mistaken for unrestricted access to every listed ASPSP.
If `GET /application` declares configured countries, Tracky marks a selected
country outside that set as unsupported before the consent flow starts.
When consent expiry or provider auth errors indicate revocation, Convex marks
the provider connection, linked accounts, and sync states as
`reauthorizationRequired` and stops automatic sync until the user reconnects.

## AI Analyst Boundary

The Analyst uses the Convex Agent component for persisted threads, messages,
tool calls, approval state, and resumable stream deltas. Public chat functions
derive the WorkOS user server-side and never accept a user ID. Banking reads and
writes remain internal, user-scoped functions; interactive write tools are
explicitly approval-gated before execution. When one model step proposes
multiple writes, each decision is persisted but generation remains paused until
the whole approval batch is resolved. Denials carry an explicit non-execution
reason into the model context, and final summaries must derive success only from
tool results rather than proposed inputs or approval requests.

Proactive automation shares the Agent component but not the chat toolset. Its
agent can only read bounded financial models, run pure simulations, and present
tables/charts. It cannot call write tools, approval flows, or web search. LLM
work runs only in an internal Node action, while roster/data reads, report
claims, snapshots, notifications, and email queue state stay in internal
queries/mutations.

Daily health and anomaly work plus monthly report and subscription-review work
page active `userProfiles.by_status` in batches of 20. Each dispatcher fixes the
UTC as-of date and reporting period on its first page, transactionally inserts
one deduplicated `proactiveJobs` row per user, and forwards the cursor until the
roster is exhausted. A mutation watchdog atomically claims due jobs with a
fifteen-minute dispatch lease and schedules the bounded worker action. At its
actual start, the worker atomically verifies the token has not expired and
renews the fence for longer than the maximum action runtime. Its one-minute cron
recovers expired running leases and due retries, so an at-most-once scheduled
action that never starts, crashes, or times out cannot lose the unit of work.
Attempts stop at three; worker completion and failure mutations verify the lease
token before changing state. If a recovered monthly worker encounters the still
fresh `agentReports` claim left by an interrupted predecessor, it durably defers
until that claim's stale deadline and neutralizes the unused queue claim; these
waits therefore cannot consume all three execution attempts. Financial
aggregation is always currency-scoped;
Tracky does not infer exchange rates.

`agentReports` remains the report/output idempotency record while
`proactiveJobs` owns durable execution and recovery. A monthly
report mutationally creates or reuses its Agent thread and one pending assistant
message while attaching both IDs to the report. The mutation itself validates
the preferred thread's existence and owner in the Agent component, making the
read participate in the same OCC transaction as association. Generation stores no implicit
Agent messages; completion replaces that same pending message ID, so retries do
not append duplicate outputs and a failed transaction cannot leave a newly
created thread unattached. The report then upserts the existing
notification inbox and optionally queues a plain-text email through the Resend
Convex component. Missing recipient/sender configuration marks email skipped
without failing the in-app report. `/resend-webhook` delegates verified delivery
events to the component, which owns delivery status, retries, batching, and
retention cleanup. AI Gateway, Langfuse, Resend API keys, sender identity, and
webhook secrets exist only in the Convex environment, never in Vite/browser
variables.

Intermediate monthly failures retain the pending output slot for a retry. At
the final queue attempt, the same mutation transaction reconciles report and job
state: a completed report promotes the job to completed, while any other report
finalizes the existing slot with a safe localized failure and marks both rows
failed. If Agent finalization fails, the mutation rolls back and the lease stays
recoverable instead of leaving a terminal job with a pending message.

Anomaly lookup remains migration-free: the notification schema is unchanged,
and the tool performs a bounded range read on the existing
`by_userId_and_dedupeKey` index using the stable
`analyst:anomaly:<period>:` prefix. This includes earlier notifications whose
period exists only in `params`.

Phase 3 keeps additional channels inside the same Agent ownership boundary.
`/telegram-webhook` requires a 32–256 character Telegram secret and verifies
its header before parsing a bounded private-text update. Per-chat burst and
daily ingress limits cover link commands, unlinked messages, and Analyst-limit
rejections without persisting overflow replies. One-time link codes are stored only as SHA-256 hashes and
atomically bind one Tracky user to one Telegram chat. A persisted update queue,
leases, bounded attempts, a watchdog, per-chat FIFO claims, successor wakeups,
and per-chunk acknowledgements recover generation and delivery work without
concurrently processing the same chat.
The direct Bot API has no client-provided idempotency key: an infrastructure
crash after Telegram accepts a chunk but before Tracky records its acknowledgement
can still cause that chunk to be retried. This residual external-effect window is
tracked as a deployment limitation rather than hidden behind in-memory state.

The application-owned Analyst conversation, message, and audit tables from the
pre-Agent implementation were cleared and removed from the schema after both
deployments were verified empty. Agent component storage is now the sole owner
of interactive Analyst conversation state.

Telegram inbound messages reuse an owner-validated Agent thread, the interactive
prompt and tools, memory retrieval, and the existing per-thread turn lock. Write
tools still create Agent approval requests. Telegram never approves them; the bot
directs the user to the same web thread for approval or denial.

Durable Analyst memories live in `agentMemories`, store a 1536-dimensional
AI Gateway embedding, and are vector-searched with a mandatory `userId` filter.
The five best owner-scoped results are hydrated through an ownership-checking
query and injected as bounded, explicitly delimited untrusted data. Embedding or
retrieval failures are soft and cannot block a chat turn. Only the interactive
approval-gated `rememberFact` tool writes memory; proactive agents do not receive
that tool.

The purchase skill composes existing read and what-if tools without inventing
exchange rates. Money-box optimization is a deterministic, read-only, one-currency
allocation over existing funding plans. Bulk recategorization accepts category
names rather than IDs and prevalidates every user-owned transaction and category
before an atomic mutation writes any change.
