# Changelog

## Unreleased

### Added

- Opt-in product analytics. Tracky can now collect pseudonymous usage
  statistics — pages visited and features used, never amounts, balances,
  notes, account names, or message text — through a EU-hosted PostHog
  project, and only after you press **Accept** on the banner. The **Usage
  analytics** card in Settings shows the current choice and lets you change
  it anytime; rejecting keeps everything local and nothing is sent.

- Mortgages and loans. Add Account now asks what kind of account you are adding
  first — cash, credit, or a mortgage, car loan or personal loan — and a loan is
  described the way the lender describes it: outstanding balance, interest rate,
  the instalment required, any escrow or fees, and the account it is debited
  from. Each loan gets a page showing the balance remaining, the rate, the
  instalment and the date it will be paid off, a chart of the balance falling to
  zero, the Plan category that funds it, and the payments recorded against it.
  Loans appear in their own group in the sidebar, their instalment lands in Cash
  Flow on the account actually debited, and the debt is counted once in your net
  worth — never twice, once as the balance and again as the schedule.

- Existing instalment contracts can now become a mortgage, car loan or personal
  loan without recreating their schedule or payment history, and can be changed
  back again. Add Account also offers a plain Cash account for physical money and
  cash-on-hand balances.

- Sorting and filtering the ledger for real. Every column now sorts across all
  your transactions rather than reordering the twenty rows already on screen —
  which is what sorting by amount used to do, without saying so. The five
  dropdowns and two date boxes are replaced by one field: type and it offers
  what it can make of what you typed — an account, a category, a payee, a date,
  an amount above or below a figure — and filters as soon as you pick one.
  Filters and sort live in the address bar, so a view survives a reload, the
  back button, and being sent to yourself. Sorting reads the most recent 5.000
  transactions; past that the table says so instead of quietly ordering a slice.

- Acting on several transactions at once. Selecting rows now raises a bar over
  the bottom of the ledger with the common actions in the open — category, tags,
  hide from reports — and the rest behind More: mark as expense, income, internal
  or transfer, unlink a transfer or a money box, delete manual movements. Actions
  that cannot apply to what you picked are shown disabled rather than hidden, the
  count is on the left with a way to clear it, and Escape clears the selection.
  The old bar that sat in the toolbar whether or not anything was selected is
  gone.

- Pairing a loan with a Plan category now means something: that category carries
  the loan, instead of a second row appearing in Instalments beside it and asking
  to be funded twice. The category keeps its name, its group, its target and the
  categories mapped to it, and gains the instalment's due date; the duplicate row
  is removed if nothing was assigned to it. Unpairing gives the category back
  exactly where it was. Loans left unpaired keep their own row, as before.

- A loan can now be given the payoff date its contract states, instead of one
  estimated from the rate and the instalment. Italian variable-rate mortgages
  keep the capital schedule fixed and move the instalment, so the estimate can
  land years early; with the date entered, the payoff, the curve and the
  instalments planned all follow the contract.

- A loan can now record what was originally borrowed, not just what is still
  owed. A mortgage entered part-way through its life used to read as if it had
  started at today's balance; give it the original principal and the page says
  how much has been repaid and what share of the loan that is. It is optional,
  and converting an instalment contract carries its principal over by itself.

- A savings goal that holds money outside your bank balance can now become a
  real account, in one step instead of by hand. Contributions made with a bank
  transaction turn into transfers to the new account, whatever was entered by
  hand becomes its opening balance, and the goal is removed along with every
  reference to it. A goal that only reminds you about money still sitting in an
  account cannot be converted, and says why: it would count that money twice.
  The confirmation states what is deleted, because it cannot be undone.

### Internal

- Dependencies updated to their latest Node 22-compatible versions and audit
  findings reduced from 24 to 15: the `undici`, `ws`, `sharp`/libvips and
  `@workos/authkit-session` advisories are resolved. The 15 remaining
  advisories are transitive with no upstream fix (notably `toml` via
  `remark-mdx-frontmatter`); major bumps with breaking peer ranges (`ai` 7,
  `@convex-dev/agent` 0.7, `react-table` 9, `vitest` 5, `typescript` 7) are
  held back. Nothing changes on screen.

- Planned expenses and planned transfers were two tables describing the same
  thing: a movement you expect. They are now one, `plannedTransactions`, with the
  kind spelled out. Nothing changes on screen; the names in the app stay as they
  were.

- Deploy environments are defined: staging on a gated `workers.dev` URL sharing
  the dev Convex backend, production on `trytracky.app` with its own Convex
  production deployment and WorkOS production environment. Nothing changes on
  screen; contributors copy `wrangler.jsonc.example` to a gitignored local
  `wrangler.jsonc`.

