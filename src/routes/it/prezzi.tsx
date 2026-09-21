import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "Se cerchi app budget gratis prezzi chiari, eccoli: oggi Tracky costa €0. Usi la demo ospitata oppure la versione self-hosted con licenza MIT, e non inserisci mai i dati della carta perché non esiste alcun checkout. Parti in pochi minuti con conti manuali e import CSV, e vedi subito dove vanno i tuoi soldi.",
  "Il piano gratuito copre tutto il ciclo quotidiano: piano zero-based, flusso di cassa con promemoria delle bollette, report, salvadanai virtuali e suggerimenti che segnalano i probabili rinnovi senza spacciarli per certezze. Email e Telegram restano spenti finché non li attivi tu, e le proiezioni di lungo periodo sono sempre stime. Lavori solo sui dati che inserisci o importi, e puoi esportarli in JSON su richiesta.",
  "Apri Impostazioni quando vuoi per vedere piano attivo e limite giornaliero dell'Analyst, e chi fa self-hosting usa lo stesso codice da GitHub con licenza MIT. Se il piano gratuito non ti basterà più, leggerai qui per primo le novità su Pro, con condizioni chiare e senza trucchi.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "App budget gratis prezzi: cosa ottieni con €0", paras: [
    "Il tuo piano gratuito ti dà tutto il ciclo quotidiano, senza parti bloccate. Costruisci un piano zero-based, segui il flusso di cassa con i promemoria delle bollette e leggi report che mostrano dove finiscono davvero i tuoi soldi. Aggiungi conti manuali, importi lo storico con il CSV, accantoni salvadanai virtuali e ricevi suggerimenti che segnalano i probabili rinnovi senza spacciarli per certezze.",
    "I conti collegati dipendono dal provider bancario di ogni istanza, quindi chi fa self-hosting configura il proprio, mentre la demo ospitata usa solo i dati che inserisci o importi. I promemoria in-app funzionano subito, mentre email e Telegram restano spenti finché non li attivi tu (Telegram richiede anche un collegamento verificato). L'export JSON resta disponibile su richiesta: niente carta, niente scadenza di prova, nessuna pagina di checkout, quindi €0 significa €0 mentre gestisci i soldi a modo tuo.",
  ] },
  { h: "Pro in arrivo, senza checkout", paras: [
    "Pro esiste come piano riservato, e oggi non è in vendita. Quando arriverà, dovrebbe alzare il tuo limite giornaliero dell'Analyst da 20 a 100 messaggi e sbloccare le proiezioni FIRE di lungo periodo, che resteranno sempre stime e mai promesse. Tutto ciò che è gratis resta esattamente dov'è.",
    "Non c'è un prezzo, non c'è una prova, non c'è una pagina di checkout: nessuno può addebitarti nulla, né per errore né di proposito. Vedrai qui lo stesso badge onesto finché non cambierà qualcosa: gratis ora, Pro in arrivo, niente da comprare.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "App budget gratis prezzi: come funziona Tracky?", a: "Paghi €0 e non aggiungi mai una carta, perché non esiste alcun checkout né nella pagina né nell'app. Usi la demo ospitata oppure il codice MIT in self-hosting, con conti manuali, import CSV, piani, flusso di cassa, report e salvadanai virtuali. Impostazioni mostra il tuo piano e gli export restano disponibili su richiesta: i tuoi dati restano sempre tuoi." },
  { q: "Posso comprare Pro oggi?", a: "No, ed è onestà deliberata, non un trucco. Pro esiste come piano riservato con etichetta «in arrivo», ma non ha prezzo, prova o checkout: nessuna pagina può prendere i tuoi soldi. Se arriverà, Pro dovrebbe aggiungere 100 messaggi Analyst al giorno e proiezioni FIRE di lungo periodo, sempre come stime. Fino ad allora il badge resta uguale: gratis ora." },
  { q: "Il piano gratuito include banche collegate e notifiche?", a: "I conti collegati dipendono dal provider di ogni istanza, quindi la demo ospitata usa conti manuali e import CSV, senza sync promessa. Promemoria delle bollette e suggerimenti sulle sottoscrizioni funzionano in-app, mentre email e Telegram restano spenti finché non li attivi. Le proiezioni di lungo periodo sono sempre stime, mai garanzie, e niente qui è consulenza finanziaria." },
  { q: "Che fine fanno i miei dati se resto gratis per sempre?", a: "Restano tuoi, esportabili in JSON su richiesta, con testo delle memorie e impostazioni inclusi ed embedding esclusi. Le richieste di eliminazione si registrano da Impostazioni e restano reversibili, senza cancellazione automatica, quindi niente sparisce in silenzio. Chi fa self-hosting conserva stesso codice MIT e dati sulle proprie macchine. Gratis significa gratis, senza prove che ti trasformano in cliente pagante." },
];

export const Route = createFileRoute('/it/prezzi')({
  loader: async () => {
    let auth: { user: unknown | null; signInUrl: string; signUpUrl: string } = { user: null, signInUrl: '/app', signUpUrl: '/app' };
    try {
      const { user } = await getAuth();
      const signInUrl = await getSignInUrl({ data: { returnPathname: '/app' } });
      const signUpUrl = await getSignUpUrl({ data: { returnPathname: '/app' } });
      auth = { user, signInUrl, signUpUrl };
    } catch {
      // No WorkOS secrets on this worker (e.g. staging): degrade to logged-out.
    }
    return auth;
  },
  head: () =>
    buildMarketingHead({
      title: 'Prezzi — Gratis per sempre, Pro in arrivo · Tracky',
      description:
        'Tracky costa €0: demo ospitata gratis, self-host MIT, senza carta. Il piano Pro esiste nel codice ma non è acquistabile.',
      locale: 'it',
      path: '/it/prezzi',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/prezzi', inLanguage: ['it', 'en'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Prezzi', path: '/it/prezzi' },
        ]),
      ],
    }),
  component: PricingIt,
});

function PricingIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  const cta = user ? '/app' : signUpUrl;
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/prezzi">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Gratis <span className="hl">per sempre.</span>
            <br />
            <span className="stroke">Pro: poi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Oggi Tracky costa <b>€0</b>: demo ospitata più self-host MIT. Un piano Pro è previsto nel codice per limiti
            analyst, scenari e piani multipli — ma <b>non esiste fatturazione</b> e nulla è in vendita.
          </p>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">€0 oggi</span>
            <span className="mk-badge">Senza carta</span>
            <span className="mk-badge">Nessun checkout</span>
          </div>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['DEMO GRATIS', 'SELF-HOST MIT', 'SENZA CARTA', 'NESSUN CHECKOUT', 'PRO SOLO SE RICHIESTO']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>🟢 GRATIS — OGGI</h3>
              <ul>
                <li>Demo ospitata, funzioni core complete</li>
                <li>Piano zero-based, cassa, report</li>
                <li>Conti manuali + import CSV</li>
                <li>Self-host da GitHub, MIT</li>
              </ul>
              <p style={{ marginTop: 18 }}>
                <MagnetCta href={cta} variant="pill">
                  {user ? 'Apri la demo →' : 'Inizia gratis →'}
                </MagnetCta>
              </p>
            </div>
            <div className="mk-d bad" style={{ background: '#fff' }}>
              <h3>🔜 PRO — IN ARRIVO</h3>
              <ul>
                <li>Più messaggi analyst al giorno</li>
                <li>Scenari, piani multipli</li>
                <li>Solo se gli utenti lo chiedono</li>
                <li>Nessun prezzo — non esiste checkout</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Riepilogo import Tracky: 33 movimenti importati nel conto demo" width={1440} height={800} loading="lazy" />
            <figcaption>Cosa compri con €0: un registro vero in minuti. Screenshot dalla demo live.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoBlocks.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            {block.paras.map((para, i) => (
              <p key={i} className="mk-sub" style={{ maxWidth: 700 }}>{para}</p>
            ))}
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoFaq.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">€0. Senza asterischi nascosti.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · repo MIT · senza carta</p>
            <MagnetCta href={cta}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
