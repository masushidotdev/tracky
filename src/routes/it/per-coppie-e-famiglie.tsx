import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  FaqSection,
  FinalCta,
  FitCheck,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const couplesItFaq: Array<FaqItem> = [
  {
    q: 'Come funziona Tracky per coppie e famiglie se è uno spazio a utente singolo?',
    a: 'Tracky ricava l’identità da una sola sessione e oggi non offre login separati multi-utente. Un unico titolare gestisce un solo Piano familiare sui conti di casa — stessi saldi, stessi bucket e un unico registro attività — che si rivedono insieme allo stesso tavolo invece di riconciliare due fogli diversi.',
  },
  {
    q: 'Come accantoniamo per scuola, assicurazioni e vacanze senza sorprese?',
    a: 'Associate a ciascun obiettivo una money box virtuale con importo e data target, e collegatela al relativo bucket del Piano. Tracky mostra i risparmi idonei come Già accantonato nel Disponibile, così il target chiede solo la parte mancante: una stima che si adegua ogni mese senza doppi accantonamenti.',
  },
  {
    q: 'Cosa succede se una categoria di casa sforna il budget?',
    a: 'Il bucket mostra chiaramente lo sforamento, così decidete insieme invece di indovinare. Spostate il Disponibile da un altro bucket per coprire lo scoperto liquido, oppure finanziate il bucket di pagamento carta se l’acquisto scoperto è passato sulla carta di credito. Se non intervenite, lo scoperto liquido riduce Da assegnare del mese successivo.',
  },
  {
    q: 'Come possiamo iniziare insieme con Tracky?',
    a: 'Aprite la demo ospitata gratuita senza carta, aggiungete i conti manuali di casa nella loro valuta e create un unico Piano con bucket per casa, spesa, scuola, assicurazioni e vacanze. Collegate eventuali risparmi esistenti come money box virtuali e distribuite la liquidità osservata finché Da assegnare arriva a zero.',
  },
];

const householdBuckets = [
  {
    tag: 'Spese fisse',
    tone: 'cobalt' as const,
    title: 'Casa e bollette',
    body: 'Affitto, mutuo e utenze ricorrenti finanziati nel bucket del Piano prima che il mese cominci.',
    foot: 'Collegati alle scadenze datate nel Flusso di cassa per averle sempre in vista.',
  },
  {
    tag: 'Quotidiano',
    tone: 'sage' as const,
    title: 'Spesa e casa',
    body: 'Un bucket condiviso e un unico registro movimenti: controllate il Disponibile prima di fare acquisti.',
    foot: 'Le spese coperte con carta si spostano automaticamente nel bucket pagamento carta.',
  },
  {
    tag: 'Target annuale',
    tone: 'marigold' as const,
    title: 'Scuola e assicurazioni',
    body: 'Impostate un target annuale con data reale. Se saltate un mese, la quota suggerita del mese dopo si aggiorna da sola.',
    foot: 'Abbinabile a una money box virtuale per conteggiare quanto è Già accantonato.',
  },
  {
    tag: 'Fondo dedicato',
    tone: 'vermilion' as const,
    title: 'Vacanze e imprevisti',
    body: 'Accantonate una quota regolare ogni mese in una money box virtuale senza creare un secondo saldo bancario.',
    foot: 'Prenotazioni coperte da liquidità reale, non da stipendi futuri ancora da incassare.',
  },
];

export const Route = createFileRoute('/it/per-coppie-e-famiglie')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budget per coppie e famiglie — Un unico Piano di casa · Tracky',
      description:
        'Gestisci un Piano familiare su saldi osservati, bucket condivisi e money box virtuali per scuola, bollette e vacanze. Spazio singolo, demo €0.',
      locale: 'it',
      path: '/it/per-coppie-e-famiglie',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/per-coppie-e-famiglie', inLanguage: ['it', 'en'] }),
        faqJsonLd(couplesItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Per coppie e famiglie', path: '/it/per-coppie-e-famiglie' },
        ]),
      ],
    }),
  component: CouplesIt,
});

function CouplesIt() {
  const auth = Route.useLoaderData();
  return <CouplesItView auth={auth} />;
}

