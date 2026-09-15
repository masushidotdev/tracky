# PMF Gap Analysis → Implementation Roadmap

Status: implemented — all features F1–F7 landed, user-docs and changelog complete; not yet committed
Owner: coding agents (Codex implementation, Claude review/verification)
Last updated: 2026-07-16

## Context

Il report PMF (`docs/pfm-report.md`, `docs/pfm-report-full.md`) raccomanda: free tier utile (cash-flow "after-bills", reminder bollette, obiettivi, import CSV, no bank-linking obbligatorio), tier Pro con AI planning di lungo periodo (FIRE), e opzione privacy-first. La mappatura del repo (3 agenti Explore + 1 Plan, verificata su codice) mostra che il core banking/planning è maturo, mentre mancano esattamente le leve del report: CSV import, safe-to-spend, delivery dei reminder, scenari long-term, entitlements freemium, superficie privacy. Questo piano colma quei gap riusando i moduli esistenti, senza riscritture.

## Sintesi app attuale vs report (gap analysis)

- **Maturi** (non toccare, solo riuso): planning cash-flow ciclico (`convex/banking/planning.ts` — `getPlanningCashflowViewForUser`, `firstNegativeDate`, `monthlyFundingTotals`), money boxes (`moneyBoxes` + `buildMoneyBoxFundingPlan` in `planningMath.ts`), subscription detection (`convex/banking/subscriptionDetection.ts`), credit facilities/rate/statement (`convex/banking/credit.ts`, `cardStatementSettlement.ts`, `overdraft.ts`), Analyst con what-if ≤12 mesi e debt payoff (`convex/analyst/whatIfCore.ts`, `tools/debtPayoff.ts`), conti/transazioni manuali (`convex/banking/manualAccounts.ts`, `manualTransactions.ts` — bank linking già opzionale).
- **implemented_rough**: net worth = cash − debiti per valuta senza asset/investimenti (`convex/banking/dashboard.ts:83-167`); notifiche batch 6h solo inbox web, senza reminder plannedExpenses né delivery email/Telegram (`convex/notifications.ts` — email/Telegram esistono solo per l'Analyst); debt payoff solo come tool Analyst, nessuna UI dedicata (non prioritizzato: il tool copre il caso d'uso).
- **missing** (verificato: zero occorrenze nel repo): CSV/file import; safe-to-spend/"after-bills"; scenari FIRE/long-term (what-if cap 12 mesi); billing/entitlements/tier (`userProfiles` senza campo plan, rate limit globali in `convex/analyst/rateLimits.ts`); settings page, data export, gestione memorie Analyst, deletion request.
- Priorità (impatto utente × allineamento report): **F1 CSV import → F2 safe-to-spend → F3 reminder upgrade → F4 FIRE engine → F5 entitlements → F6 privacy/settings → F7 asset accounts**.
- Modello free/pro: free mantiene CSV import, safe-to-spend, reminder (incl. email), money boxes; pro gate su `analyst.longTermProjection` + limite messaggi Analyst più alto. **Nessuna integrazione Stripe in questo piano** — solo scaffolding entitlements con seam (`setUserPlanTier` internalMutation) per il futuro webhook billing. (Assunzione: se si vuole Stripe subito, è un piano separato.)

### Classificazione capability report → codice

| Capability (report) | Status | Evidenza |
|---|---|---|
| Vista integrata conti + net worth | implemented_rough | `convex/banking/dashboard.ts` (netWorth per-currency, no asset/investimenti), `src/components/banking/dashboard/kpi-row.tsx` |
| Safe-to-spend / after-bills | missing | nessuna occorrenza `safeToSpend`/`afterBills`; base = `getPlanningCashflowViewForUser` |
| Obiettivi risparmio (emergency fund) | implemented_mature | `moneyBoxes`/`moneyBoxContributions`, `planningMath.ts:buildMoneyBoxFundingPlan`, `analyst/moneyBoxOptimizerCore.ts` |
| Debt payoff planning | implemented_mature (tool-only) | `convex/analyst/tools/debtPayoff.ts` (avalanche/snowball, ≤600 mesi), credit facilities complete |
| Subscription discovery | implemented_mature | `convex/banking/subscriptionDetection.ts`, `convex/subscriptions.ts` |
| Bill reminders | implemented_rough | `convex/notifications.ts` (cron 6h, no plannedExpense reminders, no email/Telegram delivery) |
| Import CSV / workflow manuali | missing (CSV) / mature (manuale) | `manualAccounts.ts`/`manualTransactions.ts` esistono; zero CSV/upload/papaparse |
| Scenari FIRE / long-term AI | missing | `whatIfCore.ts` horizon max 12 mesi, no growth/inflazione/ritorni |
| Freemium / entitlements | missing | zero stripe/billing/entitlement/tier; solo rate limit globali `analyst/rateLimits.ts` |
| Privacy / trasparenza dati | missing | nessuna route settings, no export, no delete UI, `agentMemories` senza UI |

## Vincoli trasversali (vincolanti per ogni task)

