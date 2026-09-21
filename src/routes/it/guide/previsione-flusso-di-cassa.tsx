import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const steps = [
  { t: 'Prima finanzia il piano', p: 'Apri il Piano e dai un compito ai soldi già presenti nei conti liquidi prima di proiettare. Assegni la liquidità ai bucket così Da assegnare mostra ciò che è davvero libero, con ogni piano in una sola valuta e il debito delle carte fuori dalla liquidità. Senza questa base finanziata, il Flusso di cassa non costruisce una proiezione solida. Finanzia prima il Piano e ogni data successiva si legge meglio.' },
  { t: 'Aggiungi spese pianificate', p: 'Aggiungi ogni bolletta, stipendio e trasferimento conosciuti come voce pianificata con data, importo, conto e direzione reali. Includi anche i movimenti programmati una tantum, e Tracky elenca ogni occorrenza del ciclo scelto in ordine di data. Assegna a ogni riga il conto di origine, altrimenti resta non assegnata e non riduce il saldo giusto. Righe complete trasformano il calendario in un quadro affidabile della liquidità.' },
  { t: 'Converti gli abbonamenti', p: 'Trasforma gli addebiti ricorrenti in sottoscrizioni così i rinnovi entrano da soli nella previsione. Le crei a mano o converti un addebito passato, poi imposti importo, intervallo, prossima scadenza e conto di addebito. Tieni Attiva ogni voce che paghi ancora, e metti in pausa o chiudi le altre. Il rilevamento di Tracky è solo un suggerimento, non una certezza: verifica esercente, importo e cadenza prima di fidarti di ogni rinnovo.' },
  { t: 'Leggi la prima data negativa', p: 'Leggi il calendario dall\'alto in basso e osserva il saldo dopo ogni riga. Segui la serie del conto e la linea aggregata della liquidità, sapendo che il debito delle carte non conta mai come deficit di cassa. La prima data sotto zero è il tuo segnale principale se non cambia niente. Considera tutte le proiezioni come stime da voci note, poi apri quel giorno, controlla le righe precedenti e verifica saldo, valuta e conti.' },
  { t: 'Sistemala presto', p: 'Muoviti mentre hai ancora margine per spostare una data, aggiungere un\'entrata reale o tagliare un\'uscita. Sposti un pagamento solo quando cambia la sua vera scadenza, finanzi un salvadanaio virtuale verso il buco oppure alleggerisci un bucket. Riconcilia le voci pagate con Collega transazione così smettono di pesare sul futuro. Ricontrolla il Flusso di cassa e guarda la data negativa spostarsi più avanti o sparire.' },
];

const faq = [
  {
    q: 'Cosa mi serve per capire come prevedere flusso di cassa in Tracky?',
    a: 'Ti servono gli ultimi saldi dei conti liquidi, un Piano finanziato in una sola valuta e voci pianificate datate con conto di origine. Aggiungi sottoscrizioni attive e movimenti programmati una tantum, poi apri il Flusso di cassa. Leggi i saldi dopo ogni data in ordine. Funziona nella demo gratuita senza collegamento bancario, e ogni proiezione resta una stima.',
  },
  {
    q: 'Perché vedo una riga non assegnata?',
    a: 'Una voce risulta non assegnata quando manca il conto di origine, oppure quando un estratto non ha un conto di regolamento. Vedi comunque l\'impegno, ma Tracky non sa quale saldo ridurrà. Assegna il giusto conto liquido nella stessa valuta. La proiezione diventa completa, mentre il debito delle carte resta separato dalla liquidità.',
  },
  {
    q: 'I rinnovi delle sottoscrizioni sono sempre giusti?',
    a: 'No. Il rilevamento guarda esercente, valuta, importo simile e intervallo tra date, ma acquisti ripetuti non sono sempre abbonamenti e i prezzi possono cambiare. Prendi ogni segnalazione come un suggerimento, poi verifica nome, importo, intervallo e prossima scadenza. Tieni Attive solo le vere sottoscrizioni così la previsione riflette impegni reali.',
  },
  {
    q: 'I salvadanai spostano i soldi in banca?',
    a: 'No. Il salvadanaio è virtuale: segue obiettivo e importo accantonato senza creare un altro saldo bancario. Registrare un versamento non muove soldi nella tua banca. Collega il salvadanaio a un bucket del Piano per mostrare Già accantonato così l\'obiettivo chiede solo la parte mancante, e sposta i fondi reali a parte se la liquidità deve cambiare davvero conto.',
  },
];

export const Route = createFileRoute('/it/guide/previsione-flusso-di-cassa')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Come prevedere il flusso di cassa in Tracky',
      description:
        '5 passi: finanzia il piano, aggiungi spese pianificate, converti abbonamenti, leggi la prima data negativa, sistemala. Demo gratis.',
      locale: 'it',
      path: '/it/guide/previsione-flusso-di-cassa',
      ogImage: ogImageFor('guide-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/previsione-flusso-di-cassa', inLanguage: ['it', 'en'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come prevedere il flusso di cassa in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/previsione-flusso-di-cassa' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/previsione-flusso-di-cassa">
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
            Prevedi la cassa,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>Vuoi una risposta chiara a una domanda sola: i tuoi soldi arriveranno al prossimo stipendio? Questa guida ti spiega come prevedere flusso di cassa in Tracky usando voci che conosci già.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Parti dagli ultimi saldi dei conti liquidi, aggiungi spese ed entrate pianificate, includi le sottoscrizioni attive e leggi il calendario giorno per giorno. Vedi ogni impegno in ordine di data, individui il primo giorno in cui il saldo scenderebbe sotto zero e lo sistemi finché sei in tempo.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Le proiezioni sono stime basate su voci note, non garanzie. Lavori nella demo gratuita, senza collegamento bancario. Segui i cinque passi qui sotto, tieni in ordine date e conti, e saprai con precisione quanto puoi spendere. Assegna ogni voce al conto giusto, con la sua data reale, così la proiezione resta completa.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['PRIMA IL PIANO', 'SPESE PIANIFICATE', 'ABBONAMENTI', 'DATA NEGATIVA', 'SISTEMA PRESTO']} />
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
            <h2 className="mk-h2">Conosci il buco. Evitalo.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · stime, non promesse</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Apri la cassa →' : 'Inizia gratis →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
