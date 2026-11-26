import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { ComparisonRow, FaqItem, MarketingAuth, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  ComparisonTable,
  FaqSection,
  FinalCta,
  FitCheck,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const freelancersItFaq: Array<FaqItem> = [
  {
    q: 'Tracky funziona per freelance e partite IVA con entrate irregolari?',
    a: 'Sì. Poiché Tracky ancora il Piano alla liquidità già osservata nei conti — mai a fatture ancora da incassare — assegni il denaro solo quando il cliente paga davvero. Tieni separati conti lavoro e personali, inserisci le scadenze fiscali come voci pianificate e leggi il Flusso di cassa come stima costruita sugli impegni noti.',
  },
  {
    q: 'Come gestisco tasse, contributi e scadenze F24 in Tracky?',
    a: 'Registri ogni scadenza fiscale come voce pianificata con data, importo e conto di addebito, così pesa subito sul Flusso di cassa e sul Disponibile dopo le spese. Puoi abbinarla a una money box virtuale per tenere traccia della quota tasse accantonata da ogni fattura. Quando paghi, colleghi il movimento reale e la scadenza smette di pesare sulle date future.',
  },
  {
    q: 'Posso importare i CSV della banca ed esportare file puliti per il commercialista?',
    a: 'Sì. Importi gli export bancari in locale nel browser nei conti manuali correnti o carta attivi con mappatura colonne e salto dei duplicati, mantenendo ogni valuta nel proprio conto. Dai Report puoi filtrare per conto lavoro, categoria o tag ed esportare riepiloghi CSV aggregati per valuta, oppure scaricare un backup JSON completo dalle Impostazioni.',
  },
  {
    q: 'Le money box spostano denaro reale e i suggerimenti sulle sottoscrizioni sono garantiti?',
    a: 'No a entrambe le domande. Le money box sono accantonamenti virtuali dentro Tracky: registrano quanto metti da parte senza muovere i saldi bancari, quindi registra o collega il trasferimento reale quando sposti soldi tra conti. Il rilevamento delle sottoscrizioni arriva come suggerimento di cui confermi esercente, importo e cadenza prima di trattarlo come impegno.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Saldi lavoro vs personali',
    demo: { text: 'Un conto unico fa sembrare spendibile l’intera fattura incassata', tone: 'no' },
    selfHost: { text: 'Conti manuali lavoro e personali separati nello stesso spazio', tone: 'yes' },
  },
  {
    capability: 'Scadenze fiscali, IVA e contributi',
    demo: { text: 'Segnate in calendario, ma invisibili nel saldo del conto', tone: 'no' },
    selfHost: { text: 'Voci pianificate nel Flusso di cassa + money box tasse virtuale', tone: 'yes' },
  },
  {
    capability: 'Incassi irregolari dei clienti',
    demo: { text: 'I mesi lenti sembrano emergenze perché gli impegni restano nascosti', tone: 'no' },
    selfHost: { text: 'Il Piano assegna la liquidità reale; Disponibile dopo le spese mostra il ritmo', tone: 'yes' },
  },
  {
    capability: 'Software e strumenti ricorrenti',
    demo: { text: 'I rinnovi annuali degli strumenti arrivano senza preavviso', tone: 'no' },
    selfHost: { text: 'Le sottoscrizioni confermate entrano nel Flusso di cassa con promemoria', tone: 'yes' },
  },
  {
    capability: 'Clienti in più valute (EUR / USD / GBP)',
    demo: { text: 'Export mescolati o stime di cambio manuali', tone: 'no' },
    selfHost: { text: 'Un conto per valuta; totali separati in ogni vista', tone: 'yes' },
  },
  {
    capability: 'Consegna al commercialista',
    demo: { text: 'Estratti conto pieni di spese personali e lavoro mescolati', tone: 'no' },
    selfHost: { text: 'Report CSV aggregati filtrati per conto lavoro ed export JSON completo', tone: 'yes' },
  },
];

const routineSteps: Array<StepItem> = [
  {
    num: 'Passo 01',
    icon: 'import',
    title: 'Separa conti lavoro e personali',
    body: 'Crea conti manuali distinti per attività e vita privata (uno per valuta) e importa i CSV bancari nel browser con controllo duplicati.',
  },
  {
    num: 'Passo 02',
    icon: 'envelopes',
    title: 'Accantona le tasse prima di assegnare',
    body: 'Quando una fattura viene pagata, segna la quota tasse in una money box virtuale e distribuisci il resto nel Piano zero-based finché Da assegnare arriva a zero.',
  },
  {
    num: 'Passo 03',
    icon: 'cashflow',
    title: 'Inserisci le scadenze nel Flusso di cassa',
    body: 'Aggiungi scadenze fiscali, commercialista, affitto e abbonamenti confermati come voci datate per leggere Disponibile dopo le spese e la prima data negativa.',
  },
  {
    num: 'Passo 04',
    icon: 'reports',
    title: 'Riconcilia ed esporta per il commercialista',
    body: 'Collega i pagamenti reali alle scadenze così nulla conta due volte. Filtra i Report per conto lavoro, categoria o tag per esportare CSV aggregati per valuta o backup JSON.',
  },
];

export const Route = createFileRoute('/it/per-freelance-e-partita-iva')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budget per freelance e partita IVA — Lavoro, vita e tasse · Tracky',
      description:
        'Separa conti lavoro e personali, metti le scadenze fiscali nel Flusso di cassa, accantona le tasse in money box virtuali ed esporta Report CSV. Demo €0.',
      locale: 'it',
      path: '/it/per-freelance-e-partita-iva',
      ogImage: ogImageFor('for-freelancers'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/per-freelance-e-partita-iva', inLanguage: ['it', 'en'] }),
        faqJsonLd(freelancersItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Per freelance e partita IVA', path: '/it/per-freelance-e-partita-iva' },
        ]),
      ],
    }),
  component: FreelancersIt,
});