### Fixed

- Body text no longer falls back to a system font in production: Geist
  Variable is now self-hosted from two `/fonts/*.woff2` files (latin and
  latin-ext) instead of the fontsource package import, whose relative
  font URLs were emitted unresolved into the production bundle and
  returned 404 for every weight.

- The TanStack devtools panel no longer ships to production: it now loads
  through a `React.lazy` import gated on `import.meta.env.DEV`, so the
  production bundle never requests the devtools chunk. Nothing changes on
  screen in development.

- The AI Analyst section is now opt-in per environment: unless the frontend is
  built with `VITE_ANALYST_ENABLED=true`, its sidebar and command-palette
  entries stay hidden and `/app/analyst` shows a localized "feature disabled"
  page instead of the chat.

- New accounts now start with the default category set instead of an empty
  picker: categories are seeded when the profile is created, and existing
  accounts without any are repaired automatically at sign-in.

- Repository docs no longer contain real account data: execution plans and
  decisions now use synthetic example values instead of observed balances,
  product names, and statement amounts.

- Subscription names and dates are now validated: names are trimmed and
  limited to 80 characters, and due dates must be real `YYYY-MM-DD` dates.

- The bank-connection callback page can no longer be framed by another site,
  and all backend routes send `nosniff`. Nothing changes on screen.

- Telegram link codes are now drawn from the random bytes without modulo
  bias: each character maps through the low 5 bits of a byte onto the
  32-character alphabet, so every code is equally likely. Nothing changes
  on screen.

- A pending account-deletion request can now be cancelled from the Danger
  zone. The request never erased anything by itself; cancelling clears the
  pending status so a new request can be made later.

- Scenario icons and colors are now validated on save: icons are limited to 8
  characters and colors must be `#rrggbb` hex or a chart palette token.

- Reconnecting the bank twice in a row — a double redirect or a browser retry
  while the Enable Banking login completes — no longer risks failing the
  connection. Only the first callback now runs the login through; a concurrent
  one waits its turn or reuses the finished result instead of spending the
  single-use code and marking the completed login failed.

- Passing another user's category to subscription creation or conversion no
  longer attaches it. `createSubscription` and
  `convertTransactionToSubscription` now reject a foreign `categoryId` with
  "Category not found" instead of writing it onto the subscription and its
  transactions; the stored category already on a transaction is left as-is.

- Report CSV exports no longer emit spreadsheet formulas. Cells starting with
  `=`, `+`, `-`, `@`, tab or carriage return — reachable through
  bank-controlled payee and category names — are prefixed with an apostrophe
  so Excel and Sheets treat them as text on open.

- Linking the bank debit that pays a card instalment failed with "Impossibile
  collegare il pagamento rata". A repayment had to land on the account linked to
  the credit line, which for a card is the card itself — where a debit is a
  purchase, never a repayment — so the real current-account debit was refused
  while the card's own purchases were offered as candidates. Repayments are now
  accepted on the accounts that actually pay the facility: its settlement account,
  plus the linked account when that is a cash account, as with loans. The dialog
  lists only the plans repaid from the transaction's account, and says so when
  none is.

- Accounts with a nickname but no bank behind them — the ones a converted money
  box leaves, named "[Pocket] …" — were headed `undefined ([Pocket] Condominio)`
  in Cash Flow and listed that way in every planning and credit picker. Two
  functions named the same thing and only one of them coped with a missing
  institution; the duplicate is gone and every screen now asks the same one.

- Linking from the ledger a single debit that repays several instalment plans at
  once — a card line with three financed purchases billed together. The dialog
  listed the plans separately, and picking one booked the entire debit against
  it, wiping out a plan that owed a fraction of it and leaving the others unpaid.
  It now offers the facility once, showing the instalments the debit covers, and
  splits the amount across them through the same operation the Credit panel uses.
  When the instalments do not add up to the debit, it says so instead of letting
  the link be refused.

- Recurring planned income and expenses now show their next unpaid occurrence in
  the ledger's Scheduled transactions band, with a repeat marker and only the
  actions that belong to a planning rule. These previews do not become selectable
  transactions, alter totals or pagination, or replace the full recurrence list
  in Cash Flow.

- One-off transactions entered with a future date now appear in Cash Flow and
  count as commitments in Safe to spend. They used to remain visible only in
  the ledger, leaving projected balances too high.

- A loan's projection started from its stored next instalment even when that date
  had already passed, so the curve spent payments that had already been made: it
  showed a balance lower than the one owed and reached zero years early. It now
  starts at the next instalment still to come.