- Leggere `convex/_generated/ai/guidelines.md` prima di scrivere codice Convex. Regole chiave: validators su tutte le funzioni (anche internal); `internal*` per logica sensibile; solo `.withIndex()` + `.take()`/`.paginate()`, mai `.filter()` su db query né `.collect()` unbounded; niente `ctx.db` nelle action; `'use node'` solo in file action-only; cron solo `crons.interval`/`crons.cron`; test con `convex-test` + vitest edge-runtime + `import.meta.glob`.
- Non rompere `convex/architecture-invariants.test.ts`: ogni funzione pubblica chiama `requireAuthUser` (vive in **`convex/auth.ts`**); mai `userId` come arg di funzioni pubbliche (le internal usano `userId: v.string()`); frontend mai riferimenti a endpoint/segreti provider.
- Denaro solo `moneyAmountValidator` (`convex/lib/validators.ts`) = `{ amountMinor: v.int64(), currency }`, helper in `convex/lib/money.ts`; per-currency, **no FX**.
- Schema additive-first (campi optional, tabelle nuove, union allargate); nomi indici `by_field1_and_field2`.
- i18n EN/IT per ogni stringa UI (`src/lib/i18n.tsx`); componenti in `src/components/banking/<domain>/` o `src/components/app/`; pagine con `AppPage` + `PanelErrorBoundary`.
- Per ogni feature: creare `docs/execution-plans/<nome>.md` (formato repo: `Status:`/Goal/Assumptions/Phases/Current Verification Evidence — template: `docs/execution-plans/dashboard-redesign.md`) e aggiornare changelog/user-docs (`src/content/user-docs/{en,it}/`) per i cambi user-visible.

### Decisione condivisa: tabella `userSettings` (usata da F3, F5, F6)

Un doc per utente, sezioni tutte optional (assenza = default, zero migrazione):

```ts
// convex/schema.ts
userSettings: defineTable({
  userId: v.string(),
  planTier: v.optional(v.union(v.literal('free'), v.literal('pro'))), // assente => 'free'
  planUpdatedAtMs: v.optional(v.number()),
  notifications: v.optional(v.object({
    billReminderLeadDays: v.array(v.number()), // es. [1,3]; vuoto = off
    emailEnabled: v.boolean(),
    telegramEnabled: v.boolean(),
  })),
  deletionRequestedAtMs: v.optional(v.number()),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
}).index('by_userId', ['userId'])
```

Modulo `convex/userSettings.ts`: `getMySettings` (public query, default se doc assente), `updateNotificationPreferences` (public mutation; lead days int 0–30, max 4), `getUserSettingsForUser` (internalQuery `{userId}`), `requestAccountDeletion` (public, F6), `setUserPlanTier` (internalMutation, seam billing F5). Creata in **F3-T1**.

---

## F1 — Import CSV/spreadsheet (missing; free core, privacy-first)

**Goal**: importare transazioni da CSV bancari in conti manuali con column mapping, preview, dedupe e auto-categorizzazione. Report: import CSV è pilastro del free tier e del segmento privacy-first/spreadsheet.

**Decisioni**: parsing **client-side** con `papaparse` (nuova dep + `@types/papaparse`) — il file non lascia il browser (privacy-first, niente `ctx.storage`, niente node action); mutation batch da **100 righe**; dedupeKey deterministico client-side `csv|<sha256(bookingDate|direction|amountMinor|currency|normalizedDescription)>` verificato server-side sull'indice esistente `transactions.by_accountId_and_dedupeKey` (re-import idempotente); categorie: `categoryId` esplicito → `categoryRules` (riuso `convex/banking/categoryRuleCore.ts`) → fallback direzione; un solo `applyManualBalanceDelta` aggregato per batch; riconciliazione planned-expenses e transfer candidates per riga inserita (come `createManualTransaction`). Nessuna tabella nuova (`importJobs` è provider-sync: non toccarlo).

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F1-T1 | Esportare helper privati riusabili: `resolveManualClassification`, `getOwnedManualAccount`, `balanceEffectMinor`, `assertBookingDate` | mod `convex/banking/manualTransactions.ts` | export aggiunti; test esistenti verdi | — |
| F1-T2 | Backend: `findExistingDedupeKeys` (public query `{accountId, dedupeKeys[]}` cap 500, ownership check, lookup su `by_accountId_and_dedupeKey`) + `importManualTransactionsBatch` (public mutation, rows[] con direction/amount(moneyAmountValidator)/bookingDate ISO/description/counterpartyName?/categoryId?/dedupeKey `csv|`-prefixed; >100 righe → throw; valuta = valuta conto; skip duplicati pre-esistenti e intra-batch; insert con `provider:'manual'`, `classificationSource` `'user'` se categoryId esplicito altrimenti `'system'`; return `{imported, skippedDuplicates, failed:[{index,reason}]}`) | new `convex/banking/csvImport.ts` | comportamento come da spec; `requireAuthUser`; delta saldo aggregato unico; riconciliazione + transfer candidate per riga | F1-T1 |
| F1-T3 | Lib parsing client pura: `parseCsv` (papaparse), `parseAmount` (virgola/punto decimale → minor units bigint), `parseDate` (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY), colonne amount singola signed o debit/credit separate, `computeDedupeKey` (Web Crypto sha256) | new `src/lib/csv/parse.ts`; mod `package.json` (papaparse) | funzioni pure; `"1.234,56"` → `123456n`; dedupeKey deterministico | — |
| F1-T4 | Wizard UI: upload → mapping colonne → preview (badge valido/duplicato/errore; `findExistingDedupeKeys` a chunk ≤500) → import batched con progress → summary. Target: solo conti manuali (link a `manual-account-dialog.tsx` per crearne uno). Entry: bottone su Accounts e toolbar Transactions | new `src/routes/_authenticated/_app/app/import.tsx`, `src/components/banking/import/{csv-import-wizard,upload-step,column-mapping-step,preview-step,import-progress-step}.tsx`; mod `src/lib/i18n.tsx` (chiavi `import.*` EN/IT), `src/components/banking/accounts/accounts-view.tsx`, toolbar transactions | flusso completo funzionante; righe invalide escluse con motivo; duplicati flaggati e skippati | F1-T2, F1-T3 |

