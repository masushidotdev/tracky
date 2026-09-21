import { createFileRoute } from '@tanstack/react-router';

type OgSearch = {
  title?: string;
  kicker?: string;
};

/**
 * OG image template (1200×630): Vivi-styled card rendered as plain HTML.
 * Not linked anywhere (robots-disallowed); screenshotted at build time by
 * scripts/og-images.mjs via the Cloudflare Browser Rendering screenshot API
 * into public/og/*.png. Query params keep one route for all 15 pages.
 */
export const Route = createFileRoute('/og')({
  validateSearch: (search): OgSearch => ({
    title: typeof search.title === 'string' ? search.title : undefined,
    kicker: typeof search.kicker === 'string' ? search.kicker : undefined,
  }),
  component: OgTemplate,
});

function OgTemplate() {
  const { title, kicker } = Route.useSearch();
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#f2efe6',
        color: '#0d0d12',
        fontFamily: "'Archivo Black','Arial Black',sans-serif",
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 90px',
        boxSizing: 'border-box',
        border: '24px solid #0d0d12',
      }}
    >
      <div
        style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: 'uppercase',
        }}
      >
        {kicker ?? 'Tracky* — open source budget'}
      </div>
      <div style={{ fontSize: 84, lineHeight: 1, textTransform: 'uppercase', marginTop: 24 }}>
        {title ?? 'Your money works. You live.'}
      </div>
      <div
        style={{
          marginTop: 32,
          display: 'inline-block',
          background: '#d8ff3e',
          border: '4px solid #0d0d12',
          boxShadow: '8px 8px 0 #0d0d12',
          fontSize: 30,
          padding: '12px 28px',
          transform: 'rotate(-1.5deg)',
          alignSelf: 'flex-start',
        }}
      >
        FREE · MIT
      </div>
    </div>
  );
}
