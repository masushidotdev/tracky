# Plan (ex Budget) — riprogettazione zero-based ispirata a YNAB

Status: done — F1–F6 implementate e committate (F1–F3b il 2026-07-21, F4–F6 il 2026-07-22). Il modello legacy
`budgets` e `parentCategoryId` sono stati migrati e rimossi; l'architettura è registrata in
`docs/decisions/0009-zero-based-plan.md`.
Owner: coding agents (claudex implementation, Claude spec/review/verification).

## Contesto

La sezione Budget di Tracky è oggi un **sistema di tetti di spesa mensili**, non un piano di allocazione:
`budgets(userId, period, categoryId?, amount, rollover)` con `spent` derivato dalle sole transazioni `DBIT`
e `remaining = amount − spent` (`convex/banking/budgets.ts:353-411`). `rollover` è persistito ma **mai usato** nei calcoli.
Non esistono denaro assegnato, Ready to Assign, Available cumulativo, target, gruppi ordinabili, movimenti tra categorie.

L'obiettivo è sostituirlo con una sezione **Plan** fedele a YNAB: più piani, macro-categorie e sotto-categorie
riordinabili in drag-and-drop, target per categoria, e colonna **Activity** alimentata dalle transazioni
importate e categorizzate.

Vincolo emerso dall'uso reale: parte della tassonomia di sistema è inutile per il singolo utente, mentre in YNAB le
categorie appartengono al piano e sono interamente personalizzabili. Il piano deve dare quella libertà **senza**
rendere le transazioni orfane né obbligare a ricategorizzarle per ogni piano (§3.2).

Decisioni prese:
- **Modello zero-based completo** — Ready to Assign ancorato alla liquidità reale, Assigned / Activity / Available,
  rollover del positivo, move money tra categorie.
- **Piano = bucket sopra una tassonomia globale** (§3.2) — la categoria globale resta l'unica verità sulla transazione;
  il piano definisce righe proprie, personalizzabili, mappate a 1..N categorie globali.
- **Gruppi di piano** — nuova tabella, `parentCategoryId` rimosso.
- **Carte di credito** — conti CARD nella liquidità del piano con segno negativo, niente *payment categories* in v1.

## 1. Analisi YNAB Plan (fonti)

### Header del piano
- Mostra **Ready to Assign (RTA)** — "quanti soldi devono ancora ricevere un lavoro" — e la navigazione tra i mesi
  ([Plan header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9)).
- Cliccando RTA si apre un **breakdown**: avanzo dal mese precedente, entrate del mese, assegnato nel mese,
  e **"Cash Overspending in [mese precedente]"**, che viene *sottratto* perché quei soldi hanno già lasciato il conto
  ([Plan header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9),
  [Overspending](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi)).
- RTA negativo è uno stato esplicito da risolvere
  ([RTA negativo](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc)).