- The side panel used to scroll as one piece, so a form taller than the window
  ran underneath its own buttons and the last fields could not be reached. The
  form scrolls now and the buttons stay put.

- When Enable Banking is not configured on the instance, the Connect a bank
  button in Settings → Bank connections is now disabled with a note instead of
  opening a dialog full of raw server errors. Missing server configuration also
  no longer leaks environment variable names to the client.

- Transactions that the bank books a day or two late — common with some providers' card
  payments — were skipped and never appeared in the ledger. Sync now re-checks
  the past week every time, and an account whose sync hits an error retries by
  itself instead of going quiet.

- An instalment plan that starts on a date you chose ended a month late. The end
  date was computed from the plan's start and ignored the first payment date you
  had given it, so the plan's bucket lingered in the plan for one month after the
  last instalment. Plans that take the default first payment date are unaffected.

### Changed

- A transaction dated in the future is now recorded as scheduled instead of as
  money already spent. It shows the intent without moving the account balance and
  stays out of reports, spending breakdowns, transfer matching, subscription
  cadence and instalment repayments until its date arrives, at which point it is
  booked and the balance moves — once. Linked bank accounts accept scheduled
  transactions too, so an upcoming bill can be recorded on the account that will
  pay it; when the bank's own row arrives it can be reconciled against the
  scheduled one, which keeps the imported row and carries the category, memo and
  tags onto it.

- Scheduled transactions have their own band at the top of the ledger, above the
  booked rows and collapsible, sharing the ledger's columns and widths so the two
  read as one register. They are never counted among the booked rows, and each
  one offers to be reconciled against the transaction that finally arrived: a
  panel lists the booked rows on the same account that plausibly settled it, by
  how far apart they are in amount and in days.

- Adding a movement is now typed straight into the ledger. The dialog is replaced
  by an editable row at the top of the table, aligned to the same columns, with
  Outflow and Inflow as two mutually exclusive boxes, and a "Save and add
  another" that keeps the row open and holds on to the date and the account so a
  run of entries can be typed one after the other. A future date says it will be
  saved as scheduled; on a linked account, where only scheduled entries are
  accepted, the date field starts at tomorrow and says so rather than letting the
  save fail. The dialog stays for editing an existing movement.

- The transactions table reads like a ledger. Money out and money in have their
  own Outflow and Inflow columns instead of one signed figure, so a column tells
  you the direction and the number no longer has to. Payee moved out of the
  description cell into its own column, and a transfer names the other side of
  the move — where the money went when it left, where it came from when it
  arrived — with the transfer mark at the end of the cell. The memo you had
  stored was never shown; it has a column now. Columns can be dragged wider and
  keep their widths, separately for the shared ledger and for a single account's,
  and the column menu lists them by name instead of by internal id.

- Goals and Plan could open on an error card instead of their content. Both
  asked the server for data before the browser had finished signing in, and the
  refusal surfaced as a crash; they now wait for sign-in to settle, like the rest
  of the app already did.

- Opening any page could show a blank screen. Queries that require a signed-in
  user were being asked before the browser had a token, and the error surfaced
  during rendering: from the sidebar or the header that took the whole app down,
  and on the transactions page it replaced the table with an error card. Those
  queries now wait for sign-in to settle, and a failure in the sidebar can no
  longer blank anything but itself.

- The sidebar is organised instead of being a list of twelve equal links. The
  five things you open every day come first — Dashboard, Plan, Reports, All
  Accounts and Cash Flow — Forecast, Goals and Subscriptions moved into a
  collapsible Tools group, and Settings, Get Help, Search and Analyst dropped to
  the footer above your name. Below the navigation your accounts now appear
  grouped into Cash and Credit with a running total per group, and each one is a
  link: clicking an account opens its own ledger with only its transactions and
  without the redundant account column. Groups remember whether you left them
  open. A group mixing currencies shows no total, because amounts in different
  currencies are never added together. "Transactions" is now "All Accounts",
  "Future planning" is now "Cash Flow", and "Docs" is now "Get Help". Add Account
  and Bank Connections sit as buttons under the account list.

- The plan's month summary no longer has a residual. "Income and other inflows"
  was computed as whatever the model could not otherwise explain, so every
  attribution mistake disappeared into it and the panel still added up: on real
  data it read 6.855,01 against a salary of 3.625,00. Income is now summed
  directly from the inflows classified as income, and what is left over is a
  visible "Unexplained movement" line that should read zero. Money borrowed on a
  card has its own two lines — cash drawn from a card, and card credit spent —
  because they raise what can be assigned without being earnings. Overspending
  put on a card is told apart from overspending paid in cash on the row that
  caused it.

