import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  FinalCta,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B1ArticleEntry,
  B1ArticleFaqList,
  B1Figure,
  RelatedLinksSection,
} from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { SITE_ORIGIN } from '@/lib/marketing/pages';
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  buildMarketingHead,
  faqJsonLd,
  ogImageFor,
  softwareAppJsonLd,
} from '@/lib/marketing/seo';

const RELEASE_URL = 'https://github.com/masushidotdev/tracky/releases/tag/v0.1.0';
const REPO_URL = 'https://github.com/masushidotdev/tracky';
const CHANGELOG_URL = 'https://github.com/masushidotdev/tracky/blob/main/CHANGELOG.md';
const PUBLISH_DATE = '2026-11-24';
const BLOG_IMAGE_BASE = `${SITE_ORIGIN}/blog/tracky-v0-1-0`;

type HighlightFigure = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

type HighlightItem = {
  num: string;
  title: string;
  body: string;
  figures?: Array<HighlightFigure>;
};

const highlights: Array<HighlightItem> = [
  {
    num: '01',
    title: 'Piano zero-based, target e bucket per le carte',
    body: 'I vecchi budget per categoria diventano un Piano zero-based completo con Da assegnare, Assegnato, Attività e Disponibile. Hai viste mirate (sottofinanziati, sforati, target rimandati, denaro disponibile, nascosti), la modalità Modifica piano con riordino via drag-and-drop o tastiera, target settimanali, mensili, annuali o personalizzati e Auto-Assegnazione con anteprima prima della conferma. Le carte di credito vivono in un gruppo dedicato Pagamenti carte: le spese coperte si spostano nel bucket di pagamento della carta invece di ridurre Da assegnare. È presente anche il selettore multi-piano (più di un piano è riservato a Pro).',
    figures: [
      {
        src: `${BLOG_IMAGE_BASE}/og-feature-plan.png`,
        alt: 'Il Plan a base zero di Tracky',
        caption: 'Il Plan a base zero di Tracky',
        width: 1200,
        height: 630,
      },
    ],
  },
  {
    num: '02',
    title: 'Mutui, prestiti e saldi trasparenti',
    body: 'Aggiungi conto parte ora dal tipo di conto: liquidità, carta di credito, mutuo, prestito auto o prestito personale. Ogni finanziamento ha una pagina dedicata con grafico di estinzione, avanzamento del rimborso, data di scadenza contrattuale facoltativa, categoria del Piano abbinata e storico dei pagamenti — instradato sul conto di addebito nel Flusso di cassa e contato una sola volta nel patrimonio netto. Accanto trovi conti manuali in contanti, carte manuali con regolamento dell’estratto e conti asset (risparmi, investimenti, beni). Il fido concesso non gonfia più i saldi: Tracky usa ovunque la posizione contabile e mostra il fido disponibile separatamente.',
  },
  {
    num: '03',
    title: 'Movimenti, import CSV nel browser, Flusso di cassa, Report e Obiettivi',
    body: 'Il registro movimenti introduce un unico filtro rapido, ordinamento su tutte le colonne fino ai 5.000 movimenti più recenti (segnalando quando il limite viene superato), barra inferiore per le azioni massive, fascia collassabile dei Movimenti programmati, inserimento inline, fino a 10 tag colorati per riga e note private. Per i conti manuali, l’import CSV avviene nel browser con mappatura guidata delle colonne, badge su duplicati ed errori, regole automatiche di categoria e re-import idempotenti. Completano il giro quotidiano Safe-to-spend per valuta, Flusso di cassa stile estratto conto con promemoria scadenze deduplicati, Report con grafici Sankey/ripartizione/andamento ed export CSV, e Obiettivi con calcolatore estinzione debiti (valanga, palla di neve o ordine pianificato). Le previsioni multi-scenario in Forecast restano nel piano Pro riservato e si leggono sempre come stime.',
    figures: [
      {
        src: `${BLOG_IMAGE_BASE}/import-mapping.png`,
        alt: 'Import CSV: mappa le colonne (dati demo)',
        caption: 'Import CSV: mappa le colonne (dati demo)',
        width: 1440,
        height: 800,
      },
      {
        src: `${BLOG_IMAGE_BASE}/import-preview.png`,
        alt: "Anteprima prima dell'import; i duplicati sono segnalati (dati demo)",
        caption: "Anteprima prima dell'import; i duplicati sono segnalati (dati demo)",
        width: 1440,
        height: 800,
      },
    ],
  },
  {
    num: '04',
    title: 'Analyst AI opzionale e livello consultivo calibrato',
    body: 'L’Analyst AI resta spento per impostazione predefinita dietro VITE_ANALYST_ENABLED=true ed è disabilitato nella demo ospitata. Se lo attivi sulla tua installazione self-hosted, ottieni conversazioni persistenti su Convex, strumenti di lettura reali sui tuoi dati, grafici e tabelle, approvazione esplicita in chat prima di ogni modifica sensibile e un canale Telegram bidirezionale opzionale. Un livello consultivo con limiti stretti (jev) aiuta nel matching dei giroconti, nel triage degli import CSV e nel monitoraggio degli abbonamenti con soglie di confidenza, tetti di spesa giornalieri e fallback deterministici. È uno strumento di esplorazione, mai consulenza finanziaria.',
  },
  {
    num: '05',
    title: 'Cancellazione immediata dell’account, analytics opt-in e sicurezza',
    body: 'Eliminare l’account dalle Impostazioni avvia ora una cancellazione immediata e irreversibile: prima puoi scaricare un export JSON completo, l’avanzamento lato server prosegue anche chiudendo il browser, i consensi bancari vengono revocati in best-effort e l’accesso WorkOS viene rimosso per ultimo. Analytics ed error tracking usano PostHog EU solo lato client, attivati unicamente dopo un clic esplicito su Accetta e disattivabili in qualsiasi momento dalle Impostazioni, senza inviare importi né nomi dei conti. Sul fronte sicurezza, v0.1.0 elimina tutte le Convex Node action applicative a favore di Web Crypto RS256 e fetch nativa nel runtime standard, verifica le firme dei webhook Resend prima di elaborarli, irrigidisce gli header HTTP anti-framing, neutralizza la formula injection negli export CSV dei report e richiede Node >=22.23.4 <23.',
  },
];