**Testing**: new `convex/csv-import.test.ts` (convex-test: insert + 1 snapshot delta; dedupe pre-esistente e intra-batch; currency mismatch → failed row; categoryId esplicito batte rules; rules auto-assign; conto non-manuale/altrui rifiutato; 101 righe rifiutate; `findExistingDedupeKeys` corretto); new `convex/csv-parse.test.ts` (pattern di `client-money.test.ts` per testare `src/lib`): amount/date parsing, modalità debit/credit, dedupeKey.

---

## F2 — Safe-to-spend / "after-bills" (missing; numero headline stile PocketGuard)

**Goal**: numero per-valuta sul dashboard: quanto è spendibile fino a fine ciclo di planning, al netto di bollette/rate/funding money box. Report: capability #1 per il segmento mainstream.

**Decisioni**: riuso totale del planning engine — nessun nuovo calcolo di proiezione. Formula per valuta, ciclo corrente, da output di `getPlanningCashflowViewForUser` (cycleOffset 0): `availableCash` (saldi preferred conti spendibili non-CARD) − `committedOutflows` (item `projectionStatus==='projected'` outflow senza `occurrencePayment`: planned expenses, subscriptions, rate, settlement cicli carta) − `moneyBoxFunding` (`monthlyFundingTotals`) = **`safeToSpend`** (headline conservativa); `safeToSpendWithIncome = safeToSpend + expectedIncome` (secondaria nel breakdown); più `daysRemaining` fino a `cycleEndDate` e `perDay = max(safeToSpend,0)/daysRemaining`.

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F2-T1 | Core puro `computeSafeToSpend(view) → SafeToSpendBreakdown[]` (input strutturale = output planning view; solo bigint via `convex/lib/money.ts`) | new `convex/banking/safeToSpendCore.ts` | multi-currency; risultati negativi ok; view vuota; occorrenze pagate escluse | — |
| F2-T2 | Query: `getSafeToSpendForUser` (internalQuery `{userId, asOfDate?}` → chiama planning view interna → core) + `getSafeToSpend` (public query `{}`, `requireAuthUser`). Return per valuta: `{currency, availableCash, committedOutflows, moneyBoxFunding, expectedIncome, safeToSpend, safeToSpendWithIncome, cycleStartDate, cycleEndDate, daysRemaining, perDay, topUpcoming[≤5]}` (money come moneyAmountValidator) | new `convex/banking/safeToSpend.ts` | shape completa; auth; internal riusabile da Analyst e F3 | F2-T1 |
| F2-T3 | Tool Analyst read-only `getSafeToSpend`: ref `safeToSpendForUser` in functionRefs, tool in read.ts, registrato in `analystTools` **e** `analystProactiveTools`; output in major units via `moneyToMajor` | mod `convex/analyst/tools/read.ts`, `convex/analyst/functionRefs.ts`, `convex/analyst/tools/index.ts` | tool invocabile in entrambi i toolset | F2-T2 |
| F2-T4 | UI: nuova prima StatCard in `kpi-row.tsx` (headline valuta primaria, sottotitolo "fino al <cycleEndDate> · ~X/giorno") che apre `safe-to-spend-sheet.tsx` (DetailSheet con breakdown additivo cash − bills − funding, riga income opzionale, top 5 upcoming); wire query in dashboard-view; skeleton; chiavi `dashboard.safeToSpend.*` EN/IT | new `src/components/banking/dashboard/safe-to-spend-sheet.tsx`; mod `kpi-row.tsx`, `dashboard-view.tsx`, `src/lib/i18n.tsx` | card per-valuta + sheet breakdown funzionanti | F2-T2 |

**Testing**: new `convex/safe-to-spend.test.ts` — core puro (solo cash → safeToSpend=cash; bolletta committed sottrae; funding money box sottrae; inflow tocca solo `safeToSpendWithIncome`; seconda valuta isolata; negativo → perDay=0) + end-to-end convex-test (seed conto manuale + saldo + planned expense nel ciclo → minor units attesi; unauthenticated rifiutato). Estendere test tool boundary (`phase3-tool-boundary.test.ts` pattern) per il nuovo ref.

---

## F3 — Bill reminders & delivery notifiche (implemented_rough → completo)

**Goal**: reminder sulle scadenze dei plannedExpenses con lead days configurabili e delivery email/Telegram opzionale. Report: "bill and due-date reminders" nel free core.