export function CouplesItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/per-coppie-e-famiglie">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Per coppie e famiglie' }]}
            />

            <ChipRow>
              <Chip tone="cobalt">Un solo Piano familiare</Chip>
              <Chip tone="sage">Money box virtuali</Chip>
              <Chip>Spazio a utente singolo</Chip>
              <Chip tone="marigold">Demo ospitata €0</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Un unico registro di casa. <span className="mka-accent-ink">Gli stessi numeri allo stesso tavolo.</span>
            </h1>

            <p className="mka-hero-dek">
              Quando uno paga l’affitto e l’altro fa la spesa, gli imprevisti arrivano anche se entrambi spendete con
              attenzione. Con Tracky un unico titolare mantiene un solo Piano zero-based di famiglia — stessi saldi
              osservati, stessi bucket e money box virtuali per scuola, assicurazioni e vacanze — da rivedere insieme su
              un’unica schermata chiara.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/funzioni/piano-zero-based">
                Scopri il Piano zero-based →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOUSEHOLD BUCKETS */}
      <Section id="buckets" tone="parchment">
        <SectionHead
          kicker="Struttura familiare"
          title="Quattro bucket chiave al posto dei conti a memoria."
          subtitle="Date un lavoro a ogni euro osservato prima che inizi il mese e preparate le spese annuali con money box virtuali collegate."
        />

        <div className="mka-b1-cards-4">
          {householdBuckets.map((card) => (
            <article className="mka-b1-card" key={card.title}>
              <span className={`mka-b1-card-tag mka-b1-card-tag--${card.tone}`}>{card.tag}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <div className="mka-b1-card-foot">{card.foot}</div>
            </article>
          ))}
        </div>
      </Section>

      {/* 3. HOW A HOUSEHOLD USES TRACKY */}
      <Section id="workflow">
        <SectionHead
          kicker="Lavorare sugli stessi numeri"
          title="Da due punti ciechi a un’unica revisione condivisa."
          subtitle="Il Piano zero-based sostituisce le discussioni a posteriori con scelte esplicite sulla liquidità reale."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Perché due portafogli creano punti ciechi</h3>
            <p>
              L’affitto esce da un conto, la spesa da un altro, ed entrambi stimate a occhio quanto resta davvero libero.
              La retta scolastica arriva a settembre, l’assicurazione auto a marzo e le vacanze si prenotano sulla
              fiducia invece che su fondi già accantonati.
            </p>
            <p>
              Nessuno sta spendendo con leggerezza: manca semplicemente un unico posto in cui la liquidità osservata ha
              già un destino prima che il mese cominci.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Un confronto mensile sui saldi reali</h3>
            <p>
              Le entrate arrivano in <strong>Da assegnare</strong> e vengono distribuite tra casa, spesa, scuola e
              vacanze finché Da assegnare arriva a zero. Collegando una money box virtuale a un bucket del Piano, i
              risparmi già presenti compaiono come <strong>Già accantonato</strong> e il target chiede solo ciò che manca.
            </p>
            <p>
              Se una categoria supera il previsto, l’ammanco è subito visibile: spostate il <strong>Disponibile</strong>{' '}
              da un altro bucket oppure finanziate il bucket di pagamento carta se la spesa è passata su carta di
              credito. Nessuna sorpresa nascosta.
            </p>
          </article>
        </div>
      </Section>

      {/* 4. CANDID FIT CHECK */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Verifica trasparente"
          title="Quando Tracky è adatto a una famiglia — e quando non ancora."
          subtitle="Preferiamo chiarire subito il modello a utente singolo prima che impostiate il vostro spazio di lavoro."
        />

        <FitCheck
          yesTitle="Funziona bene se in casa…"
          yesItems={[
            'Vi sedete insieme una volta a settimana o al mese per rivedere un unico Piano, un unico registro e gli stessi saldi osservati.',
            'Volete finanziare spese annuali (scuola, assicurazioni, imposte) con target datati e money box virtuali collegate.',
            'Usate conti manuali e import CSV nel browser — oppure self-hosting Docker se desiderate il sync bancario PSD2.',
            'Volete regole chiare sulle carte così le spese coperte restano pronte per l’estratto mensile.',
          ]}
          noTitle="Non è ancora adatto se…"
          noItems={[
            'Vi servono login multi-utente separati, permessi individuali o cronologie distinte per partner nello stesso spazio.',
            'Cercate una conversione automatica che unisca conti familiari in EUR e USD in un solo patrimonio aggregato.',
            'Volete sync bancario ospitato pronto all’uso senza self-hosting né chiavi Enable Banking vostre.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="FAQ per famiglie"
        title="Le domande di coppie e famiglie prima di iniziare."
        subtitle="Risposte chiare su accesso singolo, money box virtuali e gestione degli sforamenti."
        items={couplesItFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Guide utili per impostare il Piano di casa."
        items={[
          {
            kicker: 'Funzione',
            title: 'Piano zero-based e target',
            description: 'Target settimanali, mensili, annuali e personalizzati con anteprima Assegnazione automatica.',
            href: '/it/funzioni/piano-zero-based',
            ctaLabel: 'Scopri il Piano →',
          },
          {
            kicker: 'Guida',
            title: 'Guida al budget zero-based',
            description: 'Come assegnare la liquidità osservata fino a zero e gestire i riporti mensili.',
            href: '/it/guide/budget-zero-based',
            ctaLabel: 'Leggi la guida →',
          },
          {
            kicker: 'Prezzi',
            title: 'Demo ospitata €0 vs self-host MIT',
            description: 'Tutto ciò che è incluso gratis oggi senza carta né checkout.',
            href: '/it/prezzi',
            ctaLabel: 'Leggi i prezzi →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Un tavolo. Un Piano. Gli stessi saldi osservati."
        meta="Demo ospitata €0 · Senza carta · Open source MIT"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/domande-frequenti">
            Leggi tutte le FAQ →
          </a>
        }
      />
    </AtelierSite>
  );
}
