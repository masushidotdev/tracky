import { createFileRoute } from '@tanstack/react-router';
import type { MarketingAuth } from '@/components/marketing/site';
import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
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

const inlineLinkStyle = {
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
} as const;

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

const faq = [
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
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
  const { user, signUpUrl } = auth;
  const demoHref = user ? '/app' : signUpUrl;

  return (
    <MarketingSite locale="it" auth={auth} currentPath="/it/blog/tracky-v0-1-0">
      <article>
        <header className="mk-hero">
          <Reveal>
            <div className="mk-badges">
              <span className="mk-badge solid">Rilascio</span>
              <span className="mk-badge">v0.1.0</span>
              <time className="mk-badge" dateTime={PUBLISH_DATE}>
                24 nov 2026
              </time>
              <span className="mk-badge">MIT</span>
            </div>
          </Reveal>
          <Reveal>
            <h1>
              Tracky <span className="hl">v0.1.0</span>
              <br />
              <span className="stroke">è fuori.</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="mk-dek">
              Primo rilascio pubblico taggato di Tracky, pubblicato il <b>24 novembre 2026</b> con licenza MIT. Un punto
              fermo leggibile dal primo commit pubblico fino alla PR #64 — prova la demo gratis o eseguilo sul tuo server.
            </p>
          </Reveal>
          <Reveal>
            <aside aria-label="Collegamenti del rilascio" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <MagnetCta
                href={demoHref}
                onClick={() =>
                  user
                    ? undefined
                    : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
                }
              >
                {user ? 'Apri la demo →' : 'Prova la demo gratis →'}
              </MagnetCta>
              <MagnetCta href={RELEASE_URL} variant="pill">
                Release v0.1.0 su GitHub →
              </MagnetCta>
            </aside>
          </Reveal>
        </header>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <p className="mk-sub" style={{ maxWidth: 720 }}>
              Tracky è pubblico su GitHub dal 15 settembre 2026. Oggi abbiamo taggato{' '}
              <a href={RELEASE_URL} rel="noopener" style={inlineLinkStyle}>
                v0.1.0
              </a>{' '}
              come prima versione semantica: raccoglie tutto il lavoro dal primo commit pubblico (<code>654561d</code>)
              fino alla PR #64 in un riferimento stabile che puoi leggere, fissare ed eseguire.
            </p>
            <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>
              Se incontri Tracky per la prima volta: è un tracker per le finanze personali con licenza MIT costruito su
              Convex, TanStack Start e WorkOS AuthKit. Puoi provare la{' '}
              <a href={`${SITE_ORIGIN}/it/prezzi`} style={inlineLinkStyle}>
                demo ospitata gratuita
              </a>{' '}
              su <code>trytracky.app/it/</code> con conti manuali e import CSV nel browser, oppure clonare{' '}
              <a href={REPO_URL} rel="noopener" style={inlineLinkStyle}>
                masushidotdev/tracky
              </a>{' '}
              e gestire la tua istanza con le tue chiavi.
            </p>
            <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>
              Qui sotto trovi i blocchi principali arrivati nella v0.1.0. Per l’elenco completo di correzioni, dipendenze e
              pull request puoi leggere il{' '}
              <a href={CHANGELOG_URL} rel="noopener" style={inlineLinkStyle}>
                CHANGELOG.md
              </a>{' '}
              o le{' '}
              <a href={RELEASE_URL} rel="noopener" style={inlineLinkStyle}>
                note di rilascio su GitHub
              </a>
              .
            </p>
          </Reveal>
        </section>

        <MarqueeBand items={['V0.1.0 TAGGATA', 'PIANO ZERO-BASED', 'MUTUI E PRESTITI', 'CSV NEL BROWSER', 'LICENZA MIT']} />

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Cosa c’è nella v0.1.0
            </h2>
          </Reveal>
          {highlights.map((item) => (
            <div key={item.num}>
              <Reveal>
                <div className="mk-card" style={{ maxWidth: 760, margin: '0 auto 16px', minWidth: 0, transform: 'none' }}>
                  <div className="e">{item.num}</div>
                  <h3>{item.title.toUpperCase()}</h3>
                  <p>{item.body}</p>
                </div>
              </Reveal>
              {item.figures?.map((figure) => (
                <Reveal key={figure.src}>
                  <figure className="mk-shot" style={{ maxWidth: 760, margin: '20px auto 24px' }}>
                    <img
                      src={figure.src}
                      alt={figure.alt}
                      width={figure.width}
                      height={figure.height}
                      loading="lazy"
                    />
                    <figcaption>{figure.caption}</figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          ))}
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
              Demo ospitata vs. self-host
            </h2>
            <p className="mk-sub" style={{ maxWidth: 720 }}>
              Entrambi girano sullo stesso codice MIT, con confini chiari su cosa è attivo dove. Nulla nella v0.1.0 è
              dietro un checkout e le funzioni Pro restano riservate nel codice finché non esisterà una fatturazione.
            </p>
          </Reveal>
          <Reveal>
            <div className="mk-duel">
              <div className="mk-d good">
                <h3>DEMO OSPITATA (€0)</h3>
                <ul>
                  <li>Piano zero-based, Flusso di cassa, Report, Obiettivi</li>
                  <li>Conti manuali: liquidità, carte, asset e prestiti</li>
                  <li>Import CSV nel browser con anteprima</li>
                  <li>Senza carta, senza prova, nessun checkout</li>
                </ul>
              </div>
              <div className="mk-d" style={{ background: '#fff' }}>
                <h3>SELF-HOST (MIT)</h3>
                <ul>
                  <li>Il tuo deployment Convex + WorkOS AuthKit</li>
                  <li>Sync bancaria PSD2 opzionale (chiavi Enable Banking)</li>
                  <li>Analyst AI, email Resend e Bot Telegram opzionali</li>
                  <li>Codice completo + guide utente EN/IT nel repo</li>
                </ul>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginTop: 48 }}>
              Avviare la tua istanza
            </h2>
            <p className="mk-sub" style={{ maxWidth: 720 }}>
              Tracky non promette un singolo comando Docker. Si avvia con Node.js (<code>&gt;=22.23.4 &lt;23</code>), npm,
              un tuo deployment Convex e un tuo progetto WorkOS AuthKit. Clona il repository, lancia <code>npm ci</code>,
              copia <code>.env.example</code> in <code>.env.local</code> (riferimento corretto dalla PR #64), esegui{' '}
              <code>npx convex dev</code> e parti in locale con <code>npm run dev</code>.
            </p>
            <p className="mk-sub" style={{ maxWidth: 720, marginTop: 14 }}>
              Aggiungi le chiavi di Enable Banking, AI Gateway, Resend o Telegram solo se vuoi usare quelle integrazioni.
              Prima di aprire il terminale puoi anche leggere la pagina sul{' '}
              <a href={`${SITE_ORIGIN}/it/funzioni/piano-zero-based`} style={inlineLinkStyle}>
                Piano zero-based
              </a>
              , quella sul{' '}
              <a href={`${SITE_ORIGIN}/it/funzioni/collegamento-bancario`} style={inlineLinkStyle}>
                collegamento bancario
              </a>{' '}
              oppure la{' '}
              <a href={`${SITE_ORIGIN}/it/open-source`} style={inlineLinkStyle}>
                pagina open source
              </a>
              .
            </p>
          </Reveal>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
              Domande e risposte.
            </h2>
          </Reveal>
          {faq.map((entry) => (
            <Reveal key={entry.q}>
              <details>
                <summary>{entry.q}</summary>
                <p style={{ marginTop: 8 }}>{entry.a}</p>
              </details>
            </Reveal>
          ))}
        </section>
      </article>

      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">v0.1.0 è pronta da provare.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>
              Demo ospitata gratis · release MIT su GitHub · changelog completo
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <MagnetCta
                href={demoHref}
                onClick={() =>
                  user
                    ? undefined
                    : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
                }
              >
                {user ? 'Apri la demo →' : 'Inizia gratis →'}
              </MagnetCta>
              <MagnetCta href={RELEASE_URL} variant="pill">
                Vedi v0.1.0 su GitHub →
              </MagnetCta>
            </div>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
