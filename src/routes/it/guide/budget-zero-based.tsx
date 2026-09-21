import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Crea un conto manuale', p: 'Apri Conti e aggiungi un conto manuale di tipo checking in EUR, con un nome breve che riconosci ogni volta. Imposti il saldo reale di oggi come punto di partenza, perché il piano assegna solo denaro che esiste davvero in questo momento. Non colleghi nulla, quindi ogni cifra successiva nasce da questo saldo più le righe CSV che controlli tu per primo. Questo conto diventa l\'unica fonte del tuo primo piano, e ogni euro assegnato corrisponde a liquidità che possiedi davvero.' },
  { t: 'Importa un CSV della banca', p: 'Esporti il CSV dalla tua banca e lo porti dentro Tracky sul conto manuale che hai appena creato. Mappi le tre colonne richieste, data, descrizione e importo, così ogni riga finisce sempre al posto giusto. Leggi l\'anteprima riga per riga e correggi ogni anomalia prima di confermare l\'importazione. Confermi solo quando ogni riga risulta pulita e completa, così il piano contiene attività reale pronta da assegnare subito e Non spiegato resta a zero fin dall\'inizio.' },
  { t: 'Crea il piano', p: 'Crei un piano e scegli il tuo conto manuale come fonte di finanziamento. Tieni una valuta e un piano solo, così saldi e assegnazioni parlano sempre la stessa lingua ogni mese. Il piano parte dal giorno in cui lo crei: i movimenti precedenti restano dentro i saldi di oggi ma non creano attività né scoperti. Se l\'origine non ti convince dopo un\'importazione dello storico, usa Ricomincia da qui per scegliere il primo giorno valido, conservando gruppi, bucket, target e assegnazioni.' },
  { t: 'Assegna ogni euro', p: 'Apri il piano e riempi ogni bucket con il denaro fermo sul conto di finanziamento. Vai avanti finché Da assegnare arriva a zero, perché ogni euro merita un compito e il denaro fermo scivola in fretta in spese non scelte. Le nuove entrate finiscono in Da assegnare, mai come spesa negativa dentro un bucket, quindi dai loro un lavoro appena arrivano. Porti a zero anche Non spiegato: ogni movimento risulta attribuito e nessun euro compare dal nulla.' },
  { t: 'Guarda il Disponibile riportare', p: 'Chiudi il mese e osservi i saldi Disponibile positivi passare a quello dopo automaticamente. È così che crescono i fondi annuali: ciò che non spendi resta nel suo bucket e riduce direttamente il fabbisogno del mese seguente. Quando una riga di cassa diventa rossa, sposti subito Disponibile da un altro bucket per coprirla, perché lo scoperto non coperto riduce Da assegnare invece di riportarsi. Quando il rosso riguarda spese con carta, finanzi il bucket di pagamento prima di pagare l\'estratto.' },
];

const faq = [
  {
    q: 'Posso partire se lo storico è disordinato?',
    a: 'Parti comunque: il primo giorno del piano è quello in cui lo crei. I movimenti precedenti restano dentro i saldi di oggi senza creare attività né scoperti. Se quel punto di partenza non ti convince, apri il selettore del piano e scegli Ricomincia da qui per fissare il primo giorno che conta davvero. Tracky conserva gruppi, bucket, target e assegnazioni, poi ricostruisce lo storico dalla nuova origine.',
  },
  {
    q: 'Devo arrivare a zero il primo giorno?',
    a: 'È l\'obiettivo, non un obbligo da rispettare il primo giorno. Un Da assegnare positivo significa solo che alcuni soldi non hanno ancora un compito, e il denaro senza compito tende a uscire per qualcosa che non hai scelto. Ti avvicini ogni volta che ti siedi ad assegnare. Anche un piano assegnato a metà batte un mese in cui le spese precedono le decisioni.',
  },
  {
    q: 'Cosa succede se spendo più di quanto contiene un bucket?',
    a: 'La riga del bucket diventa rossa e chiede una delle due soluzioni. Per lo scoperto liquido sposti fondi Disponibile da un altro bucket, altrimenti l\'ammanco taglia il Da assegnare del mese dopo invece di trascinarsi avanti. Per lo scoperto a credito finanzi il bucket di pagamento della carta, perché il debito è cresciuto anche se la liquidità non è ancora uscita. In ogni caso il saldo negativo non passa al mese dopo.',
  },
  {
    q: 'Come creare budget zero based che funziona anche il mese dopo?',
    a: 'Porti i saldi Disponibile positivi nel mese dopo, e così i fondi per le spese annuali crescono senza lavoro extra. Copri ogni riga di cassa in rosso spostando denaro da un altro bucket, così gli ammanchi non riducono mai in silenzio il Da assegnare del mese dopo. Le nuove entrate finiscono sempre prima in Da assegnare. Ogni mese parte da saldi reali, e il piano continua a funzionare.',
  },
];

export const Route = createFileRoute('/it/guide/budget-zero-based')({
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
      title: 'Come creare un budget zero-based in Tracky',
      description:
        '5 passi: conto manuale, import CSV, primo piano, assegna a zero, riporta il Disponibile. Funziona nella demo gratis.',
      locale: 'it',
      path: '/it/guide/budget-zero-based',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/budget-zero-based', inLanguage: ['it', 'en'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come creare un budget zero-based in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/budget-zero-based' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/budget-zero-based">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Guida</span>
            <span className="mk-badge">5 passi</span>
            <span className="mk-badge">Demo gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Primo budget,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>Vuoi un budget in cui ogni euro ha un compito preciso. Questa guida ti mostra come creare budget zero based in Tracky in cinque passi pratici, e funziona nella demo da subito.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Apri un conto manuale in EUR e non colleghi nessuna banca. Importi un CSV della banca con anteprima riga per riga, poi leghi un piano a quel conto come sua unica fonte di finanziamento.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Poi assegni ogni euro finché Da assegnare arriva a zero. Tieni a zero anche Non spiegato, così ogni movimento resta attribuito. I saldi Disponibile positivi passano al mese dopo, mentre lo scoperto di cassa riduce Da assegnare finché non sposti denaro fra i bucket. Apri la demo gratis e segui tu ogni passo: senza carta, guida inclusa, primo piano pronto oggi.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['CONTO', 'CSV', 'PIANO', 'ASSEGNA A ZERO', 'RIPORTA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {steps.map((s, i) => (
          <Reveal key={s.t}>
            <div className="mk-card" style={{ maxWidth: 760, margin: '0 auto 16px', minWidth: 0, transform: 'none' }}>
              <div className="e">{i + 1}.</div>
              <h3>{s.t.toUpperCase()}</h3>
              <p>{s.p}</p>
            </div>
          </Reveal>
        ))}
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
            <img src="/shots/import-preview.png" alt="Passo 2 in azione: anteprima CSV di Tracky che valida ogni riga" width={1440} height={800} loading="lazy" />
            <figcaption>Passo 2 in azione: l'anteprima CSV dalla demo live.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Domande e risposte.</h2>
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Tocca a te. 5 passi.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · senza carta · guida inclusa</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