### Griglia
Colonne **Category / Assigned / Activity / Available**, categorie dentro gruppi collassabili.
- **Activity** = somma netta delle transazioni del mese in quella categoria; può essere positiva (rimborsi, storni)
  ([Glossario](https://support.ynab.com/en_us/ynab-glossary-a-guide-BJd80SORq),
  [Inspector](https://support.ynab.com/en_us/the-inspector-an-overview-ryylY7OCq)).
  Cliccando Activity si apre la lista transazioni del mese
  ([Ricerca transazioni](https://support.ynab.com/en_us/searching-transactions-a-guide-r1gxyQryj)).
- **Available** = Available riportato dal mese precedente + Assigned + Activity.
- Al cambio mese: gli **Available positivi rollano**, l'Assigned riparte da zero, l'**overspending cash** non rolla
  nella categoria (che riparte da 0) ma **riduce il RTA del mese nuovo**
  ([Month rollover](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9)).
- Barre di progresso e colori: verde finanziato, giallo sotto-finanziato, rosso overspent
  ([Progress bars](https://support.ynab.com/en_us/progress-bars-a-guide-SkDEhot09),
  [Colori](https://support.ynab.com/en_us/colors-and-icons-in-your-plan-HJQv_XHko)).

### Target
Cadenza **Weekly / Monthly / Yearly / Custom**; comportamenti
**"Set aside another…"** (riassegna l'intero importo ogni periodo, accumula),
**"Refill up to…"** (chiede solo quanto è stato speso/tolto), **"Have a balance of…"** (solo custom, non ripetibile,
non pensata per essere spesa fino alla scadenza), con **due date** opzionale
([Targets](https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC),
[How to use targets](https://support.ynab.com/how-to-use-targets-rk5kkI9ks)).
I target si possono **snoozare per il mese corrente**: escono dall'Underfunded ma restano overfundabili
([Snooze](https://support.ynab.com/en_us/snooze-a-target-HyS4E5rZT)).

### Auto-Assign
Opzioni: **Underfunded**, **Assigned Last Month**, **Spent Last Month**, **Average Assigned** (media mobile fino a 12 mesi,
escluso il mese corrente), più **Reset Available / Reset Assigned** solo web; mostra un'anteprima prima di confermare
([Auto-Assign](https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo)).
Priorità di Underfunded: prima l'overspending, poi transazioni schedulate e target con scadenza, poi target di fine mese,
poi target a lungo termine; le categorie con target snoozed sono escluse
([Underfunded logic](https://support.ynab.com/en_us/underfunded-a-guide-BJwPhQO09)).

### Edit Plan e Cost to Be Me
**Edit Plan**: aggiunta, rinomina, riordino ed eliminazione di categorie e target in un'unica modalità di modifica.
**Cost to Be Me**: somma di tutti i target del mese = quanto serve per finanziare completamente il mese,
confrontata con l'**expected income** inserita dall'utente; mostra anche l'anteprima del mese successivo quando il
totale è più alto (es. mesi con 5 settimane)
([Edit Plan / Cost to Be Me](https://support.ynab.com/plan-and-adjust-with-edit-plan-and-cost-to-be-me-ByR7vpqPyx)).

### Viste e impostazioni
**Focused Views**: Underfunded, Overspent, Snoozed, Money Available; le categorie nascoste sono escluse dalle azioni
([Focused views](https://support.ynab.com/en_us/focused-views-a-guide-BksnNYqLh)).
**Plan settings**: rinomina piano, valuta, formato numeri, posizione decimali, formato data
([Plan settings](https://support.ynab.com/en_us/how-to-adjust-your-plan-settings-SyFt35cAq)).
**Move Money** tra categorie e "cover overspending" da un'altra categoria
([Moving money](https://support.ynab.com/moving-money-in-your-plan-ryyCKbBJi)).

## 2. Confronto con Tracky

| YNAB Plan | Tracky oggi | Esito |
|---|---|---|
| Ready to Assign + breakdown | assente | nuovo |
| Assigned / Activity / Available | solo `amount` (cap) e `spent` (solo DBIT) | riscrittura |
| Rollover del positivo | `rollover` persistito e ignorato | implementare |
| Gruppi + sotto-categorie ordinabili | `parentCategoryId` a metà (settabile solo in create, mai in update, nessun rollup nei budget, nessun `sortOrder`) | sostituire |
| Drag-and-drop | `@dnd-kit/*` installato ma **mai importato** (`package.json:32-35`) | nuovo |
| Target | nessuno; matematica simile in `planningMath.ts:102-169` (money box) | nuovo, riusa la math |
| Auto-Assign | assente | nuovo |
| Più piani | assente | nuovo |
| Categorie del piano interamente personalizzabili | tassonomia globale di sistema, immutabile e non archiviabile: parte è inutile per il singolo utente ma resta ovunque | bucket di piano + `archived` |
| Activity da transazioni | `spent` ignora i CRDT (niente rimborsi), non filtra `status` (contano PDNG/CNCL/RJCT), tronca a 1000 tx | riscrittura |
| Valuta | hardcoded `EUR` in UI (`budgets-view.tsx:66-69`); la valuta non è nella chiave logica dell'upsert | valuta di piano |
| Regole di categorizzazione | occupano metà pagina Budget | spostare in Settings |

**Debiti collaterali da chiudere in corsa** (già confermati leggendo il codice):
1. `convex/notifications.ts:73-81` — doppio `setUTCMonth(+1)`: gli alert budget contano **due mesi** di transazioni.
2. `src/components/banking/dashboard/kpi-row.tsx:77-107` — somma budget *overall* e budget di categoria ⇒ doppio conteggio.
3. `src/components/banking/dashboard/dashboard-view.tsx:45` — KPI/chart calcolati sui **primi 6** budget.
4. `convex/banking/transactions.ts:1059-1095` — `setCategory` non marca `classificationSource: 'user'` se il `kind` non cambia,
   quindi una regola può in seguito sovrascrivere una scelta manuale.
5. `convex/banking/transactions.ts:792-810` — `getSpendingByCategory` perde le transazioni della seconda valuta di una categoria.

## 3. Architettura proposta

### 3.1 Policy Activity condivisa (fondamento)
Nuovo modulo puro `convex/banking/planActivity.ts` — unica definizione di "transazione che conta":

```
eleggibile ⇔ status === 'BOOK'
           ∧ bookingDate ∈ [YYYY-MM-01, mese+1-01)
           ∧ classificationKind ∉ {transfer, internal}
           ∧ !transferMatchId            // difensivo su dati legacy
           ∧ amount.currency === plan.currency

activity(tx) = direction === 'CRDT' ? +abs(amountMinor) : −abs(amountMinor)
```

- `hiddenFromReports` **non** esclude dal piano (contratto documentato in `user-docs/*/transactions.mdx:25-33`).
- Account nascosti/in pausa **non** riscrivono lo storico: si parte dalle transazioni, non da `listAccounts`.
- Acquisti con carta contano alla data dell'acquisto; il saldo estratto conto resta a Planning/Credit.
- Indice da usare: `by_userId_and_status_and_bookingDate` (già esistente) — niente scansione di tutti gli status.
- Consumatori da riportare su questa policy: piano, notifiche budget, `getSpendingByCategory`, Analyst.
  Reports resta separato (esclude `hiddenFromReports`) ma condivide gli helper di eleggibilità.

### 3.2 Modello dati: due livelli

Il nodo del progetto è che in YNAB le categorie appartengono al piano, mentre una transazione può avere
**una sola** categorizzazione: renderle plan-scoped significherebbe ricategorizzare tutto per ogni piano
(duplicazione, piani divergenti, nessun riferimento unico per regole/Reports/Forecast/Analyst). Soluzione adottata:

- **Categoria globale** (`categories`, già esistente) = unica verità sulla transazione. Import, regole di
  categorizzazione, Reports, Forecast e Analyst restano invariati.
- **Bucket di piano** (`planBuckets`) = la riga che l'utente vede e personalizza: nome proprio, gruppo, ordine,
  target, assegnazioni. Mappa **1..N** categorie globali; `Activity(bucket) = Σ activity delle categorie mappate`.
- **Invariante anti-doppio-conteggio**: ogni categoria globale appartiene ad **al massimo un bucket per piano**
  (partizione). Le categorie non mappate confluiscono nella riga di sistema **"Non pianificato"**, sempre visibile:
  nessuna spesa può sparire silenziosamente.
- **Default 1:1**: creando un bucket dal piano si crea contestualmente la categoria globale corrispondente, quindi
  il doppio livello resta invisibile finché non serve davvero aggregare.
- **Vincolo esplicito** (documentato in UI e docs): un bucket può *unire* categorie, mai *spezzarne* una. La tassonomia
  globale deve quindi essere almeno fine quanto il piano più dettagliato; per più granularità si crea la categoria
  globale e si ricategorizza (le regole aiutano).
- **`archived` sulle categorie globali**: le categorie inutili per l'utente escono dal picker delle transazioni e dai
  suggerimenti, restando sullo storico e sui report. Risolve il problema "tassonomia di sistema troppo generica"
  indipendentemente dal piano.

Esempio: "Piano dettagliato" con bucket *Spesa* ← `groceries`, *Bar* ← `cafe`, *Ristoranti* ← `dining`;
"Piano frugale" con un unico bucket *Vita quotidiana* ← `groceries`+`cafe`+`dining`. Stesse transazioni, zero
ricategorizzazione, Activity coerente in entrambi.

### 3.3 Schema Convex (nuove tabelle in `convex/schema.ts`)

```
plans                 userId, name, currency, startPeriod,
                      accountIds[]        // conti on-budget del piano (cash + CARD)
                      expectedIncomeMinor?, isDefault, sortOrder, createdAtMs, updatedAtMs
                      .index by_userId

planGroups            planId, userId, name, sortOrder, collapsed, hidden, …
                      .index by_planId_and_sortOrder

planBuckets           planId, userId, groupId, name, sortOrder, hidden, note,
                      isUnplanned            // riga di sistema "Non pianificato"
                      .index by_planId_and_groupId_and_sortOrder

planBucketCategories  planId, userId, bucketId, categoryId
                      .index by_planId_and_categoryId   // .unique() ⇒ partizione garantita
                      .index by_bucketId

planAssignments       planId, userId, bucketId, period, assignedMinor, currency, …
                      .index by_planId_and_period_and_bucketId   // .unique()
                      .index by_planId_and_period

planTargets           planId, userId, bucketId, cadence(weekly|monthly|yearly|custom),
                      behaviour(setAside|refill|balanceBy), amountMinor, currency,
                      dueDate?, dayOfMonth?, dayOfWeek?, repeats, snoozedPeriods[]
                      .index by_planId_and_bucketId       // .unique()

planMonthSnapshots    planId, userId, period,
                      entries[{bucketId, assignedMinor, activityMinor, availableEndMinor}],
                      readyToAssignEndMinor, cashOverspendingMinor, computedAtMs
                      .index by_planId_and_period               // .unique()
```

Campo aggiunto a `categories`: `archived: v.optional(v.boolean())`.

**Perché lo snapshot.** `Available(m)` dipende da `Available(m−1)` con clamp a 0 sull'overspending: non è decomponibile,
va iterato dal primo mese del piano. Calcolarlo a ogni render significherebbe scansionare tutte le transazioni dall'inizio
(oltre il limite pratico di letture per query Convex). Quindi:
- i **mesi chiusi** sono materializzati in `planMonthSnapshots`;
- il **mese visualizzato** si calcola live: `snapshot(m−1)` + `planAssignments(m)` + una sola scansione indicizzata
  delle transazioni del mese;
- ogni scrittura che tocca transazioni o assegnazioni marca il periodo come "sporco" e schedula
  `internal.plan.recomputeSnapshots`, che ricalcola in avanti mese per mese (auto-rischedulandosi, stile
  `cleanupDeletedCategory` in `budgets.ts:236-303`).

### 3.4 Formule (unico punto di verità, modulo puro testabile)

```
// b = bucket di piano; activity(b, m) = Σ activity delle categorie globali mappate su b
available(b, m)  = carryIn(b, m) + assigned(b, m) + activity(b, m)
carryIn(b, m)    = max(0, available(b, m−1))            // il negativo non rolla
cashOverspending(m−1) = Σ_b min(0, available(b, m−1))   // valore ≤ 0

readyToAssign(m)   = liquiditàOnBudget(fine m) − Σ_b available(b, m)      // invariante YNAB
breakdown(m)       = leftOver(m−1) + income(m) − assigned(m) − |cashOverspending(m−1)|
```

- `liquiditàOnBudget` = Σ saldi dei conti cash in `plan.accountIds` **+ Σ min(0, saldo) dei conti CARD**.
  Un acquisto a credito riduce la liquidità esattamente come riduce l'Available del bucket, quindi l'invariante regge
  senza le *credit-card payment categories* di YNAB. Il pagamento dell'estratto conto è un transfer: entrambe le gambe
  sono escluse dall'Activity e la liquidità netta non cambia.
  Il clamp a `min(0, saldo)` è obbligatorio e replica `derivedOverdraftUsed` (`convex/banking/overdraft.ts:26-34`):
  alcuni provider riportano sul conto CARD il **plafond residuo** come saldo positivo, che non è denaro spendibile.
  Conseguenza accettata: un credito reale sulla carta (saldo positivo) non aumenta il Ready to Assign finché non
  rientra su un conto liquido. Scelta conservativa e coerente col resto dell'app.
- Nel **mese corrente**, `liquiditàOnBudget` si legge direttamente dai saldi preferiti più recenti dei conti del piano:
  nessun movimento o classificazione può ridefinire un valore già osservabile.
- Per un **mese passato** `m`, `liquiditàOnBudget(m) = liquiditàOnBudget(oggi) − Σ movimenti firmati` sui conti del piano
  prenotati dopo la fine di `m`. La scansione mensile indicizzata resta limitata a 12 mesi; oltre il limite il read model
  segnala `truncated` invece di presentare un totale parziale come completo.
- La breakdown usa la variazione tra due liquidità così ottenute; `income` resta il residuo esatto dopo activity, rate e
  giroconti. Le classificazioni spiegano la variazione, non la determinano.
- Nessuna conversione FX: il piano è **mono-valuta**; transazioni in altra valuta non entrano (esposte come avviso).

### 3.4b Denaro che esce dal perimetro (decisione 2026-07-21)

La policy Activity esclude `transfer` e `internal` perché non sono spesa, ma quel denaro **lascia comunque i conti del
piano** e la liquidità lo registra: il Ready to Assign scendeva senza che nessuna riga della griglia lo mostrasse.
I casi reali sono i giroconti verso conti non inclusi nel piano e i rimborsi di credito garantito da carta: l'acquisto
sulla carta era già Activity, quindi il rimborso resta `internal` per evitare il doppio conteggio. Le rate di un
`installmentCredit` esterno sono invece l'unica traccia nel perimetro del piano e restano spesa di categoria, oppure
*Non pianificato* se non hanno categoria.

Scelta: **righe di sistema informative** accanto a *Non pianificato*, in un gruppo «Fuori dal piano». Non hanno
assegnato né disponibile e non entrano in `Σ available`, quindi l'identità del Ready to Assign resta intatta;
servono a rendere visibili i trasferimenti netti e i rimborsi card-backed esclusi dall'Activity.

Decomposizione, sfruttando il fatto che un giroconto **interno** al perimetro si annulla da solo nella somma dei
movimenti dei conti del piano — non serve risolvere la controparte di ogni transfer:

```
movimento(m)   = attivitàBucket + rateInterne + girocontiNetti + entrate
readyToAssign  = riporto + entrate + rateInterne + girocontiNetti − assegnato − |overspending|
```

`entrate` è il residuo per costruzione, quindi l'identità resta esatta al centesimo.
La riga della scomposizione oggi etichettata «Attività del mese» va rinominata: non è il totale della colonna
Attività, ed è proprio questa ambiguità che ha nascosto il problema.

Inoltre `createPlan` **scartava in silenzio** i conti non idonei (asset, valuta diversa, non attivi): il piano deve
mostrare quali conti lo compongono e avvisare quando una selezione è stata esclusa.

### 3.5 Target — matematica

```
setAside   : needed(m) = amount                                   (ogni periodo, accumula)
refill     : needed(m) = max(0, amount − carryIn)                 (rabbocco)
balanceBy  : needed(m) = max(0, (amount − carryIn) / mesiRimanenti)   // riusa planningMath.ts:102-169
weekly     : needed(m) = amount × occorrenzeDelGiornoNelMese       (gestisce i mesi da 5 settimane)
yearly     : needed(m) = amount / mesiRimanentiAllaScadenza
underfunded(b, m) = max(0, needed(m) − assigned(m) − carryIn effettivo)   // 0 se snoozed
```
Stato per la barra: **overspent** (available < 0) → **underfunded** (underfunded > 0) → **funded** → **overfunded**.

### 3.6 Mutation
`setAssigned`, `moveMoney(from, to, amount)`, `coverOverspending(bucket, from)`, `autoAssign(strategy, bucketIds?)`
(anteprima + conferma), `setTarget` / `clearTarget` / `snoozeTarget`, `createGroup` / `renameGroup` / `deleteGroup`,
`createBucket` (crea anche la categoria globale 1:1) / `renameBucket` / `hideBucket` / `deleteBucket`,
`mapCategoriesToBucket(bucketId, categoryIds[])` — mutation unica che **sposta** le categorie dal bucket precedente,
mantenendo la partizione; le categorie rimaste fuori tornano in *Non pianificato*,
`archiveCategory` (globale), `reorder(groups|buckets)` in **una sola mutation batch** (rinormalizza gli `sortOrder`
con passo 1000), `createPlan` / `duplicatePlan` / `renamePlan` / `deletePlan` / `setActivePlan`,
`setExpectedIncome(period)`.

### 3.7 UI (`src/components/banking/plan/`)
Container `plan-view.tsx` + presentational, secondo le convenzioni del design system "Ledger ink"
(`AppPage`, `Amount`, `EmptyState`, `DetailSheet`, `usePendingAction`, i18n en+it):
- `plan-header.tsx` — RTA grande con stato colore, popover breakdown, month nav `‹ oggi ›`, selettore piano, Auto-Assign.
- `plan-grid.tsx` — griglia Category/Assigned/Activity/Available, gruppi collassabili, header sticky, celle Assigned
  editabili inline (invio/tab/frecce), Activity cliccabile → transazioni del mese filtrate.
- `plan-bucket-inspector.tsx` (`DetailSheet`) — target, progress, note, snooze, move money, storico 12 mesi e
  **"Categorie incluse"**: multi-select delle categorie globali che alimentano il bucket, con avviso quando una
  categoria viene sottratta a un altro bucket. Riusa `CategoryPicker` e `CategoryIcon` esistenti.
- `plan-edit-mode.tsx` — Edit Plan: multi-select, drag-and-drop `@dnd-kit` con `KeyboardSensor` (accessibile),
  rinomina/aggiungi/elimina bucket e gruppi.
- `cost-to-be-me.tsx` — somma target del mese vs expected income, anteprima mese successivo.
- Riga di sistema **Non pianificato** in coda alla griglia, con Activity delle categorie non mappate e azione rapida
  "assegna a un bucket"; è il punto in cui si scopre che il piano non copre una spesa reale.
- Viste filtro: Tutte / Sotto-finanziate / In rosso / Snoozed / Con disponibilità.
- Mobile: card per bucket, sheet per l'editing.

**Parità visiva con YNAB** (richiesta esplicita dell'utente, 2026-07-21, con screenshot di riferimento):
- **Disponibile come pillola colorata**, non numero nudo: stati verde/giallo/grigio/rosso resi con i token esistenti
  (`text-positive`, `--warning`, muted, `destructive`) e non con la palette satura di YNAB, per non spaccare la
  coerenza con Report, Obiettivi e Dashboard. Se dal vivo risulta troppo spenta si alza la saturazione dei token.
- **Barra di progresso sotto il nome del bucket**, con il messaggio del target a destra sulla stessa riga
  («mancano X entro il giorno N», «interamente speso», «superato: X di Y»). I messaggi derivano dai target,
  quindi hanno senso solo dopo F4.
- **Icona per bucket**, riusando `CategoryIcon` e il registro icone/colori esistente.
- Densità di riga, pesi tipografici e righe di gruppo con subtotali in grassetto come nel riferimento.
- **Colonna inspector fissa a destra**, sempre aperta da `lg` in su: mostra il contenuto relativo a ciò che è
  selezionato (bucket, gruppo, o il riepilogo del mese quando non c'è selezione), con lo stesso contenuto che oggi
  vive nel drawer. Sotto `lg` resta il `DetailSheet` attuale. La griglia si restringe, non scrolla orizzontalmente.
- Le checkbox di selezione multipla arrivano con F5, insieme alle azioni bulk che le giustificano.
- Il gruppo *Credit Card Payments* del riferimento YNAB non verrà replicato: è la conseguenza diretta della scelta
  sulle carte (§3.4), il cui ruolo in Tracky è coperto da Planning e dalla sezione credito.

### 3.8 Integrazioni
- **Navigazione**: `/app/budgets` → `/app/plan`, voce "Plan"/"Piano" in `src/lib/navigation.ts:64-67`
  (sidebar, header, command menu consumano la stessa lista). Route tree rigenerato.
- **Regole di categorizzazione**: spostate da Budget a Settings, accanto a `categories-card.tsx` — appartengono al
  flusso di import, non alla pianificazione. `budgets/category-form.tsx` (già orfano) eliminato.
- **Settings › Categorie**: gestisce la tassonomia globale (creazione, modifica, **archiviazione**); il picker delle
  transazioni e i suggerimenti escludono le archiviate, che restano visibili sullo storico e nei Reports.
- **Dashboard**: KPI e chart budget riscritti sul piano attivo (RTA, assegnato, speso, categorie in rosso), niente più
  somma overall+categorie e niente più `limit: 6`.
- **Notifiche**: `notifications.ts` smette di duplicare l'algoritmo e usa il read model del piano; corretto il bug del
  range di due mesi; chiave di dedupe semantica `plan:{planId}:{period}:{bucketId}` per non riemettere alert vecchi.
- **Analyst**: `read.ts` espone il piano (RTA, underfunded, overspent); `write.ts` sostituisce l'upsert budget con
  `setAssigned`/`setTarget`, sempre approval-gated.
- **Reports**: continua ad aggregare sulle categorie globali; il raggruppamento "per macro-categoria" passa dai
  `parentCategoryId` ai **gruppi/bucket del piano attivo**, con group key = **ID stabili**, non nomi.
- **Forecast**: invariato in v1 (baseline dalle transazioni). Il piano come sorgente alternativa è una fase successiva.
- **Planning / Goals / Safe to spend**: invariati. Resta valida la separazione
  `Activity = transazioni reali`, `Planning = impegni futuri`, `Safe to spend = saldi − impegni`.
- **Export** (`convex/dataExport.ts:20-74`): aggiunte le nuove tabelle, bump di `version`.
- **Cleanup categorie** (`budgets.ts:236-303`): aggiunge `planBucketCategories`; un bucket rimasto senza categorie
  resta valido (Activity 0), non viene eliminato a sorpresa.
- **Entitlements**: piani multipli oltre il primo = Pro, **verificato nel backend** (`convex/lib/entitlements.ts`), non solo in UI.

### 3.9 Migrazione (`convex/migrations.ts`, stile paginato esistente)
1. Per ogni utente con categorie: crea il piano di default (valuta = valuta prevalente dei conti cash,
   `startPeriod` = mese corrente, `accountIds` = conti cash + card non nascosti).
2. Crea i gruppi da una mappa curata `systemKey → macro-gruppo` (es. Casa e bollette, Vita quotidiana, Trasporti,
   Tempo libero, Salute, Risparmi e obiettivi) e, per ogni categoria `budgetEligible`, un **bucket 1:1** con la stessa
   icona/colore (`planBucketCategories` con una sola riga); le custom vanno in "Altro" mantenendo `categoryId`
   (mai rimappare per nome). Il bucket di sistema *Non pianificato* viene creato sempre.
3. Le categorie mai usate dall'utente (nessuna transazione, nessun budget) **non** ricevono un bucket: restano
   disponibili in *Non pianificato* e sono candidate all'archiviazione, suggerita in un pannello di onboarding del piano.
4. `budgets` con `categoryId` → `planAssignments` sul bucket corrispondente, **solo dal mese di migrazione in avanti**;
   i target non vengono inventati. Nessun rollover retroattivo: lo storico non viene riscritto.
5. `budgets` **overall** (`categoryId === undefined`) → non migrato come riga di piano (sarebbe doppio conteggio):
   convertito in `plans.expectedIncomeMinor`/nota informativa e segnalato all'utente.
6. Diagnostica pre-migrazione: budget su categorie non eleggibili, cicli parent-child, transazioni con
   `transferMatchId` ma classificazione incoerente, budget duplicati per chiave logica.
7. Rimozione di `budgets`, `parentCategoryId` e del vecchio read model **nella stessa release** (nessun alias/shim:
   non è una API pubblica né un contratto versionato).

## 4. Fasi

| Fase | Contenuto | Verifica |
|---|---|---|
| F1 | `planActivity.ts` + matrice di test Activity; fix notifiche/Dashboard/`setCategory` | `pnpm test` |
| F2 | Schema (piano, gruppi, bucket, mapping), mutation base, snapshot + recompute, migrazione, `archived` | test unit + migrazione su dati seed |
| F3 | Read model `getPlanMonth` + header con RTA + griglia con inline editing | test + QA visiva |
| F4 | Target, snooze, Auto-Assign (con anteprima), Cost to Be Me, expected income | test math |
| F3b | Parità visiva YNAB: pillola Disponibile, barra con messaggi di target, icone, colonna inspector fissa | QA visiva, tastiera, mobile |
| F5 | Gruppi, drag-and-drop, Edit Plan, viste filtro, hide categorie, multi-piano + gate Pro | QA tastiera/mobile |
| F6 | Dashboard, notifiche, Analyst, Reports, export, docs en/it, changelog, ADR | `pnpm lint`, `pnpm build` |

## 5. Verifica

- **Test Convex** (`pnpm test`), con un **fixture builder condiviso** (oggi assente: ogni file ripete `createTest`):
  - matrice Activity: BOOK vs PDNG/CNCL/RJCT/HOLD/SCHD; rimborso CRDT sulla stessa categoria; transfer confermato vs
    candidato; fee di transfer; acquisto CARD; settlement estratto conto; rata riclassificata `internal`; pagamento di
    planned expense; contributo money box; account nascosto; oltre 1000 transazioni nel mese; seconda valuta.
  - carry/rollover: positivo che rolla, overspending che azzera la categoria e riduce RTA del mese dopo.
  - invariante `liquidità = Σ available + RTA` su una sequenza di 6 mesi.
  - target: le 4 cadenze × 3 comportamenti, mese da 5 settimane, snooze, underfunded ordering.
  - auto-assign: le 4 strategie + reset, con e senza selezione di categorie.
  - reorder: rinormalizzazione `sortOrder`, spostamento tra gruppi, eliminazione gruppo non vuoto.
  - **partizione bucket**: una categoria mappata su due bucket dello stesso piano è impossibile (`.unique()`);
    mapping many→one con Activity = somma; categoria sottratta a un bucket e riassegnata a un altro; categoria non
    mappata che compare in *Non pianificato*; categoria archiviata che continua a contribuire allo storico;
    due piani con mapping diversi sulle **stesse** transazioni che restituiscono totali coerenti fra loro.
  - migrazione: idempotenza, bucket 1:1 creati, nessun doppio conteggio overall, `categoryId` preservati.
- **`pnpm lint`** (tsc + eslint, zero warning) e **`pnpm build`**.
- **QA visiva** su `/app/plan` (richiede la sessione WorkOS dell'utente): navigazione mesi, editing inline con
  tastiera, drag-and-drop con tastiera, collapse gruppi, mobile, tema chiaro/scuro, IT/EN.
- **Docs**: `user-docs/{en,it}/budgets-and-subscriptions.mdx` riscritte come "Plan", `docs/architecture.md`,
  nuovo ADR `docs/decisions/00XX-zero-based-plan.md`, `CHANGELOG.md`.

## Current Verification Evidence

- 2026-07-21: piano approvato con quattro decisioni dell'utente — zero-based completo; piano = bucket sopra tassonomia
  globale (§3.2); gruppi di piano con rimozione di `parentCategoryId`; carte di credito come liquidità negativa.
- 2026-07-21: **F1 implementata** — `convex/banking/planActivity.ts` (policy condivisa: solo `BOOK`, esclusi
  transfer/internal/income e le righe con `transferMatchId`, activity con segno) adottata da
  `budgetsWithSpendingForUser` e da `notifications.ts`, che perde la copia duplicata dell'algoritmo e il
  `periodEndDate` che contava due mesi. Chiusi anche il doppio conteggio overall+categorie nel KPI Dashboard,
  il limite di 6 budget, `setCategory` che non marcava l'override utente, e la perdita della seconda valuta in
  `getSpendingByCategory`. Nuovo `convex/plan-activity.test.ts`. In revisione è emerso e stato corretto un difetto:
  con l'activity netta un budget *overall* sottraeva anche il reddito, quindi income e inflow non classificati sono
  ora esclusi dall'activity. Verifica: `pnpm lint` pulito, `pnpm test` 77 file / 527 test verdi.
- 2026-07-21: spike carte di credito concluso (§6.3) — l'inclusione dei conti CARD con clamp `min(0, saldo)` non
  duplica il debito già rappresentato da installment plans e statement cycles. F2 sbloccata.
- 2026-07-21: **F2a implementata** (additiva, non committata) — tabelle `plans`, `planGroups`, `planBuckets`,
  `planBucketCategories`, `planAssignments` e campo `categories.archived`; modulo puro `convex/banking/planMath.ts`
  con carry, available, cash overspending, liquidità con clamp CARD e Ready to Assign; mutation in
  `convex/banking/plan.ts` (bootstrap con bucket 1:1 + Unplanned, CRUD gruppi/bucket, `mapCategoriesToBucket`,
  `reorderPlan`, `setAssigned`, `moveMoney`, `archiveCategory`). Partizione garantita dall'indice
  `by_planId_and_categoryId` con `.unique()`; nessuna categoria o bucket resta orfano (fallback su Unplanned e su un
  gruppo di riserva). Verifica: `pnpm lint` pulito, `pnpm test` 79 file / 539 test verdi.
  Restano fuori, come da scope: migrazione dei budget legacy, rimozione di `budgets`/`parentCategoryId`, read model,
  snapshot, target e UI.
- 2026-07-21: **F2b implementata** (additiva, non committata) — `convex/banking/planRead.ts` con `getPlanMonth`,
  tabella `planMonthSnapshots`, `recomputePlanSnapshots` auto-rischedulante e `recalculatePlan`. La prima versione
  ricostruiva la liquidità da `openingCarryMinor` più i movimenti netti; la base è stata poi sostituita dall'ancoraggio
  ai saldi osservati descritto in §3.4. In revisione sono emersi e stati corretti due difetti della cache: gli snapshot
  venivano
  scritti anche per il mese in corso, e il seme veniva cercato solo nel mese immediatamente precedente. Ora vale una
  **finestra di stabilità di 2 mesi** — si memorizzano solo i mesi più vecchi di due, gli snapshot dentro la finestra
  vengono ignorati in lettura e cancellati in scrittura, e il seme si cerca all'indietro fino a 12 mesi. Gli ultimi due
  mesi si ricalcolano sempre dal vivo, quindi una transazione che arriva in ritardo si riflette subito.
  Verifica: `pnpm lint` pulito, `pnpm test` 80 file / 548 test verdi.
- 2026-07-21: **F3 implementata** — `/app/plan` come sezione nuova affiancata a Budget, che resta intatta: route,
  voce di navigazione, `plan-view.tsx` come contenitore e figli presentazionali in `src/components/banking/plan/`.
  Header con Ready to Assign, navigazione mesi e popover di scomposizione; griglia Category/Assigned/Activity/Available
  con gruppi collassabili, editing inline da tastiera (Invio conferma, Escape annulla), riga *Non pianificato*,
  inspector del bucket con move money, sheet delle transazioni del mese, layout a card su mobile. Con `truncated: true`
  la griglia non viene renderizzata affatto: compare solo l'avviso con l'azione di ricalcolo, così nessun totale
  parziale può essere scambiato per completo. Aggiunte lato backend, additive: `getActivePlan`, la `breakdown` in
  `getPlanMonth` e `listPlanBucketTransactions`. 74 chiavi i18n presenti in entrambi i cataloghi.
  In revisione ho aggiunto l'asserzione che la scomposizione riconcili esattamente con Ready to Assign
  (`carry + activity − assigned − |cash overspending|`), verificata su tre mesi consecutivi.
  Verifica: `pnpm lint` pulito, `pnpm test` 80 file / 550 test verdi, `pnpm build` verde.
- 2026-07-21: **tre difetti trovati dall'utente al primo uso reale di `/app/plan`** e corretti.
  (1) *Correttezza*: la prima correzione sottraeva dai saldi correnti i movimenti già contabilizzati per produrre
  `openingCarryMinor`, evitando il doppio conteggio del mese di creazione. L'ancoraggio successivo ai saldi osservati
  ha eliminato del tutto campo e helper: il mese corrente usa direttamente la somma dei saldi, mentre i mesi passati
  applicano i movimenti all'indietro. Il test continua a calcolare l'atteso **dai numeri della fixture**, perché
  l'invariante `liquidità = Σ disponibile + RTA` da solo è autoreferenziale e non prova che la liquidità sia corretta.
  (2) *Chiarezza*: un Ready to Assign negativo mostrava sempre «assegnato in eccesso» anche con tutta la colonna
  Assegnato a zero, cioè un consiglio inattuabile. Ora le due cause hanno messaggi distinti.
  (3) *Semantica*: un bucket con assegnato e carry a zero e attività negativa non è overspending, non è mai stato
  finanziato — nuovo stato «spesa non finanziata», classificato in `plan-status.ts` e condiviso da griglia,
  card mobile e inspector.
  Verifica: `pnpm lint` pulito, `pnpm test` 80 file / 551 test verdi, `pnpm build` verde.
- 2026-07-21: **§3.4b implementata** — il ricalcolo aveva portato l'RTA dell'utente da −6202,89 a −1386,19 con riporto
  898,06, ma la riga «Attività del mese» valeva −2284,25: non era il totale della colonna Attività, era tutto il
  movimento non addebitato ai bucket, e nascondeva il denaro uscito dal perimetro. Ora il movimento è scomposto in
  `bucketActivity + internal + transferNet + income` (income come residuo, così l'identità resta esatta), le rate e i
  giroconti verso conti esclusi compaiono come righe informative «Fuori dal piano» che **non** entrano in
  `Σ available`, la scomposizione dell'header è rinominata e ampliata, e `createPlan` restituisce i conti scartati con
  la ragione invece di ignorarli in silenzio, con avviso in UI e popover del perimetro.
  Il test di regressione prova il punto non ovvio: un giroconto tra due conti **del piano** si annulla da solo nella
  somma dei movimenti, mentre quello verso un conto escluso resta come residuo — quindi non serve risolvere la
  controparte di ogni transfer. Verifica: `pnpm lint` pulito, `pnpm test` 81 file / 555 test verdi, `pnpm build` verde.
- 2026-07-21: **liquidità ancorata ai saldi osservati** — il mese corrente usa `preferredBalance` per ogni conto e
  `planLiquidityMinor` per il clamp CARD; i mesi passati sottraggono dal saldo corrente i movimenti successivi con le
  stesse scansioni mensili indicizzate e un limite di 12 mesi. Eliminati `plans.openingCarryMinor` e
  `planOpeningCarry.ts`; `recalculatePlan` ora rigenera solo gli snapshot. La breakdown deriva dalla variazione di
  liquidità osservata e continua a riconciliare al centesimo.
- 2026-07-22: **F5 implementata** — viste filtro (`plan-filters.ts`: tutte, sotto-finanziate, in rosso, target in pausa,
  con disponibilità, nascoste) con le sezioni fuori piano, le riserve carta e i totali visibili solo nella vista
  completa, perché sono verità del mese intero e non della domanda che la vista sta ponendo; **Edit Plan**
  (`plan-edit-mode.tsx`) con drag-and-drop `@dnd-kit` dentro e fra i gruppi, handle raggiungibile da tastiera,
  selezione multipla con azioni bulk (sposta nel gruppo, nascondi, mostra, elimina), rinomina inline, creazione di
  gruppi e categorie; **selettore di piano** (`plan-switcher.tsx`) con cambio piano, rinomina ed eliminazione.
  Backend: nuova query `listPlans`, `hidden` esposto su bucket e gruppi da `getPlanMonth`, feature
  `plan.multiplePlans` con il gate **applicato dentro `createPlan`** e non solo in UI. Un piano nuovo diventa subito
  quello attivo, altrimenti crearlo sembra non fare nulla. Verifica: `pnpm lint` pulito, `pnpm test` 83 file /
  602 test verdi, `pnpm build` ok.
  Corretto in revisione un difetto del drag: `handleDragOver` calcolava la posizione di partenza dallo snapshot di
  render invece che dallo stato corrente dell'updater, e dnd-kit emette drag-over molte volte fra un render e l'altro,
  quindi un indice stantio avrebbe spostato il bucket sbagliato.

**Nascondere è una scelta di vista, non di contabilità.** Un bucket nascosto resta nel payload e continua a contare
nei totali del mese e in Ready to Assign: i suoi soldi esistono ancora. Il test in `convex/plan-read.test.ts` lo fissa
su valori assoluti (RTA 6.000 prima e dopo l'hide), non sulla sola coerenza interna, perché un'asserzione
auto-referenziale su questo modello è già passata una volta lasciando passare un doppio conteggio.

- 2026-07-22: **F6a implementata** — `convex/banking/planSnapshotInvalidation.ts` con un solo helper
  `invalidatePlanSnapshots(ctx, userId, dates)`, chiamato da tutti i percorsi di scrittura delle transazioni. Prende
  il mese **più vecchio** fra le date toccate e, se cade nella finestra di stabilità, esce **senza leggere nulla**:
  è il caso comune e deve restare gratuito. Altrimenti cancella gli snapshot da quel mese in poi per tutti i piani
  dell'utente, senza filtrare per perimetro dei conti — cancellare uno snapshot di troppo è innocuo, saltarne uno no.
  Cancellare invece di ricalcolare tiene l'invalidazione O(mesi stantii) e non può lasciare una cache mezza scritta.
  I percorsi che scrivono solo tag, note o `hiddenFromReports` (`transactionMeta.ts`) sono esclusi di proposito:
  `isPlanActivityEligible` non legge nessuno di quei campi. Verifica: `pnpm lint` pulito, `pnpm test` 83 file /
  605 test verdi, `pnpm build` ok.
  Corretto in revisione il modo in cui la prima stesura evitava la doppia invalidazione: passava un array mutabile
  come out-param attraverso `transferCandidates` fino a `transferCore` e decideva con `affectedDates === undefined`.
  Ora i due punti del transfer invalidano sempre. Una seconda invalidazione costa una lettura indicizzata e non
  cancella nulla, mentre un flag propagato fra tre moduli è un modo silenzioso di saltarla.

- 2026-07-22: **F6b implementata** — i consumatori backend passano dal read model del piano invece che da `budgets`,
  che resta in piedi con la sua sezione finché non arriva la migrazione. Notifiche: un alert per bucket visibile e non
  snoozed dell'ultimo piano attivo, con `percent = speso / (carryIn + assegnato)` e dedupe semantico
  `plan:{planId}:{period}:{bucketId}:{threshold}` — la vecchia chiave conteneva l'id della riga budget, quindi dopo la
  migrazione avrebbe rispedito alert già visti. Un utente senza piano viene saltato, non fa errore. Analyst: lettura
  `getPlanWithProgress`, scrittura `setPlanAssigned` e `setPlanTarget`, entrambe **approval-gated** come prima e con
  guardia sulla valuta del piano; il bucket si risolve per nome e un nome ambiguo o inesistente solleva. Export: le sei
  tabelle del piano recuperabili, versione portata a 2, `planMonthSnapshots` esclusa perché è cache derivata.
  `cleanupDeletedCategory` smappa la categoria dai bucket senza eliminarli. Verifica: `pnpm lint` pulito,
  `pnpm test` 83 file / 609 test verdi, `pnpm build` ok.
  Fuori dall'elenco richiesto ma giustificati: `setAssignedForUser`/`setTargetForUser` estratti da `plan.ts` perché
  l'Analyst condividesse la logica invece di copiarla, `activePlanForUser` estratto da `planRead.ts` per la ricerca
  che non deve lanciare, e gli indici `by_userId` sulle tabelle del piano, che servono all'export paginato per utente.

- 2026-07-22: **F6c implementata** — Dashboard e Reports staccati dal modello legacy. Il grafico del Dashboard legge
  i bucket del piano attivo (`funded = carryIn + assegnato`, `speso = |activity negativa|`, `resta = disponibile`) e
  li ordina per significato — prima gli scoperti, poi i sotto-finanziati, poi per importo finanziato — invece di
  troncare la lista in ordine arbitrario; il tie-break sul nome rende l'ordine deterministico. Reports raggruppa per
  gruppo di piano con **chiave sull'ID del gruppo**, non sul nome: rinominare un gruppo non spezza né fonde lo storico.
  Categorie non mappate, bucket *Non pianificato* e transazioni senza categoria restano sulla chiave `uncategorized`
  invariata, così i report salvati continuano a risolvere. Il lookup del piano si carica **solo** quando il
  raggruppamento è `categoryGroup`. Per gli utenti senza piano resta la vecchia risalita di `parentCategoryId`, che
  sparirà insieme al campo. Verifica: `pnpm lint` pulito, `pnpm test` 83 file / 612 test verdi, `pnpm build` ok.

- 2026-07-22: **migrazione eseguita sui dati reali** — 15 budget convertiti in assegnazioni (11 luglio, 3 agosto,
  1 settembre), zero scarti, tabella svuotata. Corretto prima dell'esecuzione un difetto della prima stesura:
  cancellava anche le righe non convertibili perché la categoria non era mappata a un bucket, che invece tornano
  convertibili appena la si mappa. Solo i motivi che non cambiano mai — valuta diversa, periodo precedente all'inizio
  del piano — giustificano la cancellazione.
- 2026-07-22: **F6d implementata** — rimossi `budgets`, `parentCategoryId`, la sezione `/app/budgets` e la voce di
  navigazione; le funzioni delle categorie sono migrate in `convex/banking/categories.ts`, le regole di
  categorizzazione in Impostazioni. Export a versione 3. Docs utente riscritte da Budget a Plan in en e it, ADR
  `0009-zero-based-plan.md`. Verifica: `pnpm lint` pulito, `pnpm test` 83 file / 610 test verdi, `pnpm build` ok e
  `npx convex dev --once` accettato — che è la prova che lo schema senza `budgets` gira davvero.
  In revisione sono emersi tre difetti. **Le notifiche già salvate contengono la chiave i18n con cui sono state
  scritte**: cancellare `notifications.budget.*` faceva esplodere la campanella su `undefined`. Ora `interpolate`
  degrada invece di lanciare — una traduzione mancante è un neo, non un motivo per abbattere la pagina — e le chiavi
  vecchie restano finché quelle righe non invecchiano. Il Sankey risaliva ancora `parentCategoryId` per il secondo
  livello: logica morta, rimossa, perché la gerarchia ora la esprimono i gruppi del piano. E il test di invariante
  sugli argomenti delle funzioni pubbliche dava un falso positivo quando `args:` nomina un validatore invece di
  scriverlo inline: il parser finiva dentro il corpo dell'handler e leggeva il suo `userId: user.id` come argomento
  del client. Ora risolve il validatore per nome, così l'invariante resta vera invece di essere aggirata.

- 2026-07-22: **categorie nate dopo il piano** — trovato in uso reale: `createCategory` non creava alcun bucket,
  quindi una categoria creata da Impostazioni finiva in *Non pianificato* (34 categorie, 26 mappate). Ora
  `ensurePlanBucketForCategory` le aggancia al piano attivo nel gruppo curato corrispondente, ed è idempotente.
  Per recuperare quelle già orfane un unico dialogo, richiamato dalla riga *Non pianificato* e da Modifica piano,
  le mette in un bucket esistente o dà loro un bucket proprio. `mapCategoriesToBucket` **sostituisce** l'insieme
  delle categorie del bucket, quindi il dialogo passa le esistenti più la nuova: un test fissa che le altre
  restino. Corretto in revisione: il dialogo offriva anche `Salary`, perché elencava tutte le categorie non
  mappate senza applicare il filtro `budgetEligible` che il percorso automatico applica — le due strade devono
  rispondere alla stessa regola, altrimenti la manuale crea ciò che l'automatica rifiuta.

### Nota su F3b — quando una riga è in rosso, il messaggio parla dello scoperto

Precedenza dei messaggi della barra, decisa il 2026-07-21: **superato → sotto-finanziato con scadenza →
sotto-finanziato → interamente speso → finanziato**. Su una riga in rosso non si mostra la distanza dal target,
perché i due numeri divergono: con target 100 e spesa 300, «mancano 100» sarebbe un consiglio sbagliato quando per
uscire dal rosso ne servono 300. È anche la scelta di YNAB, che in quel caso scrive «Overspent. X of Y».

### Nota su F4 — il carry si sottrae una volta sola

La formula scritta in §3.5, `underfunded = max(0, needed − assigned − carry)`, sottraeva il carry **due volte**
per i comportamenti `refill` e `balanceBy`, che lo contano già dentro `needed`. Forma corretta, implementata:

```
needed(refill)     = max(0, amount − carryIn)
needed(balanceBy)  = max(0, amount − carryIn) / mesi rimanenti
underfunded        = max(0, needed − assigned)          // 0 se snoozed
```

### Doppio conteggio del saldo carta (trovato in uso reale, 2026-07-21)

Il drill-down ha mostrato che la riga «Rate e finanziamenti» da −2905,64 € conteneva un
`PAGAMENTO PER UTILIZZO CARTE DI CREDITO` da −2031,93 €. Quel movimento **non deve** ridurre la liquidità del piano:
gli acquisti che ripaga sono già addebitati ai bucket, e il debito della carta è già sottratto dalla liquidità
(§3.4, clamp `min(0, saldo)`). Contarlo di nuovo sottraeva lo stesso debito due volte.

Correzione definitiva: il mese corrente legge i saldi. Il pagamento riduce il conto corrente e aumenta il saldo della
carta dello stesso importo, quindi la somma non cambia anche se la transazione è `internal`, non ha usage cycle e non
esiste una contro-riga importata sulla carta. `planCardSettlements.ts` resta solo per migliorare il cammino all'indietro
dei mesi passati quando Tracky conosce il ciclo ma il provider espone un'unica gamba cash; non definisce più la
liquidità corrente. Le rate di mutuo o finanziamento, prive di ciclo carta, continuano a spiegare un'uscita reale.

La regressione decisiva contiene carta e conto corrente nel piano, acquisto categorizzato, pagamento estratto non
collegato e nessuna contro-transazione: l'atteso è calcolato direttamente dai saldi fixture, non dal read model.

## 6. Limiti noti e rischi

1. **Un bucket unisce, non spezza.** Se un piano vuole più granularità di quanta ne offre la tassonomia globale,
   serve creare la categoria globale e ricategorizzare. Da spiegare in UI al momento del mapping.
2. **Doppio livello percepito.** Mitigato dal default 1:1 e dalla creazione contestuale della categoria globale;
   il mapping many→one resta una funzione avanzata dentro l'inspector.
3. **Liquidità e carte — validato il 2026-07-21.** Nessun doppio conteggio: il Plan somma solo i saldi dei conti e non
   sottrae mai facility, piani rateali o cicli di estratto conto, che restano dominio di Planning. Il precedente è già
   nel codice — `dashboard.ts:96-147` salta piani e cicli delle facility collegate a una carta perché
   "a CARD-linked facility is represented entirely by the CARD account balance", e `overdraft.ts:90-107` deriva
   l'utilizzo dal saldo del conto CARD. Un acquisto rateizzato conta come Activity alla data d'acquisto e le rate sono
   riclassificate `internal` (`credit.ts:419-477`), quindi non contano una seconda volta. Unico requisito: il clamp
   `min(0, saldo)` sui conti CARD (§3.4).
4. **Staleness degli snapshot — chiusa il 2026-07-22 (F6a).** Gli ultimi due mesi sono sempre calcolati dal vivo, e le
   modifiche a transazioni più vecchie invalidano la cache tramite `planSnapshotInvalidation.ts`, agganciato a import
   provider, CSV, transazioni manuali (create/update/delete), `setCategory` e le altre riclassificazioni, regole,
   conferma transfer, riclassificazioni del credito, link a subscription, suggerimenti di planning e cleanup categorie.
   `recalculatePlan` resta come rete di sicurezza, non è più il percorso normale.
5. **Piani in valute diverse.** Un piano è mono-valuta; con conti in più valute serve un piano per valuta.
   Nessuna conversione FX, coerente con `docs/decisions/0001-mvp-assumptions.md`.
6. **Categorie archiviate e filtri storici.** `listCategories` esclude le archiviate per default, il che è corretto per
   i picker ma non per i filtri di Reports e Transazioni, che devono poter interrogare lo storico. Quelle due viste
   dovranno passare `includeArchived: true` quando arriverà la UI di archiviazione. F5 ha introdotto l'hide dei bucket,
   che è cosa diversa: vive nel piano e non tocca la tassonomia globale, quindi il problema resta dormiente.
7. **Volume transazioni.** La scansione mensile è indicizzata e paginata, con flag `truncated` esposto: da monitorare
   sopra le ~5.000 transazioni/mese.
8. **Deriva dei mesi passati.** Il mese corrente resta esatto rispetto agli ultimi saldi osservati; un mese passato può
   derivare se, dopo la sua chiusura, mancano movimenti, ci sono duplicati/importi/segni/conto/valuta errati, oppure un
   pagamento carta ha una sola gamba importata e nessun usage cycle collegato. Oltre 12 mesi il read model segnala
   `truncated`. Snapshot di saldo stale o acquisiti in istanti diversi restano un limite della fonte osservata.