export const releaseV010ItFaq: Array<FaqItem> = [
  {
    q: 'Qual è la differenza tra la demo ospitata e il self-hosting di v0.1.0?',
    a: 'Entrambi eseguono lo stesso codice con licenza MIT. La demo ospitata su trytracky.app costa €0, senza carta e senza checkout, e include conti manuali, import CSV nel browser, Piano zero-based, Flusso di cassa, Report, Obiettivi e salvadanai virtuali. Sync bancaria e Analyst AI restano disabilitati sulla demo ospitata: li attivi sul tuo deployment con le tue chiavi.',
  },
  {
    q: 'La sincronizzazione bancaria è attiva di default?',
    a: 'No. La sync PSD2 passa da Enable Banking usando la tua app e le tue chiavi su un’istanza self-hosted. Nella demo ospitata — e ovunque Enable Banking non sia configurato — il pulsante di collegamento resta disabilitato e conti manuali più import CSV coprono l’intero flusso.',
  },
  {
    q: 'Posso acquistare il piano Pro nella v0.1.0?',
    a: 'No. Il piano Pro esiste nel codice per limiti giornalieri più alti dell’Analyst (100 messaggi invece di 20), piani multipli e scenari di previsione di lungo periodo, ma non esiste ancora alcuna fatturazione né alcuna pagina di checkout.',
  },
  {
    q: 'Cosa serve per installare Tracky v0.1.0 in self-hosting?',
    a: 'Servono Node.js (>=22.23.4 <23) e npm, un tuo account Convex e un tuo ambiente WorkOS AuthKit. Enable Banking, AI Gateway, Resend e Telegram sono tutti opzionali. Clona il repo, esegui npm ci, copia .env.example in .env.local, inizializza Convex con npx convex dev e avvia con npm run dev.',
  },
];

export const Route = createFileRoute('/it/blog/tracky-v0-1-0')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Tracky v0.1.0 — Primo rilascio pubblico open source';
    const description =
      'Tracky v0.1.0 esce con licenza MIT: Piano zero-based, mutui e prestiti, import CSV nel browser, Flusso di cassa, Report, cancellazione immediata e sicurezza.';
    const url = 'https://www.trytracky.app/it/blog/tracky-v0-1-0';
    const image = ogImageFor('blog-v0-1-0');

    return buildMarketingHead({
      title,
      description,
      locale: 'it',
      path: '/it/blog/tracky-v0-1-0',
      ogImage: image,
      jsonLd: [
        softwareAppJsonLd({ url, inLanguage: ['it', 'en'] }),
        blogPostingJsonLd({
          headline: title,
          description,
          url,
          image,
          datePublished: PUBLISH_DATE,
          dateModified: PUBLISH_DATE,
          inLanguage: 'it',
        }),
        faqJsonLd(releaseV010ItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Tracky v0.1.0', path: '/it/blog/tracky-v0-1-0' },
        ]),
      ],
    });
  },
  component: ReleaseV010It,
});

