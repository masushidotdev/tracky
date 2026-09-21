import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "Vuoi tenere traccia delle spese senza digitare ogni scontrino, e questa sincronizzazione banca PSD2 ti dà proprio questo sul tuo server. Colleghi la banca tramite Enable Banking, approvi l'accesso presso la tua banca e Tracky importa conti, saldi e movimenti. Non consegni mai le credenziali bancarie a Tracky e nessuno del team le vede.\n\nResti al comando anche dopo il collegamento. Dai a ogni conto un alias riconoscibile, nascondi i conti che non vuoi nei totali della Dashboard e disattivi la sincronizzazione per singolo conto senza perdere lo storico. Rinnovi il consenso quando la banca lo chiede e la cronologia delle importazioni mostra cosa è arrivato e cosa è stato scartato come duplicato.\n\nQuesta pagina dichiara subito un limite onesto. La sincronizzazione bancaria è solo self-host ed è disabilitata sulla demo ospitata, dove conti manuali e CSV tengono la scena. Sulla tua istanza usi le tue chiavi app Enable Banking e, se il provider non è configurato, il pulsante di collegamento resta disabilitato.\n\nHai comunque il quadro completo dove conta. Apri ogni conto di liquidità o credito nel suo registro e controlli Tutti i conti per la vista condivisa. Ogni conto conserva la propria valuta come comunicata dalla banca e i conti carta restano passività, mai liquidità.";

const BLOCKS = [
  { h: "Cosa fa la sincronizzazione banca PSD2",
    p: "Colleghi la banca una volta e Tracky mantiene aggiornato il quadro dei tuoi soldi, con conti, snapshot dei saldi e movimenti raggruppati nella barra laterale come Liquidità, Credito e Prestiti. Apri qualsiasi conto di liquidità o credito per il suo registro dedicato, usi Tutti i conti per la vista condivisa e rinomini i conti con gli alias senza toccare i dati del provider. Nascondi i conti che vuoi escludere dai totali della Dashboard conservandoli, e aggiungi conti manuali per contanti, carte o prestiti che la banca non espone. Vedi sempre lo stato — attiva, disattivata, in errore o in attesa di rinnovo del consenso — così niente si aggiorna in silenzio.", },
  { h: "Come funziona, passo passo",
    p: "Apri Impostazioni → Connessioni bancarie e scegli la tua banca dall'elenco. Accedi e approvi l'accesso presso la tua banca, non dentro Tracky, poi torni e Tracky crea la connessione e importa i conti con valuta, stato e snapshot dei saldi. Lasci i controlli automatici ogni sei ore e richiedi un aggiornamento su qualsiasi conto quando vuoi dati freschi, rinnovando il consenso quando la banca lo chiede o quando vedi Ricollega. Controlli la cronologia delle importazioni quando i numeri sorprendono, perché mostra elementi visti e importati, e spesso i buchi sono duplicati scartati o dati non ancora pubblicati dalla banca.", },
  { h: "Limiti onesti: solo self-host, disabilitata sulla demo",
    p: "Meriti tutta la verità prima di cliccare, quindi ecco il badge: solo self-host; DISABILITATA sulla demo ospitata; porta le tue chiavi Enable Banking. Usi la sincronizzazione bancaria solo su un'istanza dove il provider è configurato con le tue chiavi app Enable Banking, e trovi il pulsante disabilitato ovunque manchino le chiavi. Esplori la demo ospitata con conti manuali e importazione CSV con mappatura delle colonne, un fallback onesto che funziona ovunque. Revochi l'accesso quando vuoi presso la tua banca e puoi disattivare la sincronizzazione per singolo conto dentro Tracky senza cancellare lo storico.", },
  { h: "A chi è adatta",
    p: "Ami l'automazione ma vuoi restare padrone dei tuoi dati e delle chiavi che li toccano. Gestisci Tracky in proprio o pensi di farlo, non ti spaventa creare un'app Enable Banking e aggiungerne le chiavi alla tua istanza, e hai conti presso banche che condividono dati via PSD2. Segui contanti, carte e prestiti affiancati e apprezzi alias, conti nascosti e registri per conto, con l'importazione CSV a coprire dove la sincronizzazione non arriva. Se ti riconosci, installa Tracky in self-host, collega la banca e rinnova il consenso senza drammi quando scade.", },
];