**Decisioni**: si **mantiene il cron 6h** (`evaluateNotifications`) — dedupe per occorrenza+leadDay rende idempotente; niente scheduling per-scadenza (complessità non giustificata, staleness ≤6h ok). Nuovo tipo `billReminder` (union additiva in `notificationTypeValidator`, `convex/lib/validators.ts`). Le notifiche restano source of truth; delivery post-insert solo per `DELIVERABLE_TYPES = ['billReminder','upcomingPayment','lowProjectedBalance']`. Email riusa l'istanza `resend` esportata da `convex/analyst/emails.ts`; Telegram riusa il bot esistente via piccola internalAction accanto al fetch in `convex/analyst/telegramActions.ts`. Default: email/telegram **off** (opt-in), in-app sempre on → zero cambi per utenti esistenti. Rendering testi server-side (le notifiche salvano solo i18n key): mappa template EN/IT minimale, locale da `userProfiles.locale`.

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F3-T1 | Tabella `userSettings` + modulo (sketch sopra, fondazione condivisa F5/F6) | mod `convex/schema.ts`; new `convex/userSettings.ts` | `getMySettings` default se assente; `updateNotificationPreferences` valida lead days (int 0–30, ≤4); `getUserSettingsForUser` internal | — |
| F3-T2 | Candidati `billReminder` in `collectCandidatesForUser`: lead days da userSettings (default `[3]`); query `plannedExpenses.by_userId_and_status_and_dueDate` status planned/funding in `[oggi, oggi+maxLead]`; ricorrenti col next-occurrence helper esistente di `planningMath.ts` (riuso, non duplicare); skip occorrenze pagate (`plannedExpenseOccurrencePayments.by_plannedExpenseId_and_dueDate`); emit quando `daysUntilDue <= leadDay`, vince il bucket più piccolo del run; `dedupeKey = billReminder:<plannedExpenseId>:<dueDate>:<leadDay>`; params `{name, date, amount, currency}`, severity info. Aggiungere source plannedExpenses a `listNotificationUserIds` | mod `convex/lib/validators.ts`, `convex/notifications.ts` | emissione ai boundary corretti; no doppioni tra run; pagate soppresse; ricorrenze ok | F3-T1 |
| F3-T3 | Pipeline delivery: widen `notifications` con `emailDeliveredAtMs?`/`telegramDeliveredAtMs?`; `upsertCandidates` ritorna `insertedIds`; `evaluateNotifications` schedula `internal.notificationDelivery.deliverNotifications({notificationIds})` solo per i nuovi insert. New `convex/notificationDelivery.ts`: `deliverNotifications` (internalAction: per id carica contesto via internalQuery `getDeliveryContext`, filtra DELIVERABLE_TYPES + opt-in; email via internalMutation `queueNotificationEmail` con `resend` [pattern `queueMonthlyReportEmail`]; telegram via `ctx.runAction(internal.analyst.telegramActions.sendNotificationTelegram)` se `telegramLinks.by_userId` verificato; `markDelivered` internalMutation). New `convex/lib/notificationMessages.ts`: `renderNotificationText(titleKey, bodyKey, params, locale)` EN/IT solo per i tipi deliverable | mod `convex/schema.ts`, `convex/notifications.ts`, `convex/analyst/telegramActions.ts`; new `convex/notificationDelivery.ts`, `convex/lib/notificationMessages.ts` | delivery solo nuovi insert deliverable; rispetta opt-in per canale; timestamp settati una sola volta; nessuna delivery senza settings | F3-T2 |
| F3-T4 | Chiavi i18n inbox `notifications.billReminder.title/body` EN/IT | mod `src/lib/i18n.tsx` | render corretto nell'inbox (`notification-bell.tsx`) | F3-T2 |

(La UI delle preferenze arriva con F6-T4.)

**Testing**: estendere `convex/notifications.test.ts` (boundary lead day; occorrenza pagata soppressa; ricorrenza next-occurrence; secondo run cron → 0 insert; lead days custom; `insertedIds` solo per insert). New `convex/notification-delivery.test.ts` (contesto/markDelivered; skip tipi non-deliverable e utenti opt-out; `renderNotificationText` EN/IT — network mockato al boundary action/mutation, stile test telegram esistenti). New `convex/user-settings.test.ts` (upsert, validazioni, auth).

---

## F4 — Motore scenari long-term / FIRE (missing; layer premium AI)

**Goal**: proiezione mensile fino a 50 anni (crescita income/spese, ritorni investimenti, inflazione, SWR, data FIRE) come tool Analyst read-only seedato dai dati reali dell'utente. Report: differenziatore premium per segmento FIRE (ProjectionLab/Nauma-style).

