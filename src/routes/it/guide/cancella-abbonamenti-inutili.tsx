import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Importa storia vera', p: 'Parti da due o tre mesi di storia CSV, perché il rilevamento ha bisogno di finestre vere da confrontare. Importi i tuoi movimenti, con nomi esercente, importi nella stessa valuta e date. Lasci alle ricorrenze mensili e annuali il tempo di ripetersi. Ottieni una base solida senza affidarti alla memoria, così i passi successivi diventano controlli rapidi e non ipotesi.' },
  { t: 'Rivedi i suggerimenti', p: 'Rivedi i suggerimenti che Tracky ricava da nomi esercente normalizzati, stessa valuta, importi simili e distanza fra le date. Osservi le ricorrenze mensili dai venticinque ai trentacinque giorni e quelle annuali dai trecentocinquantacinque ai trecentosettantacinque giorni. Consideri ogni segnalazione un suggerimento, non una certezza, perché gli acquisti ripetuti non sono sempre abbonamenti e i prezzi possono cambiare. Tieni quello che ti convince e ignori il resto.' },
  { t: 'Conferma quelli veri', p: 'Confermi ogni abbonamento vero con nome, importo, valuta, intervallo e prossima scadenza. Controlli il conto di addebito e correggi la cadenza quando le date si spostano. Attivi solo quello che usi davvero, perché gli abbonamenti attivi entrano nei rinnovi e nel flusso di cassa. Lasci il resto in pausa o terminato, così le proiezioni restano stime pulite di ciò che arriva.' },
  { t: 'Uccidi i doppioni', p: 'Trovi lo spreco classico: due addebiti per un servizio, un solo divano, un abbonamento basta. Confronti alias esercente, importi e cadenze per scovare il doppione prima di pagare ancora. Disdici prima nel servizio vero, perché Tracky non disdice al posto tuo. Poi segni l\'abbonamento extra come inattivo in Tracky, così esce dai rinnovi e smette di pesare sulla cassa futura.' },
  { t: 'Guarda i rinnovi', p: 'Guardi i rinnovi così nessun addebito arriva di sorpresa. Controlli le prossime scadenze prima che arrivino e vedi gli abbonamenti attivi nel flusso di cassa come stime. Metti in pausa ciò che non convince e termini ciò che hai abbandonato. Tieni l\'elenco piccolo e onesto, e ogni rinnovo diventa una tua scelta deliberata, non un addebito che ti sei perso.' },
];

const faq = [
  {
    q: 'Come faccio a trovare cancellare abbonamenti inutili senza tirare a indovinare?',
    a: 'Parti da due o tre mesi di CSV e scorri i suggerimenti costruiti su nomi esercente, importi simili e distanza fra date. Confermi nome, importo, intervallo e prossima scadenza prima di attivare qualsiasi cosa. Ogni corrispondenza resta un suggerimento, non una certezza, così gli acquisti ripetuti non diventano abbonamenti finché non decidi tu.',
  },
  {
    q: 'Disdico gli abbonamenti dentro Tracky?',
    a: 'No. Disdici prima nel servizio vero, perché Tracky non cancella addebiti al posto tuo. Poi segni l\'abbonamento come inattivo in Tracky così esce da rinnovi e flusso di cassa. In pausa resta salvato senza impegno attivo, mentre terminato conserva lo storico senza nuovi abbinamenti.',
  },
  {
    q: 'Che fine fanno gli abbonamenti attivi nel flusso di cassa?',
    a: 'Gli abbonamenti attivi entrano nei rinnovi e nel flusso di cassa con le prossime scadenze. Vedi cosa sta arrivando e puoi mettere in pausa o terminare ciò che non usi più. Le proiezioni restano stime, non promesse, perché importi e date possono cambiare. Arrivi prima dei rinnovi invece di scoprirli dopo l\'addebito.',
  },
  {
    q: 'Funziona nella demo?',
    a: 'Sì. Funziona nella demo con la tua storia CSV importata. Il rilevamento resta un suggerimento, non una certezza, quindi confermi sempre esercente, importo e cadenza. Resti tu al comando e i rinnovi riflettono solo gli abbonamenti che hai attivato tu.',
  },
];

export const Route = createFileRoute('/it/guide/cancella-abbonamenti-inutili')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Come trovare e cancellare abbonamenti inutili',
      description:
        '5 passi: importa storia, rivedi suggerimenti, conferma, uccidi doppioni, guarda rinnovi. Gli abbonamenti nutrono la cassa. Demo gratis.',
      locale: 'it',
      path: '/it/guide/cancella-abbonamenti-inutili',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/cancella-abbonamenti-inutili', inLanguage: ['it', 'en'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come trovare e cancellare abbonamenti inutili',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/cancella-abbonamenti-inutili' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/cancella-abbonamenti-inutili">
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
            Caccia agli abbonamenti,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Gli addebiti ricorrenti si nascondono in vista. Tracky trova i pattern, tu confermi, la cassa resta onesta.
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>Se vuoi trovare cancellare abbonamenti inutili nascosti negli estratti conto, parti dalla storia vera, non dalla memoria. Gli addebiti ricorrenti si nascondono in piena vista e i piccoli rinnovi mensili sono facili da perdere. Tracky trova le ricorrenze, tu confermi quelle vere e i conti restano in ordine. È una caccia, in cinque passi chiari.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Importi due o tre mesi di CSV, rivedi i suggerimenti mensili e annuali, poi confermi nome, importo, intervallo e prossima scadenza. Gli abbonamenti attivi entrano nei rinnovi e nel flusso di cassa, dove le proiezioni sono stime che ti mostrano cosa sta arrivando.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Funziona nella demo e il rilevamento resta un suggerimento, non una certezza. Disdici nel servizio vero, lo segni come inattivo in Tracky e guardi i rinnovi così niente ti sorprende. Resti tu al comando in ogni passo.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['IMPORTA STORIA', 'RIVEDI', 'CONFERMA', 'UCCIDI DOPPIONI', 'GUARDA RINNOVI']} />
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
            <h2 className="mk-h2">Un divano. Un abbonamento.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · suggerimenti, non certezze</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
