# Decision 0001: MVP Assumptions

Status: active, revisable.

These assumptions incorporate the first grill-me answers and should be revised
through later decision records when product scope changes.

## Assumptions

- Tracky is a personalized personal finance app exposed on the public web.
  It is multi-user at the auth/data-isolation layer, but each signed-in user
  currently has one app account. WorkOS Organizations and multi-tenant sharing
  are deferred until shared/family/company budgeting is explicitly needed.
- Tracky keeps an app-owned `userProfiles` table synced from WorkOS AuthKit
  user lifecycle webhooks. User deletion is soft-deleted in Tracky so banking
  data ownership and audit history remain intact unless a separate data-erasure
  flow is designed.
- UI i18n targets English and Italian. Default UI language is English; default
  currency is `EUR`. Backend money values always store provider currency codes
  next to integer minor units. USD is supported at the data/UI level without
  exchange-rate conversion in the MVP. The first frontend i18n layer covers the
  public entry point, app navigation, and banking product panels; template-only
  surfaces, toasts, and future settings/help pages can be completed as follow-up
  coverage.
- Enable Banking is the only provider implemented in the MVP, behind a provider
  boundary.
- Enable Banking credentials live in Convex environment variables. The private
  key is stored as an escaped PEM string or base64-encoded PEM and must match
  the certificate registered for the configured Enable Banking app id. The MVP
  currently uses the restricted production app
  `<your-enable-banking-app-id>` (each user registers their own Enable Banking application).
- Bank selection uses Enable Banking `GET /aspsps` from a Convex action before
  starting consent with `POST /auth`; ASPSP metadata is normalized before it is
  sent to the UI.
- Cron import uses a conservative six-hour cadence per account connection.
- Initial/backfill sync should use the maximum provider- and consent-safe range
  available for the linked ASPSP. Sync must respect Enable Banking continuation
  keys and ASPSP rate limits.
- Import stores normalized transactions plus compact provider metadata. Full
  raw payload retention is not required for MVP.
- Transactions with status `BOOK` are the first source of truth. `PDNG` and
  `SCHD` are modeled so future/upcoming UI can include them when available.
- Money values are integer minor units.
- Transfer matching starts with same user, opposite directions, compatible
  currency, nearby dates, and configurable fee tolerance.
- High-confidence system transfer detection can auto-confirm exact or near-exact
  matches; lower-confidence matches persist as user-review candidates.
- Transfers are excluded from spend and budget progress.
- Subscription detection may classify high-confidence imported debits, while
  the user can still convert or correct transactions manually. Subscriptions can
  have fixed or variable amounts.
- The initial category taxonomy follows standard expense/income categories and
  users can create additional categories manually.
- Money boxes are virtual planning envelopes in the MVP, not real bank pockets.
- Money box contributions are tracked virtually inside the app and may be linked
  to transactions later if provider data exposes real pockets/vaults.
- Planning suggestions are conservative and user-approved: the MVP suggests
  sizeable quarterly, semiannual, or annual debit patterns and creates a money
  box only after explicit acceptance.
- Credit capacity is modeled separately from bank cash balances. Account
  overdrafts, card credit lines, additional card credit lines, installment
  credit, and other facilities are tracked as liabilities/capacity, not as cash.
- Installment repayments can include interest or fees; only the principal
  component reduces outstanding credit usage.
- Manual user overrides always take precedence over import or detection.
- A mock/demo provider can be useful for agentic development and tests, but it
  should not be exposed as a user-facing MVP requirement unless needed for
  onboarding or demos.
- The conversational AI analyst is read-only in the MVP. It can call OpenAI
  only from a Convex action using a bounded user-scoped snapshot, and it falls
  back to deterministic local analysis when `OPENAI_API_KEY` is not configured.
  Successful analyst exchanges are persisted for user-visible continuity and
  audit metadata. Write/actions require explicit user confirmation and separate
  permission design.

## Open Questions

- Which banks and cards are mandatory for first validation.
- Whether planned expenses should trigger notifications or reminders.
- Whether full provider raw payloads are needed for audit/debug.
- Whether real bank pockets/vaults are exposed through providers and can be
  linked to virtual money boxes without breaking balance calculations.
- How much of the AI assistant belongs in MVP versus a follow-up phase.