**Decisioni**: core puro `convex/analyst/longTermProjectionCore.ts` (stile `whatIfCore.ts`/`creditMath.ts`: no db, bigint minor units, tassi float applicati con scaled-integer math). Params: `horizonYears` clamp 1–50, `initialLiquidMinor`, `initialInvestedMinor`, `monthlyIncomeMinor`, `monthlyExpensesMinor`, `incomeGrowthAnnualPct` (0), `expenseInflationAnnualPct` (2), `investmentReturnAnnualPct` (5), `surplusInvestedPct` (100), `liquidBufferMonths` (3), `swrPct` (4), `fireTargetMinor?` (default = spese annue/(swr/100), inflation-adjusted), `oneOffEvents?`, `retirementAtMonthIndex?`. Loop mensile: ritorno mensile `(1+r)^(1/12)−1` sull'investito; surplus → prima buffer liquido, poi quota investita; deficit → prima liquido poi investito; FIRE quando patrimonio ≥ target inflazionato; post-retirement income si azzera e si preleva. Output: `yearly: YearCheckpoint[]` (≤50: liquid/invested/netWorth/income/expenses/savings/savingsRatePct/fireProgressPct), `fireDate?`, `fireReachedMonthIndex?`, `depletedMonthIndex?`, `finalNetWorthMinor`, `assumptions` echo post-clamp. Baseline dal reale: internalQuery `getLongTermBaselineForUser` (liquid = saldi non-CARD; invested = 0 con seam per F7; income/expenses mensili = mediana 3 mesi da `monthlyBaselineFromFutureCashflow` importato da `tools/simulate.ts`). Solo Analyst, niente UI dedicata (chart via `presentChart` esistente).

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F4-T1 | Core puro `projectLongTerm(params, {startDate})` | new `convex/analyst/longTermProjectionCore.ts` | deterministico; clamp orizzonte; FIRE con target inflazionato; buffer/allocazione surplus; depletion detection; one-off events | — |
| F4-T2 | Baseline internalQuery + ref: `getLongTermBaselineForUser` in queries.ts, ref in functionRefs | mod `convex/analyst/queries.ts`, `convex/analyst/functionRefs.ts` | ritorna `{currency, liquidMinor, investedMinor, monthlyIncomeMinor, monthlyExpensesMinor}`; solo read indicizzate bounded | — |
| F4-T3 | Tool `longTermProjection`: zod input tutto optional (major units, `horizonYears` int 1–50 default 30), fetch baseline → overlay override utente → `projectLongTerm` → output major units (yearly table + fireDate + assumptions). **Seam entitlement**: helper che oggi ritorna sempre allowed, flip in F5-T3 (`{upgradeRequired: true, feature:'analyst.longTermProjection'}`). Registrato solo in `analystTools` (non proactive) | new `convex/analyst/tools/longTermProjection.ts`; mod `convex/analyst/tools/index.ts` | tool funzionante con default sensati; seam presente | F4-T1, F4-T2 |
| F4-T4 | Prompt skill FIRE (spiegare assunzioni, nominale vs reale, suggerire sensitivity ±2% ritorni), registrata in prompts/index | new `convex/analyst/prompts/fire.ts`; mod `convex/analyst/prompts/index.ts` | skill selezionata per query FIRE/retirement (convenzioni `whatIf.ts`) | F4-T3 |

**Testing**: new `convex/analyst/long-term-projection.test.ts` (puro): zero-growth = initial + mesi×surplus; ritorno composto ≈ closed form; mese FIRE noto per input 25x/0 inflazione; inflazione posticipa FIRE; depletion; clamp; one-off. Estendere `convex/analyst/queries.test.ts` (baseline con seed) e `prompts.test.ts` (registrazione skill).

---

## F5 — Entitlements / scaffolding freemium (missing; modello di business)

**Goal**: tier `free`(default)/`pro` billing-agnostic con modulo entitlements unico, rate limit Analyst tier-aware e gating delle feature premium. Report: freemium con free tier genuinamente utile, Pro ~8–12€/mese.

**Decisioni**: storage = `userSettings.planTier` (no tabella dedicata — entitlements derivati, non persistiti). Free mantiene tutto F1/F2/F3 + money boxes (nessun check entitlement su quelle superfici). Pro v1: `analyst.longTermProjection` + `analystDailyMessages` 100/day (free: 20/day; burst invariato). Tool gating soft (return `{upgradeRequired:true}`, no throw → il modello spiega e la chat degrada con grazia). Seam billing = `setUserPlanTier` internalMutation (il futuro http action Stripe chiamerà esattamente quella). Verificare se l'ingress Telegram consuma `analystDaily` e nel caso switchare anche lì; rimuovere la config legacy `analystDaily` dopo lo switch dei call site.

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F5-T1 | Definizione pura: `PlanTier`, `FEATURES` (`analyst.longTermProjection`: free false/pro true), `LIMITS` (`analystDailyMessages`: 20/100), `entitlementsForTier`, `resolveTier` (assente → free) | new `convex/lib/entitlements.ts` | mappe esaustive tipate; default free | F3-T1 |
| F5-T2 | Modulo: `getMyEntitlements` (public query auth-gated), `getEntitlementsForUser` (internalQuery `{userId}`); `setUserPlanTier` internalMutation in userSettings (stampa `planUpdatedAtMs`) | new `convex/entitlements.ts`; mod `convex/userSettings.ts` | query pubblica/interna corrette; flip tier funzionante | F5-T1 |
| F5-T3 | Limiti tier-aware: `analystDailyFree` (20/day) + `analystDailyPro` (100/day) in rateLimits; `chat.ts:sendMessage` risolve tier via internal e usa il limite corrispondente; ref `entitlementsForUser` in functionRefs; flip del seam F4-T3 (free → upgradeRequired) | mod `convex/analyst/rateLimits.ts`, `convex/analyst/chat.ts`, `convex/analyst/functionRefs.ts`, `convex/analyst/tools/longTermProjection.ts` | free 20/day, pro 100/day; burst invariato; tool gated; legacy `analystDaily` rimosso dai call site | F5-T2, F4-T3 |
| F5-T4 | Frontend: `useEntitlements()` (`useQuery(api.entitlements.getMyEntitlements)`), `upgrade-cta.tsx` (banner/card, i18n `entitlements.upgrade.*`, punta alla plan card in settings — no checkout); error mapping chat distingue daily-limit e mostra CTA per free | new `src/lib/entitlements.ts`, `src/components/app/upgrade-cta.tsx`; mod `src/components/banking/analyst/helpers.ts`, `src/lib/i18n.tsx` | hook + CTA funzionanti; UX limite raggiunto chiara | F5-T2 |

