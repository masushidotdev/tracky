import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const INTRO = "Vuoi risposte dai tuoi soldi senza cedere il controllo. L'analista AI spese di Tracky legge i dati che autorizzi e li trasforma in scenari what-if, grafici e segnalazioni su cui puoi agire. Fai domande in linguaggio naturale, controlli l'anteprima e niente di sensibile cambia finché non approvi tu.\n\nLui propone. Tu firmi. Questo è il patto: l'analista suggerisce assegnazioni del Piano, spostamenti nei money box virtuali e ricategorizzazioni, mentre tu verifichi ogni dettaglio prima che qualcosa venga salvato. Se rifiuti una proposta, i tuoi dati restano esattamente come erano.\n\nDietro la chat, i controlli automatici restano di guardia. Ogni sei ore Tracky valuta i bucket del Piano vicini ai limiti, i prossimi pagamenti di sottoscrizioni e rate, la prima data di cashflow negativo proiettato e i problemi di sync. Ogni giorno i processi automatici valutano la salute dei conti, segnalano anomalie e doppioni e chiudono i cicli carta in scadenza. I promemoria delle bollette nascono dalle tue spese pianificate, con soglie di anticipo che scegli tu nelle Impostazioni.\n\nLa cosa più importante: questo analista AI spese è un aiuto esplorativo, non consulenza finanziaria. Le proiezioni sono stime nominali da confrontare tra scenari, mai garanzie. Email e Telegram restano disattivati finché non li attivi tu. E l'analista è disponibile solo dove è abilitato: funzione self-host, ancora in roadmap, disabilitata sulla demo ospitata e nascosta altrove.";

const BLOCKS = [
  { h: "Cosa fa davvero il tuo analista AI spese",
    p: "Porti tu le domande, l'analista porta la lettura. Esamina conti, transazioni, spesa, avanzamento del Piano, cashflow, money box virtuali, sottoscrizioni e voci pianificate che autorizzi, poi spiega i pattern in parole semplici con grafici e tabelle. Fai domande what-if, come spostare un target del Piano o una spesa pianificata, e confronta gli scenari fianco a fianco.\n\nIntanto lui resta di guardia mentre fai altro. I controlli giornalieri segnalano doppioni, picchi di spesa e cali di salute dei conti. I promemoria nascono dalle tue spese pianificate e le notifiche ti avvertono dei bucket vicini ai limiti, dei pagamenti in scadenza entro sette giorni o della prima data di cashflow negativo proiettato. I suggerimenti sulle sottoscrizioni restano suggerimenti: confermi tu prima che cambi qualsiasi cosa.", },
  { h: "Come funziona, passo passo",
    p: "Prima apri l'analista dove è abilitato e avvii una conversazione in linguaggio naturale. Puoi tenere più conversazioni, rinominarle e scegliere il modello e il livello di ragionamento disponibili. L'analista legge solo i dati che autorizzi in quell'ambiente.\n\nPoi chiedi e controlli. Risponde con spiegazioni, tabelle o grafici e ogni modifica sensibile arriva come anteprima: assegnazioni o target del Piano, spostamenti nei money box virtuali, voci pianificate, aggiornamenti di memoria o ricategorizzazioni multiple. Verifichi importo, valuta, conto, categoria, data e ricorrenza, poi approvi o rifiuti. Se rifiuti, non cambia niente.\n\nIntanto le automazioni seguono la loro programmazione: controlli di sync e notifiche ogni sei ore, controlli anomalie ogni giorno, report mensile e revisione sottoscrizioni in giorni fissi. I promemoria deduplicano per scadenza e soglia, così la stessa bolletta non ti manda spam.", },
  { h: "Limiti onesti: self-host, accesso limitato, mai consulenza",
    p: "Il badge dice Self-host / Roadmap e la demo dice disabilitato. La sezione analista appare solo dove è abilitata; altrove le voci di barra laterale e comandi si nascondono e la pagina mostra funzionalità disabilitata. Automazioni backend e Telegram seguono la loro programmazione a prescindere.\n\nL'analista non dà mai consulenza finanziaria e non scrive mai nel tuo registro di propria iniziativa. Le proiezioni di lungo periodo sono stime nominali costruite dai saldi tracciati e dal cashflow recente, con ipotesi che puoi cambiare in chat — leggile ogni volta e confronta gli scenari, perché niente è garantito. Email e Telegram restano disattivati finché non li attivi esplicitamente, e Telegram va collegato prima. Tu resti l'approvatore di ogni modifica sensibile.", },
  { h: "Per chi è",
    p: "Ami controllo e curiosità in egual misura. Tracci conti e spese pianificate in Tracky, ti piace testare scenari what-if e vuoi segnalazioni di doppioni, picchi e pagamenti in arrivo prima che mordano. Leggi le ipotesi, confronti le stime e approvi ogni modifica di persona.\n\nÈ pensato soprattutto per il self-hosting. Esegui la tua istanza, abiliti l'analista dove decidi tu e colleghi Telegram o email solo se li vuoi. Se cerchi gestione del denaro senza pensieri o consulenza finanziaria certificata, questo non lo è — e lo dice subito. Hai un assistente che propone, un registro che aspetta e una decisione finale che resta tua.", },
];