- Instalments and money boxes reach the plan. Five active repayment plans worth
  546,53 a month were invisible until the money had already gone, showing up
  only afterwards in the out-of-plan row; each now has its own bucket with the
  instalment due that month, and the repayment stops being reported twice. A
  money box can be linked to a bucket, so the amount already set aside counts as
  pre-funded instead of being offered again as assignable — it is applied from
  the current month onward, since the saved amount has no history, and it is not
  carried forward, which would have doubled it every month.

### Fixed

- An instalment plan on a card credit line was charged to the card in the
  planning view. The rule that a card settles from the current account it is
  paid from had only ever been applied to the statement, so a plan opened on a
  card linked to a CARD account put its monthly instalment on the card itself,
  pushing that balance negative while the same facility's statement was already
  projected on the right account. Instalments now follow the statement to the
  settlement account, or to the unattributed group when no settling account is
  configured. No amount changes, only where it is charged.

- A recurring loan direct debit could not be linked to its instalment plan. Bank
  SDD repayments are routinely detected as subscriptions, and the link refused
  every subscription-classified movement with "Only booked debit transactions can
  be linked to installment payments", leaving no way to record the payment. An
  explicit link now accepts them; automatic matching still ignores subscriptions,
  so a streaming charge is never proposed as an instalment.

- Spending on an account outside the plan was charged to a plan bucket. The
  eligibility test checked status, currency, matching and direction but never
  membership, while liquidity counted only the plan's own accounts, so the
  spending inflated both a category and the residual income by its full amount.

- A card's debt stayed unexplained in the summary. Cash advances vanished from
  every named line, card spending inflated income, a statement payment whose two
  legs booked in different months was read as money leaving the plan, and a
  payment on a card with no payment bucket came back as negative income. Which
  card counted as covered also depended on the order the accounts sheet posted.

- Removing a card from a plan destroyed its assignments. The reconciliation
  deleted the bucket and every assignment under it, irreversibly; it now detaches
  and keeps the history. Hidden accounts are excluded from a plan's perimeter,
  a hidden account that was already a member can be seen and removed again
  instead of contributing invisibly, and eligible accounts left outside every
  plan are surfaced rather than silently ignored. An account paused by the
  provider is reported, never quietly dropped from the perimeter.

- A card statement payment can be registered from its bucket. With no card-side
  entry to match, the payment stayed in the out-of-plan row: Tracky now creates
  the missing entry and confirms the transfer, closing the statement cycle.

- A fix to the plan's own logic never reached past months. Snapshots were only
  invalidated when a transaction changed, so historical months kept reporting
  pre-fix numbers; a migration rebuilds them. A single truncated month also used
  to stop the rebuild chain for every later month, and truncated results are now
  skipped rather than cached. Money box edits and re-pointing a credit facility
  invalidate the cache like every other change that moves the numbers.

- Credit cards follow YNAB's model in the plan. A card's debt used to be
  subtracted straight from Ready to Assign, so 1.200 owed on a statement due
  next month removed 1.200 from money that was sitting in the checking account
  and needed to cover this week's due dates. A card no longer counts as negative
  cash: each card in the plan gets its own payment bucket, in a "Card payments"
  group, and the debt appears there as an amount to fund rather than as a
  deduction. It stands from the current month onwards, since the statement is
  charged the month after the spending, and the row says on which day; what is
  already set aside carries forward, so funding it once settles the month of the
  charge too. Spending on a card from a funded bucket moves the covered part into
  that payment bucket, so the money stays earmarked; spending from an empty one
  is credit overspending and leaves Ready to Assign alone, because no cash left.
  Paying the statement is the payment bucket's activity, no longer counted as an
  out-of-plan transfer, which also stops the payment from showing up as income
  in the month's breakdown. Existing plans are backfilled.

### Added

- A plan's accounts can be changed after it was created, from the plan menu and
  from Edit plan. An account opened later could not be added at all, which left
  its balance permanently outside Ready to Assign. Changing the perimeter
  recomputes every month of the plan, since it feeds both liquidity and activity.

### Fixed

- Ready to Assign handed overspending back as money to assign. A bucket in the
  red has a negative available, and subtracting a negative added it to the
  total: with 1.000 in the account, nothing assigned and 100 spent, the plan
  offered 1.000 while the account held 900. Only what buckets actually hold is
  subtracted now, so overspending is charged to the month that caused it rather
  than to the next one, and the "Cash overspending" row of the breakdown reports
  the current month instead of the previous one.