**Testing**: new `convex/entitlements.test.ts` (free di default senza userSettings; pro dopo `setUserPlanTier`; auth su `getMyEntitlements`; feature map per tier). Caso tool in `long-term-projection.test.ts` (free → upgradeRequired, pro → risultato). Selezione limite chat testata su helper puro estratto (`dailyLimitNameForTier`).

---

## F6 — Privacy & data control (missing; settings, export, memorie)

**Goal**: route `/app/settings` con profilo, piano, preferenze notifiche, link Telegram, gestione memorie Analyst, export dati JSON e richiesta cancellazione. Report: trasparenza privacy = pain point ricorrente e leva di posizionamento.

**Decisioni**: export **JSON v1** (CSV derivabile client-side in futuro) via job pattern: mutation → `ctx.scheduler.runAfter(0, internal.dataExport.runDataExport)` → internalAction pagina per-tabella (indici `by_userId*`, `.paginate`) → blob su `ctx.storage` → download URL firmato; scadenza 7 giorni + cron cleanup giornaliero. Bigint serializzati come stringhe. Tabelle export v1: financialAccounts, accountBalances (ultimi 100/conto), transactions, categories, categoryRules, budgets, subscriptions, plannedExpenses, plannedExpenseOccurrencePayments, moneyBoxes, moneyBoxContributions, creditFacilities, plannedTransfers, notifications, agentMemories (solo content, mai embeddings), userSettings. Deletion = solo request flag (`deletionRequestedAtMs`), reversibile con `cancelAccountDeletion` dalla scheda Zona pericolosa (decisione 0015); l'erasure pipeline resta fuori scope (seam: `markUserProfileDeleted` in `convex/authProfiles.ts`) — registrare il limite in una nota `docs/decisions/`. Telegram card: **riusare** `telegram-link-card.tsx` così com'è (render anche in settings, non spostarla).

Nuova tabella:

```ts
dataExports: defineTable({
  userId: v.string(),
  status: v.union(v.literal('queued'), v.literal('running'), v.literal('completed'), v.literal('failed')),
  format: v.literal('json'),
  storageId: v.optional(v.id('_storage')),
  errorCode: v.optional(v.string()),
  requestedAtMs: v.number(), completedAtMs: v.optional(v.number()), expiresAtMs: v.number(),
}).index('by_userId_and_requestedAtMs', ['userId', 'requestedAtMs'])
  .index('by_status_and_expiresAtMs', ['status', 'expiresAtMs'])
```

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F6-T1 | Memorie Analyst: `listMyMemories` (public query, filtro kind opzionale, `by_userId_and_kind`, `.take(200)`, mai embeddings) + `deleteMyMemory` (public mutation, ownership check) | mod `convex/analyst/memoryStore.ts` | auth; scoping; delete cross-user rifiutato | — |
| F6-T2 | Export backend: tabella `dataExports`; `requestDataExport` (rifiuta se queued/running o completed <24h — scan desc take 5), `runDataExport` (internalAction paging → JSON blob → storage → patch completed/failed), `listMyDataExports` (con `downloadUrl` da `ctx.storage.getUrl` per completed non scaduti), `cleanupExpiredExports` + cron giornaliero | mod `convex/schema.ts`, `convex/crons.ts`; new `convex/dataExport.ts` | request→job→blob→URL; dedupe finestra 24h; cleanup elimina storage; bigint stringificati | — |
| F6-T3 | `requestAccountDeletion` (setta `deletionRequestedAtMs` una volta, visibile da `getMySettings`) + nota decisions sul limite erasure | mod `convex/userSettings.ts`; new `docs/decisions/0006-data-deletion-and-export.md` | idempotente; stato visibile | F3-T1 |
| F6-T4 | Route + UI: `settings.tsx` con card impilate: `profile-card` (read-only da `api.authProfiles.*`), `plan-card` (tier + `UpgradeCta`), `notification-preferences-card` (lead-days chips + switch email/telegram → `updateNotificationPreferences`), riuso `telegram-link-card`, `memories-card` (lista+delete), `data-export-card` (request + lista con stato/download), `danger-zone-card` (confirm dialog). Voce nav `nav.settings`. i18n EN/IT | new `src/routes/_authenticated/_app/app/settings.tsx`, `src/components/settings/{profile,plan,notification-preferences,memories,data-export,danger-zone}-card.tsx`; mod `src/lib/navigation.ts`, `src/lib/i18n.tsx` | tutte le card funzionanti contro backend F3/F5/F6 | F3-T1, F5-T4, F6-T1..T3 |

**Issue #8 item 5 (2026-09-15)**: mantenere il modello request-only della decisione 0006. Fasi: aggiungere annullamento autenticato e no-op senza richiesta; collegare pulsante e toast EN/IT; correggere entrambe le guide e registrare la decisione 0015; verificare regressioni e TypeScript. Nessun cron o purge: il flag non ha un consumer e una scadenza senza erasure reale sarebbe una promessa non implementata.

**Testing**: estendere `convex/analyst/memory-store.test.ts` (scoping, kind filter, ownership, no embeddings nel payload). New `convex/data-export.test.ts` (dedupe 24h; paginazione per tabella; JSON contiene transazione seedata con `amountMinor` stringa; cleanup scaduti; auth). Estendere `convex/user-settings.test.ts` (idempotenza deletion request; annullamento che rimuove il flag; no-op con documento assente o senza richiesta; rifiuto senza autenticazione).

