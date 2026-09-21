import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const faq = [
  {
    q: 'Tracky è davvero un budget open source self-hosted con licenza MIT?',
    a: 'Sì. Il codice su masushidotdev/tracky ha licenza MIT: puoi usarlo, modificarlo e distribuirlo mantenendo il copyright notice. Esegui backend Convex e frontend Worker tuoi, con le tue chiavi. Il badge in questa pagina rispecchia la licenza del repo — un solo codice, leggibile da tutti.',
  },
  {
    q: 'La demo ospitata include sync bancaria e analyst?',
    a: 'No. La demo è un deployment limitato dello stesso codice, così esplori senza configurare servizi. Sync bancaria e analyst si attivano nel tuo deployment con i tuoi servizi e le tue chiavi. Considera l\'analyst un aiuto, mai una consulenza finanziaria o un consulente finanziario.',
  },
  {
    q: 'Cosa serve per la mia installazione?',
    a: 'Un tuo deployment Convex, un tuo ambiente WorkOS e facoltativamente la tua app Enable Banking per i collegamenti bancari. Il repo dà la procedura esatta: npm ci, .env.local compilato, npx convex dev e npm run dev. Non puntare mai un checkout al backend di qualcun altro.',
  },
  {
    q: 'Proiezioni, abbonamenti e money box sono affidabili?',
    a: 'Le proiezioni sono stime basate sui dati salvati, mai saldi garantiti — verifica sempre con la banca. Il rilevamento abbonamenti è un suggerimento, non una certezza: conferma esercente, importo e cadenza. I money box sono buste virtuali dentro l\'app e ogni valuta mantiene totali separati — niente viene mai convertito.',
  },
];

export const Route = createFileRoute('/it/open-source')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky è open source MIT — installalo tu',
      description:
        'Tracky è MIT su GitHub: backend Convex, frontend TanStack, guide bilingue. Prova la demo ospitata o eseguilo tuo.',
      locale: 'it',
      path: '/it/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/open-source', inLanguage: ['it', 'en'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Open source', path: '/it/open-source' },
        ]),
      ],
    }),
  component: OssIt,
});

function OssIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/open-source">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">MIT</span>
            <span className="mk-badge">GitHub</span>
            <span className="mk-badge">Self-host</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Leggilo.
            <br />
            <span className="stroke">Forkalo.</span>
            <br />
            <span className="hl">Eseguilo.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky è <b>licenza MIT</b> su <b>masushidotdev/tracky</b>: backend Convex, frontend TanStack Start, guide
            bilingue, decisioni scritte in aperto. La demo è un deployment di questo codice — il tuo può abilitare sync
            bancaria, analyst e funzioni Pro con le tue chiavi.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MagnetCta href="https://github.com/masushidotdev/tracky">★ Stella su GitHub →</MagnetCta>
            <MagnetCta href={user ? '/app' : signUpUrl} variant="pill">
              {user ? 'Apri la demo →' : 'Prova la demo →'}
            </MagnetCta>
          </div>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>Vuoi un budget tracker che puoi davvero ispezionare. Tracky è un budget open source self-hosted con licenza MIT su masushidotdev/tracky: backend Convex e frontend TanStack Start che puoi leggere riga per riga. Niente scatole nere tra te e i tuoi soldi.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Prova prima la demo ospitata e sfoglia Dashboard, Plan, Report e Cash Flow. Quando ti convince, esegui il tuo deployment con le tue chiavi personali: la tua installazione può attivare sync bancaria, analyst e funzioni Pro-gated che restano spente sulla demo condivisa.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Le proiezioni sono sempre stime calcolate dai dati salvati e i totali in valute diverse non vengono mai convertiti. Tutto è documentato in inglese e italiano e ogni decisione di prodotto è scritta in aperto, così capisci perché le cose funzionano in un certo modo.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Fai fork del repo, apri una pull request mirata e il tuo miglioramento può arrivare a tutti. Dai una stella al repo per restare aggiornato sugli sviluppi. I tuoi soldi, il tuo server, le tue regole — verificate nel codice che puoi leggere.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['LICENZA MIT', 'CONVEX + TANSTACK', 'GUIDE BILINGUE', 'DECISIONI IN APERTO', 'LE TUE CHIAVI']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Un budget tracker open source self-hosted con licenza MIT</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>La licenza MIT ti dà il playbook completo: usa Tracky, modificalo e distribuisci la tua versione, mantenendo il copyright notice. Sotto il cofano trovi backend Convex con schema tipizzato, frontend TanStack Start e deployment su Cloudflare Worker — lo stesso codice della demo ospitata. Le guide utente escono in inglese e italiano e le decisioni di prodotto sono scritte in aperto, così sai sempre perché una funzione si comporta in un certo modo. Leggi il codice prima di affidargli un solo euro: è proprio questo il punto.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Dal clone al tuo deployment</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Clona il repo, installa con npm ci, copia .env.local.example in .env.local e punta l'app al tuo deployment Convex con npx convex dev. Ogni installazione ha backend proprio, ambiente WorkOS proprio e facoltativamente la propria app Enable Banking — non tocchi mai i dati altrui. Lancia npm run dev in locale, poi pubblica il frontend Worker collegandolo al tuo backend Convex per la produzione. Con le tue chiavi attivi l'intero stack — sync bancaria, analyst e funzioni Pro-gated — e puoi contribuire upstream con i tuoi miglioramenti.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Prova la demo, poi contribuisci</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Comincia dalla demo ospitata per sentire il prodotto prima del self-host. Quando vuoi restituire qualcosa, metti una stella a masushidotdev/tracky e apri una pull request mirata — un tema per modifica, suite di test verde, lint pulito. Aggiorna le guide in inglese e italiano quando cambia un comportamento e usa solo dati fittizi stile Acme: mai nomi reali, saldi o export bancari nei commit. I maintainer aggiungono la voce di changelog al merge, quindi puoi saltare quel file — i piccoli contributi onesti battono sempre i grandi redesign.</p>
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
            <h2 className="mk-h2">Fiducia, compilata.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>MIT · GitHub · self-host in minuti</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
