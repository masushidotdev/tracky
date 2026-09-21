import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "Vuoi dare a ogni euro un lavoro prima di spenderlo. Il Piano di Tracky è un budget a base zero che usa solo il denaro già osservato nei tuoi conti liquidi. Assegni ogni euro a un bucket finché Da assegnare non arriva a zero.",
  "Vedi Assegnato, Attività e Disponibile per ogni bucket. Assegnato è quanto destini a questo mese. Attività indica spese contabilizzate e rimborsi nelle categorie del bucket. Disponibile è quanto resta, e un Disponibile positivo passa al mese dopo.",
  "Finanzi il mese con entrate reali, non con gli avanzi. Le entrate compaiono in Da assegnare e nel suo dettaglio, mai come spesa negativa dentro un bucket. La voce Movimenti non spiegati deve restare a zero, perché un valore diverso indica movimenti ancora da attribuire correttamente.",
  "Le carte restano fuori dalla liquidità e ricevono bucket di pagamento dedicati. Né un saldo positivo della carta né il suo plafond disponibile contano come denaro da assegnare. Il contante prelevato da una carta si può assegnare, ma il debito corrispondente resta da pagare.",
  "Chiudi il mese quando ogni euro ha un lavoro e Da assegnare resta a zero. Se arrivano nuove entrate, dai un lavoro anche a quelle. Provalo nella demo e apri il Piano per esercitarti nel flusso.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Cosa fa con i tuoi soldi questo budget a base zero", paras: [
    "Il Piano organizza le tue categorie di transazione in bucket raggruppati per scopo. Assegni a ogni bucket la liquidità osservata per il mese. L'Attività segue poi spese contabilizzate e rimborsi attraverso quelle categorie.",
    "Il Disponibile mostra quanto ti resta, e gli importi positivi passano al mese dopo. Le categorie non mappate finiscono in Non pianificato, così nessuna spesa reale sparisce. Le collochi in un bucket esistente o dai loro una nuova casa.",
    "I salvadanai collegati contano come Già accantonato verso il target del bucket, perché quelle riserve virtuali sostengono l'obiettivo senza diventare una nuova assegnazione. Vedi sempre Da assegnare e il suo dettaglio prima di decidere.",
  ] },
  { h: "Come chiudi il mese a zero, passo passo", paras: [
    "Parti dal giorno in cui il tuo Piano diventa reale, perché i movimenti precedenti restano nei saldi senza creare attività nei bucket. Dai a ogni euro un lavoro finché Da assegnare non arriva a zero, spostando denaro fra bucket quando cambiano le priorità.",
    "Aggiungi target ai bucket con ritmo mensile, annuale, settimanale o personalizzato, poi lascia che la guida dei sotto-finanziati ordini la coda. Usa Assegnazione automatica per vedere in anteprima le strategie Sotto-finanziato, mese scorso o media prima che venga scritto alcunché.",
    "Copri lo scoperto liquido spostando Disponibile da un altro bucket. Finanzia i bucket di pagamento carta per lo scoperto a credito, così la liquidità attende pronta quando paghi l'estratto.",
  ] },
  { h: "Limiti onesti: Funziona nella demo, una valuta, nessun doppio conteggio", paras: [
    "Questa pagina porta il badge Funziona nella demo, così provi il flusso completo del Piano nella demo. Ogni Piano usa una sola valuta, e non puoi unire valute diverse in totali condivisi.",
    "Il debito delle carte resta separato dalla liquidità, e non conti mai due volte lo stesso euro. I fidi ti informano ma non contano mai come denaro da assegnare, e non serve un bucket separato per rientrare.",
    "I suggerimenti di sottoscrizione restano suggerimenti, quindi verifichi tu esercente, importo e cadenza. Target e Cost to Be Me guidano le decisioni senza spostare denaro da soli.",
  ] },
  { h: "Per chi è il Piano", paras: [
    "Ti piace decidere prima di spendere e vuoi che le spese annuali smettano di sembrarti sorprese. Hai saldi a credito sulle carte e vuoi bucket di pagamento che tengano pronta la liquidità per gli estratti.",
    "Gestisci piani rateali e vuoi vedere il fabbisogno di ogni mese in un'unica riga. Usi salvadanai virtuali accanto agli obiettivi e vuoi che Già accantonato riduca ogni target in modo equo. Se preferisci tetti rigidi da non rivedere mai, questo metodo ti sembrerà impegnativo, perché torni ogni mese, assegni di nuovo e mantieni Da assegnare a zero.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "Devo assegnare tutto fino a zero in questo budget a base zero?", a: "No, ma resta l'obiettivo verso cui lavori. Un Da assegnare positivo indica denaro ancora senza un lavoro, e il denaro senza lavoro tende a uscire da solo. Puoi sospendere, spostare denaro fra bucket o usare le anteprime di Assegnazione automatica. Ogni mese torni, assegni di nuovo e vedi il numero assestarsi a zero." },
  { q: "Perché le mie entrate non compaiono come attività in un bucket?", a: "Le entrate finanziano il Piano invece di contare come spesa negativa. Le trovi in Da assegnare e nel suo dettaglio, insieme a riporto, accrediti, assegnazioni e riserve. I bucket seguono solo spese contabilizzate e rimborsi nelle loro categorie. Così la busta paga resta visibile come carburante, mai nascosta fra spesa o trasporti." },
  { q: "Qual è la differenza fra scoperto liquido e scoperto a credito?", a: "Lo scoperto liquido indica denaro già uscito da un conto liquido, quindi sposti Disponibile da un altro bucket per coprirlo. Lo scoperto a credito indica un acquisto con carta senza copertura, quindi finanzi il bucket di pagamento di quella carta. La liquidità non si muove ancora, ma il debito cresce. Entrambi si risolvono agendo, senza riporti negativi nel bucket." },
  { q: "Come gestiscono i target le spese annuali?", a: "Metti sul bucket un target annuale con la sua scadenza e scegli Rabbocca fino a. Ogni mese Tracky ricava il fabbisogno da quanto hai già accantonato e dal tempo rimasto. I mesi saltati alzano automaticamente la richiesta successiva. La spesa mensile usa Mensile più Rabbocca fino a come tetto, mentre le rate sparse preferiscono Mensile più Metti da parte altri." },
  { q: "I rilevamenti delle sottoscrizioni sono certi e i salvadanai sono contanti reali?", a: "No in entrambi i casi, e la distinzione conta. Gli abbinamenti di sottoscrizione restano suggerimenti, quindi verifichi esercente, importo e cadenza prima di fidarti del rinnovo. I salvadanai collegati restano riserve virtuali mostrate come Già accantonato, rilette ogni mese. Riducono il target del bucket senza diventare una nuova assegnazione né contante spendibile." },
];

export const Route = createFileRoute('/it/funzioni/piano-zero-based')({
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
      title: 'Piano zero-based: ogni euro ha un lavoro · Tracky',
      description:
        'Il piano zero-based di Tracky assegna la liquidità osservata ai bucket prima di spenderla. Da assegnare a zero — una valuta, nessun doppio conteggio.',
      locale: 'it',
      path: '/it/funzioni/piano-zero-based',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/piano-zero-based', inLanguage: ['it', 'en'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Piano zero-based', path: '/it/funzioni/piano-zero-based' },
        ]),
      ],
    }),
  component: PlanIt,
});

function PlanIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/piano-zero-based">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Funziona nella demo</span>
            <span className="mk-badge">Gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Ogni euro,
            <br />
            <span className="hl">occupato.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Il Piano assegna il denaro <b>già osservato</b> nei conti un lavoro prima che venga speso. Assegnato,
            Attività e Disponibile per bucket; <b>Da assegnare a zero</b>, mese blindato. Una valuta, debiti carte fuori
            dalla liquidità, nessun doppio conteggio.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Apri il piano →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['DA ASSEGNARE = 0', 'ASSEGNATO · ATTIVITÀ · DISPONIBILE', 'UNA VALUTA', 'NESSUN DOPPIO CONTEGGIO']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Come si <span className="u">chiude.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 TETTI MENSILI</h3>
              <ul>
                <li>Limiti che nessuno aggiorna</li>
                <li>Resti che nessuno spiega</li>
                <li>Carte mescolate al contante</li>
                <li>Sorpresa di dicembre</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 ZERO-BASED</h3>
              <ul>
                <li>Saldi osservati, datati</li>
                <li>Non spiegato deve essere zero</li>
                <li>Le carte hanno bucket di pagamento</li>
                <li>Il Disponibile positivo riporta</li>
              </ul>
            </div>
          </div>
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
            <h2 className="mk-h2">Assegna tutto. Dormi bene.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · piano incluso · senza carta</p>
            <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Apri il piano →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
