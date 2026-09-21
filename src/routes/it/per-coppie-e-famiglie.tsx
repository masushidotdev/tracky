import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "Dividete affitto, frigo e corse a scuola, eppure i soldi accendono sempre la stessa discussione: spendete entrambi in buona fede e nessuno dei due vede il quadro intero. Se cercavate un budget familiare coppie che metta tutti d'accordo, Tracky elimina proprio questo problema. La vostra famiglia ha un unico Piano con gli stessi saldi e gli stessi bucket, visibili a entrambi allo stesso tavolo.\n\nLe grandi spese smettono di essere sorprese. Date a retta scolastica, assicurazione e vacanze i loro bucket con un obiettivo e una scadenza, e Tracky stima quanto accantonare questo mese. Saltate un mese e la richiesta del mese dopo cresce da sola. I money box sono buste virtuali che pre-finanziano gli stessi obiettivi, e potete collegarne uno a un bucket del Piano così Tracky lo conta come già accantonato.\n\nNel quotidiano spendete entrambi dallo stesso bucket della spesa e l'attività elenca ogni movimento in un unico registro, così niente interrogatori sugli scontrini. Le entrate finiscono in Pronte da assegnare, e date a ogni euro un compito finché non arriva a zero. Provate la Demo gratis senza carta: sedetevi insieme, guardate gli stessi numeri e chiudete il mese in una sola sera.";

const BLOCKS = [
  { h: "Due portafogli, un punto cieco",
    p: "Uno dei due paga l'affitto, l'altro la spesa, e tutti e due tirano a indovinare su cosa resta. La retta arriva a settembre come un'imboscata, la vacanza si prenota sulla speranza, e la bolletta grossa arriva proprio quando il conto è più leggero. Poi tocca all'interrogatorio serale: chi ha speso cosa, e perché nessuno l'ha visto arrivare?\n\nIn questa storia nessuno è sprovveduto. Semplicemente non avete mai avuto un unico posto dove ogni euro aveva già un compito prima che il mese iniziasse.", },
  { h: "Una giornata tipo con questo budget familiare coppie",
    p: "Mattina: aprite un unico Piano e vedete entrambi lo stesso Disponibile in ogni bucket — casa, spesa, scuola, vacanze. Fate la spesa l'uno e l'altra, e l'attività elenca ogni movimento in un unico registro condiviso, così la fiducia sostituisce l'interrogatorio. Le spese annuali si finanziano mese dopo mese: un'assicurazione in scadenza a marzo chiede di meno man mano che il bucket si riempie, e i mesi saltati fanno salire da sola la richiesta successiva, come stima che si aggiusta.\n\nSera: i money box mostrano scuola e vacanze che crescono virtualmente, già conteggiati come accantonati nei loro bucket del Piano. Le entrate arrivano in Pronte da assegnare e le assegnate insieme, giù fino a zero, chiudendo la giornata sugli stessi numeri.", },
  { h: "Un tavolo, stessi numeri stasera",
    p: "Iniziate dalla Demo gratis — senza carta, solo la vostra casa e pochi minuti onesti. Create un unico Piano sui conti che condividete, aggiungete bucket per casa, spesa, scuola e vacanze, e date alle spese annuali un obiettivo con la sua scadenza. Collegate i risparmi che avete già come money box virtuale così il bucket li conta come già accantonati.\n\nPoi finanziate il mese insieme: assegnate le entrate finché Pronte da assegnare non arriva a zero, partendo dai bucket in rosso e dagli obiettivi in scadenza. Da stasera, ogni acquisto ha un bucket e ogni bucket è visibile a entrambi.", },
];

const PAGE_FAQ = [
  { q: "Perché scegliere Tracky come budget familiare coppie?",
    a: "Perché smettete di negoziare tra due versioni della verità. Un unico Piano mostra a entrambi gli stessi saldi, gli stessi bucket e ogni movimento in un unico registro delle attività. Le spese annuali hanno obiettivi con scadenza, scuola e vacanze crescono in money box virtuali, e alle entrate date un compito insieme finché Pronte da assegnare non arriva a zero.", },
  { q: "Come risparmiamo per scuola e vacanze senza panico?",
    a: "Date a ognuna un money box — virtuale, con importo obiettivo e data — e collegatelo al suo bucket del Piano così il salvato conta come già accantonato. Il bucket chiede poi solo ciò che manca ancora, come stima che si aggiusta ogni mese. Niente doppi accantonamenti, niente imboscate a settembre.", },
  { q: "Cosa succede se uno dei due spende troppo?",
    a: "Il bucket diventa rosso e lo vedete entrambi — niente caccia al colpevole, solo una decisione. Spostate il Disponibile da un altro bucket per coprire lo sforamento cash, o finanziate il bucket di pagamento della carta quando l'acquisto è sulla carta. Se non fate nulla, l'ammanco abbassa le Pronte da assegnare del mese dopo.", },
  { q: "Come iniziamo insieme questa settimana?",
    a: "Aprite la Demo gratis — senza carta — e costruite un unico Piano sui conti che condividete. Aggiungete bucket per casa, spesa, scuola e vacanze, poi assegnate le entrate insieme finché Pronte da assegnare non arriva a zero. Sedetevi allo stesso tavolo, guardate gli stessi numeri e concordate il mese in una sola sera.", },
];

export const Route = createFileRoute('/it/per-coppie-e-famiglie')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budget per coppie e famiglie, stessi numeri · Tracky',
      description:
        'Un piano, stessi saldi e bucket per tutta la casa. Money box per scuola, vacanze e bollette. Demo gratis, senza carta.',
      locale: 'it',
      path: '/it/per-coppie-e-famiglie',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/per-coppie-e-famiglie', inLanguage: ['it', 'en'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Per coppie e famiglie', path: '/it/per-coppie-e-famiglie' },
        ]),
      ],
    }),
  component: CouplesIt,
});

function CouplesIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/per-coppie-e-famiglie">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Stessi numeri.
            <br />
            <span className="stroke">Zero</span> <span className="hl">litigi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Una casa, un piano: <b>stessi saldi, stessi bucket</b>, visibili a tutti. I money box pre-finanziano
            virtualmente scuola, vacanze e bollette grosse. Niente più “pensavo ci fossero…”.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['UN PIANO', 'STESSI BUCKET', 'MONEY BOX', 'SCUOLA + VACANZE', 'ZERO LITIGI']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <DragStrip>
            <div className="mk-card"><div className="e">🏠</div><h3>CASA</h3><p>Affitto, bollette, mutuo — finanziati prima che inizi il mese.</p></div>
            <div className="mk-card"><div className="e">🛒</div><h3>SPESA</h3><p>Un bucket, due carrelli. L'attività mostra chi ha speso cosa.</p></div>
            <div className="mk-card"><div className="e">🎒</div><h3>SCUOLA</h3><p>Accantonata trimestre per trimestre. Niente panico a settembre.</p></div>
            <div className="mk-card"><div className="e">🏖️</div><h3>VACANZE</h3><p>Un po' ogni mese. Prenotate quando finanziate, non quando sperate.</p></div>
          </DragStrip>
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
            <h2 className="mk-h2">Un tavolo. Stessi numeri.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