const PAGE_FAQ = [
  { q: "Cosa può modificare l'analista AI spese senza chiedermi niente?",
    a: "Niente di sensibile. Ogni assegnazione del Piano, spostamento nei money box virtuali, voce pianificata, aggiornamento di memoria o ricategorizzazione multipla arriva come anteprima e aspetta la tua approvazione. Vedi tutti i dettagli in anticipo e, se rifiuti, i dati restano invariati. Spiegazioni, grafici e what-if in sola lettura non richiedono approvazione perché non cambiano niente.", },
  { q: "Perché l'analista è disabilitato sulla demo ospitata?",
    a: "L'analista è disponibile solo dove è abilitato e porta il badge Self-host / Roadmap. Sulla demo ospitata la sezione sparisce da barra laterale e palette dei comandi, e aprendola vedi funzionalità disabilitata. Le automazioni backend continuano con la loro programmazione. Per provare l'analista, installa Tracky in self-hosting e abilitalo nel tuo ambiente.", },
  { q: "Le proiezioni dell'analista sono garantite?",
    a: "No. Ogni proiezione è una stima nominale basata su saldi tracciati, cashflow recente e ipotesi dichiarate che puoi cambiare in chat. I risultati mostrano le ipotesi così confronti gli scenari fianco a fianco. Usale come aiuti esplorativi, non come consulenza finanziaria, e verifica sempre le decisioni sui dati del contratto.", },
  { q: "Come mi raggiungono promemoria e notifiche?",
    a: "I promemoria nascono dalle spese pianificate con soglie di anticipo che scegli nelle Impostazioni, fino a quattro soglie per voce, con deduplica per scadenza. Le notifiche di Piano, sottoscrizioni, cashflow e sync vengono valutate ogni sei ore. Tutto arriva prima nella casella in-app; email e Telegram consegnano solo tipi selezionati dopo il tuo opt-in esplicito.", },
  { q: "Posso collegare Telegram all'analista?",
    a: "Sì, dove l'analista è abilitato. Generi un comando monouso nelle Impostazioni e lo invii in privato al bot configurato; scade dopo dieci minuti e funziona una sola volta. Puoi scollegarlo quando vuoi. Le richieste che richiedono approvazione continuano a dirlo e i report Telegram restano spenti finché non li attivi.", },
];

export const Route = createFileRoute('/it/funzioni/analyst-ai')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Analyst AI: propone, tu firmi · Tracky',
      description:
        "L'analyst di Tracky legge i tuoi dati per what-if e anomalie. Scritture con approvazione, email/Telegram opzionali. Disabilitato sulla demo.",
      locale: 'it',
      path: '/it/funzioni/analyst-ai',
      ogImage: ogImageFor('feature-analyst'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/analyst-ai', inLanguage: ['it', 'en'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Analyst AI', path: '/it/funzioni/analyst-ai' },
        ]),
      ],
    }),
  component: AnalystIt,
});

function AnalystIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/analyst-ai">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host / Roadmap</span>
            <span className="mk-badge">Disabilitato sulla demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Lui propone.
            <br />
            <span className="hl">Tu firmi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            L'analyst è un <b>aiuto esplorativo, non consulenza finanziaria</b>: what-if, grafici, segnalazioni di
            anomalie e doppioni sui dati che autorizzi. Le scritture sensibili richiedono anteprima + approvazione;
            email e Telegram sono spenti di default. Gated per ambiente — nascosto dove non abilitato, demo inclusa.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Abilitalo in self-host →
          </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['WHAT-IF', 'ANOMALIE', 'CON APPROVAZIONE', 'SPENTI DI DEFAULT', 'NON CONSULENZA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>✅ LO FA</h3>
              <ul>
                <li>Scenari what-if sui tuoi dati</li>
                <li>Doppioni + picchi segnalati</li>
                <li>Promemoria bollette, alert sync</li>
                <li>Propone — tu approvi</li>
              </ul>
            </div>
            <div className="mk-d bad">
              <h3>🚫 MAI</h3>
              <ul>
                <li>Consulenza finanziaria</li>
                <li>Scritture autonome</li>
                <li>Spam di default</li>
                <li>Promesse o garanzie</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {BLOCKS.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            <p className="mk-sub" style={{ maxWidth: 700 }}>{block.p}</p>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>Domande e risposte.</h2>
        </Reveal>
        {PAGE_FAQ.map((entry) => (
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
            <h2 className="mk-h2">Assistenza, non pilota automatico.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Self-hosted · gated · prima l'approvazione</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