- An arranged overdraft inflated balances across the whole app. One observed provider
  returns the accounting position and the spendable balance as two rows that
  share a fetch, a type and the name "Expected balance", differing only by the
  3.000 EUR overdraft line, and the app read the larger one as the account
  balance. Every consumer that needs spendable money adds the limit itself, so
  a 627,84 account showed 3.627,84 of cash and 6.627,84 of availability, and
  Ready to Assign, Safe to Spend, net worth, the balance chart, forecasting and
  the Analyst were each 3.000 too high. An account now has a single balance
  everywhere — the accounting position — and the overdraft is added once, where
  availability is meant to be shown. The accounts section shows the credit line
  beside the balance rather than folded into it.

- Future expenses never warned about an account going into the red as long as
  an overdraft could absorb it. The per-account alarm read availability while
  the aggregate projection read the balance, so an account closing the
  cycle at −1.604,69 reported "no negative date" beside its own red closing
  figure, and no row was flagged. Both now follow the accounting position, and
  the column reads "First negative balance". The overdraft is still reported,
  as the "Available after" hint on each row.

- Balances of manual accounts could be read out of order. Their snapshots are a
  synthetic ledger timestamped with the wall clock, so a settlement written in
  the same millisecond as the movement it settles shared a snapshot with it and
  the smaller amount won: a paid card statement kept reporting the debt as
  outstanding. The newest write is now the current balance.

- Forecasting, the Analyst and its proactive jobs read whichever balance row the
  index happened to return first, so their numbers changed between runs on
  accounts whose bank reports more than one balance. They now use the same
  selection as the rest of the app.

- Every page with a chart crashed in a production build with
  `TypeError: n is not a function`, while working normally under `vite dev`.
  Rolldown 1.0.3 gave a local declaration the same name as the CommonJS module
  factory it calls when bundling the es-toolkit modules Recharts depends on,
  emitting `var require_identity = require_identity()`. Fixed by moving to Vite
  8.1.5, which ships a Rolldown that deconflicts those names.

### Changed

- The two Analyst recovery cron jobs (proactive jobs and Telegram updates) now
  run every five minutes instead of every minute. They only reclaim expired
  leases — the normal path is scheduled directly when work arrives — but at one
  run per minute they were the deployment's largest consumer of database I/O,
  which had pushed the project over its plan limit.

### Added

- A transfer associated with a money box could never be deleted: the deletion
  refused to run while a money-box contribution pointed at it, and the only
  money-box action in the row menu was "Change money box", which moves the
  contribution to another box but never removes it. The menu now offers "Unlink
  money box" on any transfer that has one, which deletes the contribution and
  rolls the box's saved amount back, reopening a box that drops below its
  target. The deletion goes through afterwards.

- Matching an imported transaction against its counterpart on a manual account
  — an Apple Pay top-up on one wallet funded by a credit card, say — took two
  steps: create the opposite movement by hand, then match it. The transactions
  list now offers "Create matching transfer", which writes that leg and
  confirms the transfer match in a single mutation, with the same fee and
  card-statement settlement rules as a match made by hand.

- Confirmed transfer matches can finally be undone. "Unlink transfer" clears
  the match, re-derives each leg's classification from its category, reopens
  any card statement cycle the match had auto-settled, and makes a manual leg
  editable and deletable again — until now a wrong match was permanent, since
  both editing and deleting a matched manual movement are blocked.

- Tracky is now reachable from a browser without running it locally: the app is
  deployed as a Cloudflare Worker at `<your-worker>.<your-account>.workers.dev`,
  rebuilt and redeployed on every push to `main`. It stays a personal
  environment — the same Convex backend and WorkOS environment as local
  development — and Cloudflare Access requires an email sign-in before the app
  is served, so the URL is public but only its owner can reach it. See
  `docs/deployment.md`.

- A category can now use any of the 1,962 Lucide icons, searchable by name, with the previous set still offered first as suggestions. The suggested icons stay bundled so lists render instantly; the rest of the catalogue loads only when you open the picker or already use one, leaving the main bundle unchanged.

- A practical Plan walkthrough in the docs, in English and Italian: the order to use the controls in, why annual bills want the yearly cadence instead of dividing by twelve, and a Q&A covering overspending, carry-over, income and hidden categories.

- Plan now has focused views (underfunded, overspent, snoozed targets, money available, hidden) and an Edit Plan mode: reorder groups and categories by drag-and-drop or keyboard, rename, add, hide, and delete them, and apply move, hide, show, or delete to a multi-row selection. Hidden categories keep counting in the month totals and in Ready to Assign. The plan name in the header is now a switcher that changes, renames, and deletes plans; more than one plan requires Pro.