---

## F7 — Manual asset accounts / net worth enrichment (implemented_rough)

**Goal**: tracciare risparmi/investimenti/altri asset come conti manuali con snapshot di saldo, inclusi nel net worth come bucket `assets` ed esclusi da cash spendibile/planning/safe-to-spend. Report: "integrated view of accounts and net worth (cash, credit, loans, investments)".

**Decisioni**: `financialAccounts.accountType` è già free string a schema — si allarga solo il validator di `createManualAccount` (oggi `CARD|CACC` a `convex/banking/manualAccounts.ts:36`) con `SVGS` (savings, trattato come cash), `INVS` (investment), `ASST` (altro asset). Helper `convex/lib/accountTypes.ts`: `ASSET_ACCOUNT_TYPES = ['INVS','ASST']`, `isAssetAccountType`, `isSpendableAccountType` (non CARD e non asset). Aggiornamento saldo manuale = snapshot `accountBalances` (`balanceType:'closingBooked'`). Dashboard: bucket `assets` opzionale nel return (backward-compatible), `netWorth = cash + assets − debts`. Il baseline FIRE (F4-T2) conta gli asset come `initialInvestedMinor` (chiude il seam).

| task_id | description | files | acceptance criteria | deps |
|---|---|---|---|---|
| F7-T1 | Helper tipi + widen validator `createManualAccount` + `setManualAccountBalance` (public mutation `{accountId, amount: moneyAmountValidator, referenceDate?}`; owner + `provider==='manual'` + currency match; insert snapshot) | new `convex/lib/accountTypes.ts`; mod `convex/banking/manualAccounts.ts` | nuovi tipi accettati; snapshot corretto; rejections (valuta/non-manuale/altrui) | — |
| F7-T2 | Dashboard: conti asset fuori da `cashTotals`, dentro nuovo bucket `assets`; netWorth aggiornato con campo `assets` opzionale | mod `convex/banking/dashboard.ts` | shape backward-compatible; totali corretti | F7-T1 |
| F7-T3 | Esclusioni: selezione conti in `getFutureCashflowForUser` (`convex/banking/planning.ts`, stesso punto del filtro CARD esistente) e `availableCash` in safeToSpend usano `isSpendableAccountType`; baseline FIRE somma saldi asset come invested | mod `convex/banking/planning.ts`, `convex/banking/safeToSpend.ts`/`safeToSpendCore.ts`, `convex/analyst/queries.ts` | asset mai in proiezioni cash/safe-to-spend; contati come invested nel long-term | F7-T1, F2-T2, F4-T2 |
| F7-T4 | UI: opzioni tipo nel `manual-account-dialog.tsx` (i18n `accounts.manual.typeSavings/typeInvestment/typeAsset`); sezione "Assets" in accounts list con azione "Update balance" (`update-balance-dialog.tsx` → `setManualAccountBalance`); breakdown cash/assets/debts nella card net worth | mod `manual-account-dialog.tsx`, `accounts-view.tsx`, `account-row.tsx`, `kpi-row.tsx`, `src/lib/i18n.tsx`; new `src/components/banking/accounts/update-balance-dialog.tsx` | crea conto INVS, aggiorna saldo, lo vede in Assets e nel net worth, non nel safe-to-spend | F7-T1..T3 |

**Testing**: estendere `convex/manual-accounts.test.ts` (creazione SVGS/INVS/ASST; snapshot + rejections), `convex/dashboard-redesign.test.ts` (INVS in assets+netWorth non in cash; SVGS come cash), `convex/planning-cashflow.test.ts` e `convex/safe-to-spend.test.ts` (asset esclusi).

---

## Ordine di build e dipendenze cross-feature

```
F1 (indipendente) ─┐
F2 (indipendente) ─┼─→ F7 (tocca F2 core + F4 baseline)
F4-T1/T2 (indip.) ─┘
F3-T1 (userSettings) → F3 → F5 (gate su F4-T3) → F6 (usa F3+F5)
```

Parallelizzabili da subito: F1, F2, F4-T1/T2. Unico prerequisito condiviso duro: **F3-T1** per F5/F6. F7 per ultimo (tocca superfici di F2 e F4).

## Current Verification Evidence