const PAGE_FAQ = [
  { q: "Questa sincronizzazione banca PSD2 funziona sulla demo ospitata?",
    a: "No. La sincronizzazione è solo self-host e resta DISABILITATA sulla demo ospitata per scelta. Esplori la demo con conti manuali e importazione CSV. Le connessioni live funzionano solo sulla tua istanza, dove configuri il provider con le tue chiavi app Enable Banking.", },
  { q: "Tracky conserva le mie credenziali bancarie?",
    a: "No. Ti autentichi e approvi l'accesso presso la tua banca tramite Enable Banking. Tracky non chiede mai le tue credenziali bancarie e nessuno del team le vede. Puoi revocare l'accesso presso la banca in qualsiasi momento e puoi anche disattivare la sincronizzazione per singolo conto dentro Tracky.", },
  { q: "Cosa faccio quando una sincronizzazione fallisce?",
    a: "Rinnova prima il consenso quando vedi Ricollega o Autorizzazione richiesta. Apri il dettaglio del job quando lo stato è errore, poi riprova più tardi. Aggiornamenti ripetuti non forzano la banca a pubblicare nuovi dati. La disponibilità dipende comunque dalla banca, anche quando la connessione sembra sana.", },
  { q: "Posso rinominare, nascondere o mettere in pausa un conto?",
    a: "Sì. Imposti un alias per cambiare il nome visualizzato senza modificare i dati del provider. Nascondi i conti che vuoi escludere dai totali della Dashboard, conservandoli e ripristinandoli facilmente. Disattivi la sincronizzazione per singolo conto per fermare i futuri aggiornamenti mantenendo tutto lo storico.", },
  { q: "Quali conti vengono importati?",
    a: "Dipende da cosa la tua banca condivide tramite Enable Banking. Tracky importa solo conti, saldi e movimenti forniti dall'istituto. Copri i buchi con conti manuali e importazione CSV con mappatura delle colonne. Quando il provider non è configurato su un'istanza, il pulsante di collegamento resta disabilitato.", },
];

export const Route = createFileRoute('/it/funzioni/collegamento-bancario')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Collegamento bancario PSD2, le tue chiavi · Tracky',
      description:
        'Tracky sincronizza le banche via Enable Banking con consenso in banca. Usa le tue chiavi app sul self-host; disabilitato sulla demo.',
      locale: 'it',
      path: '/it/funzioni/collegamento-bancario',
      ogImage: ogImageFor('feature-banksync'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/collegamento-bancario', inLanguage: ['it', 'en'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Collegamento bancario', path: '/it/funzioni/collegamento-bancario' },
        ]),
      ],
    }),
  component: BankIt,
});

function BankIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/collegamento-bancario">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host</span>
            <span className="mk-badge">Disabilitato sulla demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            La banca,
            <br />
            <span className="stroke">le tue</span> <span className="hl">chiavi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            La sync passa da <b>Enable Banking</b>: il consenso avviene in banca, Tracky importa conti, saldi e
            movimenti. Ogni utente collega <b>la propria app e le proprie chiavi</b> — nessuno vede le credenziali. Se
            il provider non è configurato, il collegamento resta disabilitato. La demo non ce l'ha: conti manuali + CSV
            fanno tutto.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Self-host con sync →
          </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['CONSENSO PSD2', 'LE TUE CHIAVI', 'REVOCABILE SEMPRE', 'FALLBACK CSV', 'NESSUNA CREDENZIALE SALVATA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <figure className="mk-shot">
            <img src="/shots/import-mapping.png" alt="Mappatura colonne CSV di Tracky: il fallback manuale quando la sync non è disponibile" width={1440} height={800} loading="lazy" />
            <figcaption>Il fallback onesto: mappatura colonne CSV. Funziona ovunque, demo inclusa.</figcaption>
          </figure>
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
            <h2 className="mk-h2">Sync dove lo ospiti. CSV ovunque.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Repo MIT · le tue chiavi · revocabile</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
