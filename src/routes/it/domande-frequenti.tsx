import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const qa = [
  {
    q: "Tracky è davvero gratis?",
    a: "Sì. La demo ospitata e il codice self-host con licenza MIT non costano nulla, e non ti chiediamo mai la carta. Tracky offre i piani Free e Pro, con diversi tetti di messaggi Analyst e proiezioni di lungo periodo solo Pro. In Tracky non puoi comprare, passare o gestire la fatturazione: l'azione Pro è segnata come in arrivo, nessun addebito.",
  },
  {
    q: "Devo collegare la banca?",
    a: "No. Conti manuali correnti, risparmio, carte, investimenti e beni, più l'import CSV nei conti manuali cash e carte, coprono l'intero flusso. La sincronizzazione via Enable Banking funziona solo dove la tua istanza ha un provider configurato. Nella demo ospitata resta non disponibile: esplorala senza collegare nulla.",
  },
  {
    q: "L'analyst AI funziona nella demo?",
    a: "No. Nella demo ospitata l'analyst AI è disattivato: le voci restano nascoste e la pagina segnala la funzione come non disponibile. Dove abilitato, legge i tuoi dati, spiega gli schemi e propone modifiche che richiedono la tua approvazione per le scritture sensibili. Usalo come aiuto esplorativo, mai come consulenza finanziaria.",
  },
  {
    q: "Va bene per coppie o freelance?",
    a: "Sì, come organizzazione individuale. Tracky è uno spazio personale: ti riconosce dalla sessione, quindi non esiste un accesso condiviso multi-utente. Una persona può comunque separare soldi domestici e di lavoro con conti manuali, seguire le scadenze fiscali come voci pianificate nel Cash Flow e passare CSV o JSON al commercialista.",
  },
  {
    q: "Di chi sono i miei dati?",
    a: "Tuoi. Scarica gli export CSV dai report quando vuoi, oppure chiedi l'export JSON versione 3 dalle Impostazioni, e ispeziona o auto-ospita il codice MIT in prima persona. Ogni piano e conto mantiene la propria valuta, e i totali in valute diverse restano separati invece di essere mescolati o convertiti di nascosto.",
  },
  {
    q: "Come inizio?",
    a: "Crea un conto manuale, importa un CSV della banca con mappatura colonne e rilevamento duplicati, poi controlla categorie e suggerimenti sugli abbonamenti. Quindi costruisci il primo Piano zero-based e aggiungi le scadenze note al Cash Flow. La guida introduttiva segue l'intero percorso passo passo: parti da lì.",
  },
  {
    q: "Queste domande frequenti budget valgono anche in self-host?",
    a: "Perlopiù sì. Costi, conti manuali, import CSV, logica del Piano e proprietà dei dati funzionano uguali ovunque. Le differenze riguardano i collegamenti: sincronizzazione bancaria e analyst dipendono dalla configurazione del provider e dai flag di ambiente della tua istanza. Controlla le Impostazioni per stato del provider e piano: il self-host segue la tua configurazione.",
  },
  {
    q: "Le previsioni di Tracky sono garantite?",
    a: "No. Scenari Forecast e proiezioni di lungo periodo dell'analyst sono stime di pianificazione costruite su saldi e ipotesi, mai garanzie. Leggi le ipotesi mostrate con ogni risultato e confronta gli scenari prima di decidere. Le proiezioni di lungo periodo sono solo Pro, e gli account Free non possono eseguirle: gli upgrade a pagamento non sono ancora disponibili.",
  },
];

const seoIntro: Array<string> = [
  "Vuoi risposte chiare prima di affidare i tuoi soldi a un'app. Queste domande frequenti budget ti dicono come stanno davvero le cose: quanto costa Tracky, cosa devi collegare e cosa resta spento nella demo ospitata. Capirai come conti manuali e import CSV coprono gran parte delle esigenze.",
  "Vedrai dove girano davvero sincronizzazione bancaria e analyst AI, e come tenere separati soldi personali e di lavoro in un unico spazio. Vedrai anche di chi sono i dati e come funzionano gli export. Ogni risposta segue la documentazione del prodotto.",
  "Leggi prima le sei domande principali, poi le due extra su self-host e previsioni. Ancora curioso? Apri la demo gratuita e verifica di persona ogni affermazione.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Come usare queste domande frequenti budget", paras: [
    "Parti dalla domanda che ti blocca: costo, collegamento bancario o limiti della demo. Ogni risposta distingue cosa funziona ovunque da cosa dipende dalla tua istanza, così puoi agire subito.",
    "Tieni per ultime le due domande finali: una spiega cosa cambia in self-host, l'altra dice cosa aspettarti dalle previsioni — stime utili, mai promesse. Quando una risposta cita una funzione, aprila nella demo e verifica di persona il comportamento.",
  ] },
];

export const Route = createFileRoute('/it/domande-frequenti')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Domande frequenti su Tracky, risposte oneste',
      description:
        'Risposte oneste: gratis per sempre, banca non richiesta, disponibilità sync e analyst, coppie, freelance, proprietà dei dati.',
      locale: 'it',
      path: '/it/domande-frequenti',
      ogImage: ogImageFor('faq'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/domande-frequenti', inLanguage: ['it', 'en'] }),
        faqJsonLd(qa.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'FAQ', path: '/it/domande-frequenti' },
        ]),
      ],
    }),
  component: FaqIt,
});

function FaqIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/domande-frequenti">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Chiesto.
            <br />
            <span className="hl">Risposto.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Niente nebbia marketing: cosa costa (niente), cosa richiede la banca (niente), cosa è disabilitato sulla
            demo (sync + analyst), e di chi sono i dati (<b>tuoi</b>).
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['Niente nebbia', 'Senza carta', 'Senza lock-in', 'Codice MIT', 'Dati tuoi']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {qa.map((entry) => (
          <Reveal key={entry.q}>
            <details open={qa.indexOf(entry) === 0}>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
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
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Ancora curioso? Toccalo.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