- Plan buckets now support weekly, monthly, yearly, and custom targets with set-aside, refill, balance-by, and monthly snooze behavior. The Plan shows target need and underfunded status, Cost to Be Me against expected income, and preview-before-confirmation Auto-Assign strategies for targets, history, and resets.

- Plan now shows negative card balances as money reserved for card payments, including the next scheduled charge date when known, so debt already excluded from Ready to Assign remains visible without entering category totals.

- Transaction metadata controls: create and manage colored tags, attach up to 10 tags and a 500-character private note to each transaction, hide movements from reports, apply tags or reporting visibility to up to 100 selected rows, filter Reports by tags (including saved-report round trips), and let categorization rules add tags or hide matching imports.

- Goals section (`/app/goals`) with savings-target cards, on-track/ahead/behind/completed status, contribution and withdrawal activity, growth and spending settings, per-currency debt payoff projections, expandable payoff charts, and an interactive avalanche/snowball/planned-order calculator for extra monthly payments, lump sums, debt-free dates, and interest saved.

- Pro forecasting page (`/app/forecast`) with guided multi-income onboarding, expense baseline overrides, a reactive net-worth projection, all nine life-event editors and chart markers, invalid-event diagnostics, multiple named/icon/color scenarios with duplicate/fresh/reorder/delete controls, exactly-two scenario comparison with URL-persisted selection and signed deltas, per-account assumptions, year-by-year account/cash-flow/event views, today's-euros or future-euros values, and a confirmed reset-to-onboarding action.

- Reports section (`/app/reports`) with cash-flow, spending, and income views; per-currency summaries; Sankey, breakdown, and trend charts; account, category, date, and amount filters; transaction drill-down; reusable saved reports; aggregated CSV export; and an Analyst read tool for the same reporting data.

- CSV import for manual accounts: a new Import page (reachable from the
  Accounts and Transactions pages) parses bank CSV exports entirely in the
  browser, guides column mapping (signed or debit/credit amount columns, four
  date formats, decimal comma or point), previews rows with duplicate and error
  badges, and imports in batches with automatic category-rule assignment.
  Re-importing the same file is idempotent thanks to per-row dedupe keys.

- Settings page (`/app/settings`): profile overview, current plan with
  tier limits, notification preferences (bill-reminder lead days and email/
  Telegram delivery opt-in), Telegram linking, Analyst memory management
  (list and delete stored facts/preferences/goals), full data export as JSON
  (all financial data, one export per day, download links valid 7 days), and
  an account-deletion request flow.

- Manual asset accounts: savings (SVGS), investment (INVS), and other-asset
  (ASST) accounts can now be created manually and updated with balance
  snapshots ("Update balance" in a dedicated Assets section of the Accounts
  page). Asset balances appear in net worth as their own bucket (net worth =
  cash + assets − debts, shown in the KPI breakdown), never count as spendable
  cash in projections or safe-to-spend, and seed the invested starting point of
  the Analyst's long-term FIRE projections. Savings accounts keep counting as
  cash.

- Free and Pro plan scaffolding: accounts default to the free tier. The
  Analyst's daily message allowance is now tier-aware (20/day free, 100/day
  pro; burst limit unchanged) across web chat and Telegram, and the long-term
  FIRE projection tool is a Pro feature (free users get an upgrade notice
  instead). Core features — CSV import, safe-to-spend, reminders, money
  boxes — remain unlimited on the free tier. There is no billing integration
  yet; tiers are switched internally.

- Bill due-date reminders: planned expenses now raise "bill due soon"
  notifications ahead of their due date, with configurable lead days (up to 4,
  0–30 days, default 3) and support for recurring bills; paid occurrences are
  skipped and reminders are deduplicated per occurrence. Reminder-class
  notifications (bill reminders, upcoming payments, low projected balance) can
  optionally be delivered by email and Telegram — both off by default until the
  user opts in.

- FIRE and long-term wealth projections in the Analyst: a new
  `longTermProjection` tool simulates up to 50 years month by month (income
  growth, expense inflation, investment returns, liquidity buffer, safe
  withdrawal rate, one-off events, optional retirement date), seeded from the
  user's real balances and upcoming cash flows, and reports yearly checkpoints
  with the projected FIRE date. A dedicated FIRE skill guides assumptions,
  nominal-vs-real framing, and sensitivity checks.

- Safe-to-spend on the dashboard: a new first KPI card shows, per currency,
  what is spendable until the end of the current planning cycle after committed
  bills, installments, card statements, and money-box funding, with a per-day
  pace and a breakdown sheet listing the top upcoming commitments. The Analyst
  can read the same figure via a new `getSafeToSpend` tool.