function FreelancersIt() {
  const auth = Route.useLoaderData();
  return <FreelancersItView auth={auth} />;
}

export function FreelancersItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/per-freelance-e-partita-iva">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Per freelance e partita IVA' }]}
            />

            <ChipRow>
              <Chip tone="cobalt">Lavoro e vita separati</Chip>
              <Chip tone="marigold">Tasse nel Flusso di cassa</Chip>
              <Chip tone="sage">Report CSV per valuta</Chip>
              <Chip>Demo ospitata €0</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Entrate irregolari. <span className="mka-accent-ink">Controllo regolare sulla liquidità.</span>
            </h1>

            <p className="mka-hero-dek">
              Quando i clienti pagano a singhiozzo mentre affitto, software e scadenze fiscali arrivano puntuali, un
              saldo unico ti inganna. Tracky tiene separati conti lavoro e personali, mette le scadenze fiscali dentro
              il Flusso di cassa come impegni datati e ti permette di esportare Report CSV puliti per valuta quando
              serve al commercialista.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/funzioni/flusso-di-cassa">
                Come funziona il Flusso di cassa →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MIXED POT VS SPLIT LEDGER */}
      <Section id="comparison" tone="parchment">
        <SectionHead
          kicker="La struttura che manca"
          title="Conto unico mescolato vs registro diviso per freelance."
          subtitle="Un solo spazio di lavoro per vedere il quadro completo, separando conti professionali, accantonamenti fiscali e spese personali."
        />

        <ComparisonTable
          caption="Confronto tra gestire entrate da freelance e spese personali in un conto unico rispetto a Tracky"
          headers={['Punto critico freelance', 'Un solo conto mescolato', 'Registro diviso in Tracky']}
          rows={comparisonRows}
        />
      </Section>

      {/* 3. FOUR-STEP WEEKLY ROUTINE */}
      <Section id="routine">
        <SectionHead
          kicker="Routine settimanale"
          title="Quattro passi dall’incasso della fattura a un disponibile chiaro."
          subtitle="Tracky non conta mai fatture non pagate come liquidità: ogni passo parte dai saldi osservati e dagli impegni registrati."
        />

        <StepCards steps={routineSteps} />
      </Section>

      {/* 4. EDITORIAL DETAILS + FIT CHECK */}
      <Section id="details" tone="parchment">
        <SectionHead
          kicker="Confini chiari"
          title="Perché separazione dei conti, riserve virtuali e stime trasparenti fanno la differenza."
          subtitle="Tracky è uno strumento di budget personale e flusso di cassa, non un gestionale di fatturazione né un commercialista: ecco dove dà il meglio."
        />

        <div className="mka-editorial-grid" style={{ marginBottom: '2rem' }}>
          <article className="mka-editorial-card">
            <h3>Perché le entrate irregolari mettono in crisi un conto unico</h3>
            <p>
              Quando una fattura importante entra sullo stesso conto da cui paghi la spesa, il saldo sembra comodo fino
              al giorno in cui arrivano saldi, acconti o rinnovi annuali. I mesi più scarichi sembrano emergenze anche
              quando il bilancio annuo è solido.
            </p>
            <p>
              Separare i conti manuali lavoro e vita — e inserire le scadenze fiscali come voci pianificate nel Flusso
              di cassa — mostra quanto è davvero libero dopo gli impegni. Ricorda sempre che le proiezioni sono stime
              costruite dai dati registrati, mai garanzie.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Riserve virtuali, tag ed export per il commercialista</h3>
            <p>
              Usa una money box virtuale per seguire la quota tasse accantonata da ogni fattura incassata senza
              duplicare i saldi bancari; quando sposti davvero denaro verso un conto deposito fiscale, collega il
              trasferimento reale. Etichetta le spese professionali (fino a 10 tag colorati per movimento) e usa le note
              private per i riferimenti fattura.
            </p>
            <p>
              Quando servono i riepiloghi per il commercialista, filtra i <strong>Report</strong> sui conti lavoro ed
              esporta CSV aggregati per valuta (con separatore virgola o punto e virgola adatto alla lingua), oppure
              scarica un backup JSON completo dalle <strong>Impostazioni</strong>.
            </p>
          </article>
        </div>

        <FitCheck
          yesTitle="Adatto a freelance e partite IVA che…"
          yesItems={[
            'Vogliono tenere separati conti lavoro, scadenze fiscali e bucket personali zero-based in un solo spazio.',
            'Fatturano in EUR, USD o altre valute e vogliono totali distinti per valuta senza cambi inventati.',
            'Preferiscono import CSV nel browser oppure self-hosting Docker con sync Enable Banking opzionale.',
          ]}
          noTitle="Non sostituisce…"
          noItems={[
            'Software di fatturazione elettronica, gestione IVA o contabilità ordinaria/forfettaria ufficiale.',
            'Consulenza fiscale o finanziaria: verifica sempre imposte e scadenze con il tuo commercialista.',
            'Strumenti multi-utente con login separati per soci o studio contabile.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="FAQ per freelance"
        title="Domande su entrate irregolari, tasse ed export."
        subtitle="Risposte dirette allineate alle funzioni rilasciate in v0.1.0."
        items={freelancersItFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Gli strumenti per tenere leggibile la cassa da freelance."
        items={[
          {
            kicker: 'Funzione',
            title: 'Flusso di cassa e Disponibile dopo le spese',
            description: 'Metti in fila scadenze fiscali, affitto e rinnovi confermati sopra i saldi osservati.',
            href: '/it/funzioni/flusso-di-cassa',
            ctaLabel: 'Scopri il Flusso di cassa →',
          },
          {
            kicker: 'Funzione',
            title: 'Report ed export CSV per valuta',
            description: 'Filtra per conto lavoro, categoria o tag e salva fino a 20 viste riutilizzabili.',
            href: '/it/funzioni/report',
            ctaLabel: 'Scopri i Report →',
          },
          {
            kicker: 'Confronto',
            title: 'Tracky vs fogli di calcolo',
            description: 'Mantieni import ed export CSV senza riparare formule fragili in Excel.',
            href: '/it/vs-fogli-di-calcolo',
            ctaLabel: 'Leggi il confronto →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Fattura, accantona le tasse e vedi cosa puoi spendere davvero."
        meta="Demo ospitata €0 · Senza carta · Open source MIT"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/prezzi">
            Vedi prezzi e self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