function ReleaseV010It() {
  const auth = Route.useLoaderData();
  return <ReleaseV010ItView auth={auth} />;
}

export function ReleaseV010ItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/blog/tracky-v0-1-0">
      <article>
        {/* 1. ARTICLE HERO */}
        <header className="mka-hero mka-hero--page">
          <div className="mka-container">
            <div className="mka-hero-single">
              <Breadcrumb
                ariaLabel="Percorso di navigazione"
                items={[{ label: 'Home', href: `${SITE_ORIGIN}/it/` }, { label: 'Tracky v0.1.0' }]}
              />

              <ChipRow>
                <Chip tone="cobalt">Note di rilascio</Chip>
                <Chip tone="marigold">v0.1.0</Chip>
                <time className="mka-stamp" dateTime={PUBLISH_DATE}>
                  24 nov 2026
                </time>
                <Chip tone="sage">Licenza MIT</Chip>
              </ChipRow>

              <h1 className="mka-hero-headline">
                Tracky <span className="mka-accent-ink">v0.1.0</span> è fuori.
              </h1>

              <p className="mka-hero-dek">
                Primo rilascio pubblico taggato di Tracky, pubblicato il <strong>24 novembre 2026</strong> con licenza
                MIT. Un punto fermo leggibile dal primo commit pubblico fino alla PR #64 — prova la demo gratis o
                eseguilo sul tuo server.
              </p>

              <aside aria-label="Collegamenti del rilascio" className="mka-hero-actions">
                <a className="mka-btn-primary mka-btn-primary--lg" href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                  Release v0.1.0 su GitHub ↗
                </a>
                <a className="mka-btn-secondary" href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
                  Leggi CHANGELOG.md ↗
                </a>
              </aside>
            </div>
          </div>
        </header>

        {/* 2. INTRO */}
        <Section tone="parchment">
          <div className="mka-b1-prose">
            <p>
              Tracky è pubblico su GitHub dal 15 settembre 2026. Oggi abbiamo taggato{' '}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                v0.1.0
              </a>{' '}
              come prima versione semantica: raccoglie tutto il lavoro dal primo commit pubblico (<code>654561d</code>)
              fino alla PR #64 in un riferimento stabile che puoi leggere, fissare ed eseguire.
            </p>
            <p>
              Se incontri Tracky per la prima volta: è un tracker per le finanze personali con licenza MIT costruito su
              Convex, TanStack Start e WorkOS AuthKit. Puoi provare la{' '}
              <a href={`${SITE_ORIGIN}/it/prezzi`}>demo ospitata gratuita</a> su <code>trytracky.app/it/</code> con
              conti manuali e import CSV nel browser, oppure clonare{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                masushidotdev/tracky
              </a>{' '}
              e gestire la tua istanza con le tue chiavi.
            </p>
            <p>
              Qui sotto trovi i blocchi principali arrivati nella v0.1.0. Per l’elenco completo di correzioni, dipendenze
              e pull request puoi leggere il{' '}
              <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
                CHANGELOG.md
              </a>{' '}
              o le{' '}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                note di rilascio su GitHub
              </a>
              .
            </p>
          </div>
        </Section>

        {/* 3. HIGHLIGHTS + FIGURES */}
        <Section id="highlights">
          <SectionHead
            kicker="Novità del rilascio"
            title="Cosa c’è nella v0.1.0"
            subtitle="Cinque aree arrivate a un riferimento coerente e documentato nel primo rilascio taggato."
          />

          <div className="mka-b1-article-stack">
            {highlights.map((item) => (
              <React.Fragment key={item.num}>
                <B1ArticleEntry num={item.num} title={item.title}>
                  <p>{item.body}</p>
                </B1ArticleEntry>
                {item.figures?.map((figure) => (
                  <B1Figure
                    key={figure.src}
                    src={figure.src}
                    alt={figure.alt}
                    caption={figure.caption}
                    width={figure.width}
                    height={figure.height}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </Section>

        {/* 4. HOSTED DEMO VS SELF-HOST + RUNNING YOUR OWN INSTANCE */}
        <Section id="deployment" tone="parchment">
          <SectionHead
            kicker="Confini di esecuzione"
            title="Demo ospitata vs. self-host"
            subtitle="Entrambi girano sullo stesso codice MIT, con confini chiari su cosa è attivo dove. Nulla nella v0.1.0 è dietro un checkout e le funzioni Pro restano riservate nel codice finché non esisterà una fatturazione."
          />

          <div className="mka-deploy-grid" style={{ marginBottom: '2.5rem' }}>
            <div className="mka-deploy-card">
              <div className="mka-deploy-head">
                <div>
                  <h3>Demo ospitata (€0)</h3>
                  <p className="mka-deploy-sub">Pronta su trytracky.app</p>
                </div>
                <Chip tone="marigold">Senza carta</Chip>
              </div>
              <ul className="mka-check-list">
                <li>Piano zero-based, Flusso di cassa, Report, Obiettivi</li>
                <li>Conti manuali: liquidità, carte, asset e prestiti</li>
                <li>Import CSV nel browser con anteprima</li>
                <li>Senza carta, senza prova, nessun checkout</li>
              </ul>
            </div>

            <div className="mka-deploy-card">
              <div className="mka-deploy-head">
                <div>
                  <h3>Self-host (MIT)</h3>
                  <p className="mka-deploy-sub">Il tuo server, le tue chiavi</p>
                </div>
                <Chip tone="cobalt">Open source</Chip>
              </div>
              <ul className="mka-check-list">
                <li>Il tuo deployment Convex + WorkOS AuthKit</li>
                <li>Sync bancaria PSD2 opzionale (chiavi Enable Banking)</li>
                <li>Analyst AI, email Resend e Bot Telegram opzionali</li>
                <li>Codice completo + guide utente EN/IT nel repo</li>
              </ul>
            </div>
          </div>

          <div className="mka-b1-prose">
            <h2 className="mka-section-title" style={{ marginBottom: '1rem' }}>
              Avviare la tua istanza
            </h2>
            <p>
              Al tag v0.1.0, Tracky si avvia con Node.js (<code>&gt;=22.23.4 &lt;23</code>), npm, un tuo deployment
              Convex e un tuo progetto WorkOS AuthKit. Clona il repository, lancia <code>npm ci</code>, copia{' '}
              <code>.env.example</code> in <code>.env.local</code> (riferimento corretto dalla PR #64), esegui{' '}
              <code>npx convex dev</code> e parti in locale con <code>npm run dev</code>.
            </p>
            <p>
              <strong>Aggiornamento (26 nov 2026):</strong> il self-hosting con Docker Compose e backend Convex locale è
              poi arrivato su <code>main</code> — leggi la{' '}
              <a href={`${SITE_ORIGIN}/it/blog/self-hosting-tracky-docker`}>
                guida passo passo al self-hosting con Docker
              </a>
              .
            </p>
            <p>
              Aggiungi le chiavi di Enable Banking, AI Gateway, Resend o Telegram solo se vuoi usare quelle integrazioni.
              Prima di aprire il terminale puoi anche leggere la pagina sul{' '}
              <a href={`${SITE_ORIGIN}/it/funzioni/piano-zero-based`}>Piano zero-based</a>, quella sul{' '}
              <a href={`${SITE_ORIGIN}/it/funzioni/collegamento-bancario`}>collegamento bancario</a> oppure la{' '}
              <a href={`${SITE_ORIGIN}/it/open-source`}>pagina open source</a>.
            </p>
          </div>
        </Section>

        {/* 5. FAQ */}
        <Section id="faq">
          <SectionHead
            kicker="FAQ sul rilascio"
            title="Domande su Tracky v0.1.0"
            subtitle="Risposte rapide su demo ospitata vs self-host, sync bancario, piano Pro riservato e avvio."
          />
          <B1ArticleFaqList items={releaseV010ItFaq} />
        </Section>
      </article>

      {/* OUTSIDE <article>: RELATED + FINAL CTA */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Continua a leggere"
        title="Esplora il resto di Tracky."
        items={[
          {
            kicker: 'Guida Docker',
            title: 'Self-hosting di Tracky con Docker passo passo',
            description: 'La guida successiva dedicata a Docker Compose, Convex self-hosted, zero telemetria e backup.',
            href: '/it/blog/self-hosting-tracky-docker',
            ctaLabel: 'Leggi la guida Docker →',
          },
          {
            kicker: 'Open source',
            title: 'Architettura, licenza MIT e contributi',
            description: 'Esplora lo stack, la policy di sicurezza ed entrambi i percorsi di installazione.',
            href: '/it/open-source',
            ctaLabel: 'Leggi Open Source →',
          },
          {
            kicker: 'Prezzi',
            title: 'Demo ospitata €0 vs self-host MIT',
            description: 'Cosa è incluso gratuitamente oggi e come è delimitato nel codice il piano Pro.',
            href: '/it/prezzi',
            ctaLabel: 'Leggi i prezzi →',
          },
        ]}
      />

      <FinalCta
        headline="v0.1.0 è pronta da provare."
        meta="Demo ospitata €0 · Release MIT su GitHub · Changelog completo"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
            Vedi v0.1.0 su GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