### Fixed

- Opening the Accounts page no longer merges manual accounts into each other. The duplicate repair that runs there groups accounts by their provider identity, and manual accounts have none, so it read them all as copies of one account: it overwrote the oldest with the name and type of the most recently created one and paused the rest. A manual card turned into a savings account this way lost the link to its credit line, which then showed an empty statement and a fully available limit even though its transactions were untouched. Manual accounts are now excluded from the repair, and any account without a provider identifier is only ever compared with itself.

- A bucket with a saved target now shows its cadence and behaviour the first time you open it. The two dropdowns rendered blank until you selected another bucket and came back, because the panel started from the defaults and filled itself in afterwards. Editing a target is also no longer interrupted when plan data refreshes mid-typing.

- Linking a transaction to an instalment plan now asks which instalment it settles, defaulting to the one due closest to the transaction date instead of always the next one. Instalments already linked to another transaction are shown as unavailable, the dialog says whether the chosen one is already recorded (in which case only the link is added and the remaining count, outstanding balance and next due date stay put), and it warns when the due date is more than 15 days from the transaction. Back-dating a payment no longer silently settles a future month.

- An internal movement can be marked as spending again. The action used to appear only for uncategorized rows, so classifying something internal was a one-way door.

- External financing instalments now remain category spending in the Plan, while card-backed instalments and statement settlements stay internal to avoid counting the original card purchase twice.

- Plan liquidity now comes directly from the latest preferred balances of its accounts, with positive CARD balances clamped to zero. Past months walk backwards from that observed total through at most 12 months of booked movements, so unlinked card-statement payments no longer reduce current Ready to Assign; the opening-carry model has been removed.

- Plan now explains money leaving its account perimeter through financing instalments and transfers to excluded accounts, without treating either as category spending or available money. Ready to Assign shows separate income, financing, and transfer components; plan creation reports excluded account selections; and the Plan header lists the accounts defining its liquidity perimeter. Negative Ready to Assign and negative bucket balances also distinguish over-assignment, insufficient plan liquidity, overspending, and never-funded spending with actionable labels.

- Budget activity now counts only booked, non-transfer transactions and nets refunds against spending. Budget alerts use the same policy and no longer include the following month; dashboard totals avoid overall/category double counting and load up to 100 budgets; manual category choices stay user-owned; and category spending keeps separate entries per currency.

- Forecast projections now support overdrawn current accounts, repaying the
  negative balance before allocating future monthly savings instead of failing
  to load the Forecast page.

- Incoming (credit) unmatched transfers can now be associated with a money
  box as their source: the "Associate money box" action is available on both
  transfer directions, and a credit association records a withdrawal that
  decreases the box's saved amount (rejected when it would exceed the saved
  funds). Previously only outgoing transfers could be linked, so a transfer
  from a money box stayed stuck on "Unknown source".

- The Analyst model picker in the chat composer opens reliably again: the
  dropdown now opens upward above the prompt input instead of failing to open
  inside the composer form.

### Changed

- Budget has been removed and replaced by the zero-based Plan. Existing category budgets were converted automatically into Plan assignments, while Ready to Assign, Assigned, Activity, Available, targets, Auto-Assign, focused views, and multiple plans now provide the spending-allocation workflow.

- Credit cards can now be modeled as first-class manual CARD accounts: create a
  manual account from the Accounts page and enter its movements by hand from the
  Transactions page (with edit/delete for manual rows). Card purchases become
  categorized expenses at purchase date, Apple Pay top-ups and monthly statement
  settlements auto-match as transfers against the imported legs, and a card
  credit line linked to a CARD account derives its usage from the card balance
  (manual usage input disabled). Statement cycles close against the derived
  amount without resetting it, settle automatically when the matching transfer
  is confirmed, and their planning outflow is routed to the facility's new
  settlement account. Net worth counts card debt exactly once: CARD account
  balances never count as cash, their negative balance is the debt, and
  scheduled cycles of CARD-linked facilities are excluded from the debt sum.

- Card statement settlements can now be linked to their scheduled usage cycle:
  the Credit page suggests the matching booked debit near the statement due
  date ("Confirm charge"), marking the cycle paid and reclassifying the
  transaction as internal so it stops counting as spending. A new "Mark as
  internal (liability payment)" row action in the transactions table covers
  manual cases such as credit-card statement debits without a tracked cycle.