- 2026-09-15 (issue #8 item 5): annullamento request-only implementato con pulsante e toast EN/IT, guide corrette e decisione 0015. `npx vitest run convex/user-settings.test.ts convex/knowledge-base.test.ts` → 2 file, 14 test passed; `npx tsc --noEmit` → exit 0, nessun output. I nuovi test verificano rimozione del campo dal documento e dalla query, no-op senza documento o senza flag e rifiuto `Unauthorized`. Modifiche lasciate non committate.

- 2026-07-16: roadmap approvata; classificazioni e percorsi file verificati su codice durante la gap analysis (3 agenti Explore + 1 Plan).
- 2026-07-16: **F1 implementata** (`convex/banking/csvImport.ts`, `src/lib/csv/parse.ts`, wizard in `src/components/banking/import/`, route `/app/import`; test `convex/csv-import.test.ts` + `convex/csv-parse.test.ts`). **F2 implementata** (`convex/banking/safeToSpendCore.ts` + `safeToSpend.ts`, tool Analyst `getSafeToSpend` in entrambi i toolset, KPI card + breakdown sheet dashboard; test `convex/safe-to-spend.test.ts`). **F4-T1/T2 implementate** (`convex/analyst/longTermProjectionCore.ts`, `getLongTermBaselineForUser` in `convex/analyst/queries.ts`; test `convex/analyst/long-term-projection.test.ts`); F4-T3/T4 (tool + prompt skill + ref) restano da fare insieme al gate F5.
- Review correzioni post-Codex: `computeSafeToSpend` ora esclude interamente i gruppi CARD (saldo e item) per allinearsi agli aggregati del planning engine ed evitare double-count col settlement; 5 errori eslint corretti.
- Bugfix contestuale: il selettore modello dell'Analyst non apriva la tendina dentro il composer (`PromptInput` è un form); sostituito `Select` con `DropdownMenu` che apre verso l'alto in `analyst-model-select.tsx` (inizialmente revertato come fuori scope, poi confermato come fix da segnalazione utente).
- 2026-07-16: `npm run test` → 58 file, 342 test passed; `npm run lint` (tsc + eslint, `--max-warnings 0`) → pulito; `architecture-invariants.test.ts` verde.
- 2026-07-16 (wave 2): **F3 implementata** (`userSettings` in schema + `convex/userSettings.ts`; candidati `billReminder` con lead days, ricorrenze via `addRecurringInterval` di `subscriptionDetection.ts` — deviazione dal piano che citava un helper inesistente in `planningMath.ts`; pipeline `convex/notificationDelivery.ts` email/Telegram opt-in con timestamp idempotenti e template EN/IT in `convex/lib/notificationMessages.ts`). **F4-T3/T4 implementate** (tool `longTermProjection` con gate iniettabile `isLongTermProjectionAllowed` default-allow da flippare in F5, ref `longTermBaselineForUser`, skill `fire.ts` interactive-only). **User-docs EN/IT** aggiunte: `csv-import.mdx` + sezione safe-to-spend in `dashboard-and-totals.mdx` (32 documenti compilati).
- 2026-07-16 (wave 2): `npm run test` → 364 test passed; `npm run lint` pulito; `npm run build` ok (content collections). UI preferenze notifiche arriva con F6-T4 come da piano.
- 2026-07-16 (wave 3): **F5 implementata** (`convex/lib/entitlements.ts` + `convex/entitlements.ts`, `setUserPlanTier` seam, limiti `analystDailyFree` 20/`analystDailyPro` 100 su chat e ingress Telegram con rimozione del legacy `analystDaily`, gate FIRE flippato, `useEntitlements` + `UpgradeCta`). **F7 implementata** (tipi SVGS/INVS/ASST, `setManualAccountBalance`, bucket `assets` nel net worth backward-compatible, esclusioni in planning/safe-to-spend, saldi asset → `investedMinor` nel baseline FIRE, UI Assets + update-balance dialog).
- Review correzioni wave 3: regressione in `getFutureCashflowForUser` (il filtro F7 escludeva anche i gruppi CARD, che devono restare ispezionabili nella planning view — ripristinati con test di regressione dedicato in `planning-cashflow.test.ts`); module map di `telegram-persistence.test.ts` estesa con `entitlements.ts` per la nuova runQuery annidata.
- 2026-07-16 (wave 3): `npm run test` → 383 test passed; `npm run lint` pulito.
- 2026-07-16 (wave 4 finale): user-docs backfill completato — nuovo `settings-and-privacy.mdx` EN/IT + aggiornamenti a `analyst-notifications-automations`, `accounts`, `manual-accounts`, `dashboard-and-totals` (34 documenti compilati, parità slug EN/IT). Verifica finale: `npm run test` → 62 file, 393 test passed; `npm run lint` pulito; `npm run build` ok.
- 2026-07-16 (wave 4): **F6 implementata** (`dataExports` + `convex/dataExport.ts` con export JSON paginato per-tabella, bigint stringificati, scadenza 7 giorni e cron di cleanup; `listMyMemories`/`deleteMyMemory` in memoryStore senza embeddings; `requestAccountDeletion` idempotente; route `/app/settings` con 6 card + nav + i18n EN/IT; `docs/decisions/0006-data-deletion-and-export.md`). `npm run test` → 393 test passed; `npm run lint` pulito; `knowledge-base.test.ts` verde.

## Verifica end-to-end (per ogni feature e a fine piano)

1. `npm run test` (vitest run) — tutti i `convex/*.test.ts` verdi, incluso `architecture-invariants.test.ts` intatto.
2. `npm run lint` (tsc + eslint, zero warning).
3. `npm run dev` (convex dev + vite) e verifica manuale del flusso: F1 wizard import con CSV reale (virgola decimale IT); F2 card safe-to-spend + sheet; F3 forzare `evaluateNotifications` da dashboard Convex e verificare inbox + delivery opt-in; F4 chiedere all'Analyst "quando raggiungo il FIRE?"; F5 flip tier via `setUserPlanTier` dalla dashboard Convex e verificare gate/limiti; F6 export → download JSON e verifica contenuto; F7 conto INVS → net worth breakdown.
4. Per ogni feature: `docs/execution-plans/<nome>.md` aggiornato con Current Verification Evidence (conteggio test + data, esito lint/build), changelog e user-docs EN/IT per i cambi user-visible.