- Assigning a category from the transactions table now keeps the transaction's
  classification in sync with the category's kind: picking a transfer-kind
  category (Top-Up, Unknown, MoneyBox) reclassifies the row as a transfer so it
  stops counting as income/expense in budgets, balance, and planning; income and
  expense categories behave symmetrically, and marking a row as
  income/expense/transfer now drops a leftover category of an incompatible kind.

- Proactive spending-anomaly workers now project detector output to the exact
  persistence contract and record safe read-versus-persist failure codes, so
  strict Convex validation no longer turns valid detections into opaque retries.

- Authenticated profile bootstrap now repairs Tracky profile data from the
  server-side WorkOS AuthKit component and preserves trusted email fields during
  webhook/backfill lag, so verified users remain eligible for monthly reports.

- Analyst read tools now discard empty optional account/category IDs before
  Convex validation, and serialized backend failures render as errors instead
  of successful tool cards without exposing their internal details.

- Analyst approval continuations now wait for every decision in a multi-write
  step and make denied, non-executed changes explicit to the model before it
  summarizes results.

- Analyst Phase 3 adds a durable two-way Telegram Bot API channel with one-time linking, user-scoped vector memories with approval-gated capture, ask-before-you-buy guidance, deterministic money-box optimization, and atomic approval-gated bulk recategorization. The obsolete application-owned Analyst conversation, message, and audit tables have been cleared and removed.

- Analyst 2.0 now runs bounded proactive automation: currency-scoped daily health scores and spending anomalies, monthly subscription reviews, persisted read-only Agent reports, deterministic debt payoff comparisons, inbox notifications, and optional plain-text report email through the Resend Convex component.
- Analyst 2.0 now uses Convex-native persisted threads and resumable streaming, exposes real financial read tools, renders structured charts/tables/sources, supports an allowlisted model selector, and requires explicit in-chat approval before creating budgets, money boxes, or planned items.
- Money boxes now have dedicated create/edit and contribution dialogs, optional account associations, expense-based creation, redesigned savings-target cards, and informational monthly accrual actions in account cashflow tables without affecting projections or totals.
- Planning now presents account cashflow as bank statements with split Out/In columns, displays money boxes in a responsive card grid, and summarizes credit commitments once per facility with expandable plan details.
- Planned transfers can now originate from active card credit lines, flow into projected card statements, be created from account cashflow dialogs, edited inline, and hard-deleted while still planned; Planning repayment and expense panels also use denser table-oriented layouts.
- Full frontend redesign of the authenticated `/app` area ("Ledger ink"): near-monochrome ink UI on warm-paper light / graphite dark surfaces, with color reserved for financial meaning (green inflows via a new `--positive` token, destructive red for negative/over-budget, validated 5-hue categorical chart palette replacing the all-green ramp).
- Dashboard is now a summary overview: KPI stat row (total cash, projected balance, budget health, upcoming payments), the four charts, and compact recent-transactions / upcoming-payments cards linking into their sections — instead of stacking every full section panel.
- Unified page anatomy: shared `AppPage` header/layout across all sections, section title in the site header, tabular numerals for all monetary values via a shared `Amount` component.
- Sidebar cleanup: removed leftover template scaffolding (Documents group, inbox button, "coming soon" menus); nav items are real router links with active-state highlighting and per-section icons.
- New ⌘K command palette: section navigation, quick actions, theme, and language switching.
- Transactions: row click opens a detail sheet (drawer on mobile) replacing expandable rows; the table renders as a card list on small screens.
- Budgets: creation forms (category, budget, rule) moved into dialogs; budget progress is the page's primary content.
- Subscriptions: edit moved to a responsive detail sheet; summary rendered as stat cards.
- Planning cashflow future cycles now start from the prior cycle's projected ending balance instead of the latest bank snapshot.
- Planning now supports planned income, recurring income suggestions, and non-destructive suppression of planned items already booked as real transactions.
- Analyst: chat restyled with message bubbles; errors surface as toasts like the rest of the app.
- Consistent loading skeletons (no layout shift), empty states with directive actions, and pending spinners on all mutation buttons.

### Internal

- Panel monoliths decomposed into container + presentational components (`transactions/`, `accounts/`, `credit/`, `budgets/`, `subscriptions/`, `analyst/`, split `planning/cashflow-section`, per-chart files).
- New shared primitives in `src/components/app/` (StatCard, Amount, ChartCard, EmptyState, skeletons, DetailSheet, TruncatedText, CommandMenu, AppPage) and shared helpers (`lib/format.ts`, `lib/accounts.ts` single `accountLabel`, `budgetProgressPercent`, `usePendingAction` hook replacing ~50 copy-pasted toast/pending blocks).
