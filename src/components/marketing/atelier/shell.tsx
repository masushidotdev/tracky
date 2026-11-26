import * as React from 'react';

import '../../../styles/marketing/atelier.css';
import { TrackyMark } from './brand';

import type { MarketingAuth } from './types';
import type { AppLocale } from '@/lib/i18n';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { marketingPages } from '@/lib/marketing/pages';

export const GITHUB_REPO_URL = 'https://github.com/masushidotdev/tracky';

export type AtelierSiteProps = {
  locale: AppLocale;
  auth: MarketingAuth;
  currentPath: string;
  children: React.ReactNode;
};

type FooterLink = { label: string; href: string; external?: boolean };

function buildNavItems(locale: AppLocale, currentPath: string) {
  const isHome = currentPath === '/' || currentPath === '/it/';
  const homePrefix = locale === 'it' ? '/it/' : '/';

  if (locale === 'it') {
    return [
      { key: 'how', label: 'Come funziona', href: isHome ? '#how-it-works' : `${homePrefix}#how-it-works` },
      { key: 'features', label: 'Funzioni', href: '/it/funzioni/piano-zero-based' },
      { key: 'deploy', label: 'Demo vs self-host', href: isHome ? '#deployment' : '/it/open-source' },
      { key: 'pricing', label: 'Prezzi', href: '/it/prezzi' },
      { key: 'faq', label: 'FAQ', href: '/it/domande-frequenti' },
    ];
  }

  return [
    { key: 'how', label: 'How it works', href: isHome ? '#how-it-works' : `${homePrefix}#how-it-works` },
    { key: 'features', label: 'Features', href: '/features/zero-based-plan' },
    { key: 'deploy', label: 'Demo vs self-host', href: isHome ? '#deployment' : '/open-source' },
    { key: 'pricing', label: 'Pricing', href: '/pricing' },
    { key: 'faq', label: 'FAQ', href: '/faq' },
  ];
}

function buildFooterColumns(locale: AppLocale): Array<{ title: string; links: Array<FooterLink> }> {
  if (locale === 'it') {
    return [
      {
        title: 'Prodotto',
        links: [
          { label: 'Piano zero-based', href: '/it/funzioni/piano-zero-based' },
          { label: 'Proiezione flusso di cassa', href: '/it/funzioni/flusso-di-cassa' },
          { label: 'Report ed export CSV', href: '/it/funzioni/report' },
          { label: 'Connessioni bancarie (self-host)', href: '/it/funzioni/collegamento-bancario' },
          { label: 'Analyst AI (self-host)', href: '/it/funzioni/analyst-ai' },
        ],
      },
      {
        title: "Guide e casi d'uso",
        links: [
          { label: 'Tracky vs fogli di calcolo', href: '/it/vs-fogli-di-calcolo' },
          { label: 'Per freelance e partita IVA', href: '/it/per-freelance-e-partita-iva' },
          { label: 'Per coppie e famiglie', href: '/it/per-coppie-e-famiglie' },
          { label: 'Guida al budget zero-based', href: '/it/guide/budget-zero-based' },
          { label: 'Guida al flusso di cassa', href: '/it/guide/previsione-flusso-di-cassa' },
          { label: 'Cancella abbonamenti inutili', href: '/it/guide/cancella-abbonamenti-inutili' },
        ],
      },
      {
        title: 'Progetto',
        links: [
          { label: 'Prezzi', href: '/it/prezzi' },
          { label: 'Open source e self-host', href: '/it/open-source' },
          { label: 'Self-hosting con Docker', href: '/it/blog/self-hosting-tracky-docker' },
          { label: 'Note di rilascio (v0.1.0)', href: '/it/blog/tracky-v0-1-0' },
          { label: 'FAQ', href: '/it/domande-frequenti' },
          { label: 'Repository GitHub ↗', href: GITHUB_REPO_URL, external: true },
        ],
      },
    ];
  }

  return [
    {
      title: 'Product',
      links: [
        { label: 'Zero-based Plan', href: '/features/zero-based-plan' },
        { label: 'Cash-flow projection', href: '/features/cash-flow' },
        { label: 'Reports & CSV export', href: '/features/reports' },
        { label: 'Bank connections (self-host)', href: '/features/bank-connections' },
        { label: 'AI Analyst (self-host)', href: '/features/ai-analyst' },
      ],
    },
    {
      title: 'Guides & use cases',
      links: [
        { label: 'Tracky vs. spreadsheets', href: '/vs-spreadsheets' },
        { label: 'For freelancers', href: '/for-freelancers' },
        { label: 'For couples & families', href: '/for-couples-and-families' },
        { label: 'Zero-based budgeting guide', href: '/guides/zero-based-budgeting' },
        { label: 'Cash-flow forecast guide', href: '/guides/cash-flow-forecast' },
        { label: 'Cancel unused subscriptions', href: '/guides/cancel-unused-subscriptions' },
      ],
    },
    {
      title: 'Project',
      links: [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Open source & self-host', href: '/open-source' },
        { label: 'Self-hosting with Docker', href: '/blog/self-hosting-tracky-docker' },
        { label: 'Release notes (v0.1.0)', href: '/blog/tracky-v0-1-0' },
        { label: 'FAQ', href: '/faq' },
        { label: 'GitHub repository ↗', href: GITHUB_REPO_URL, external: true },
      ],
    },
  ];
}

/**
 * Shared Atelier v2 public marketing shell: sticky header, responsive drawer,
 * structured footer, and document.documentElement.lang sync.
 */
export function AtelierSite({ locale, auth, currentPath, children }: AtelierSiteProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const drawerId = 'mka-mobile-drawer';

  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const page = marketingPages.find((entry) => entry.en === currentPath || entry.it === currentPath);
  const langHref = page ? (locale === 'en' ? page.it : page.en) : locale === 'en' ? '/it/' : '/';
  const homeHref = locale === 'it' ? '/it/' : '/';
  const navItems = buildNavItems(locale, currentPath);
  const footerColumns = buildFooterColumns(locale);

  const isIt = locale === 'it';
  const primaryHref = auth.user ? '/app' : auth.signUpUrl;
  const primaryLabel = auth.user
    ? isIt
      ? 'Apri la demo →'
      : 'Open the demo →'
    : isIt
      ? 'Prova gratis la demo →'
      : 'Try the demo free →';
  const primaryShortLabel = auth.user
    ? isIt
      ? 'Apri demo →'
      : 'Open demo →'
    : isIt
      ? 'Prova demo →'
      : 'Try demo →';

  const onSignInClick = () => {
    // sendBeacon: the full-page WorkOS redirect unloads us before XHR flushes.
    trackEvent(analyticsEvents.signinStarted, { cta_location: 'nav' }, { sendBeacon: true });
  };

  const onSignUpClick = () => {
    if (auth.user) return;
    // sendBeacon: the full-page WorkOS redirect unloads us before XHR flushes.
    trackEvent(analyticsEvents.signupStarted, { cta_location: 'nav' }, { sendBeacon: true });
  };

  return (
    <div className="mka">
      <a className="mka-skip-link" href="#main">
        {isIt ? 'Vai al contenuto' : 'Skip to content'}
      </a>

      <header className="mka-header">
        <div className="mka-container mka-header-inner">
          <a className="mka-wordmark" href={homeHref} aria-label={isIt ? 'Tracky — pagina iniziale' : 'Tracky home'}>
            <TrackyMark />
            <span>Tracky</span>
          </a>

          <nav aria-label={isIt ? 'Navigazione principale' : 'Primary navigation'}>
            <ul className="mka-nav-links">
              {navItems.map((item) => (
                <li key={item.key}>
                  <a href={item.href} aria-current={item.href === currentPath ? 'page' : undefined}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mka-header-actions">
            <a
              className="mka-lang-switch"
              href={langHref}
              lang={isIt ? 'en' : 'it'}
              aria-label={isIt ? 'Switch to English' : "Passa all'italiano"}
            >
              {isIt ? 'EN' : 'IT'}
            </a>
            <a className="mka-link-subtle" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub ↗
            </a>
            {!auth.user ? (
              <a className="mka-link-subtle" href={auth.signInUrl} onClick={onSignInClick}>
                {isIt ? 'Accedi' : 'Sign in'}
              </a>
            ) : null}
            <a className="mka-btn-primary" href={primaryHref} onClick={onSignUpClick}>
              {primaryLabel}
            </a>
          </div>

          <div className="mka-mobile-controls">
            <a className="mka-btn-primary mka-btn-primary--sm" href={primaryHref} onClick={onSignUpClick}>
              {primaryShortLabel}
            </a>
            <button
              ref={menuBtnRef}
              type="button"
              className="mka-menu-btn"
              aria-expanded={menuOpen}
              aria-controls={drawerId}
              aria-label={
                menuOpen
                  ? isIt
                    ? 'Chiudi il menu di navigazione'
                    : 'Close navigation menu'
                  : isIt
                    ? 'Apri il menu di navigazione'
                    : 'Open navigation menu'
              }
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 4L14 14M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 5H15.5M2.5 9H15.5M2.5 13H15.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className={menuOpen ? 'mka-mobile-drawer is-open' : 'mka-mobile-drawer'} id={drawerId} hidden={!menuOpen}>
          <ul className="mka-mobile-nav-list">
            {navItems.map((item) => (
              <li key={item.key}>
                <a href={item.href} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mka-mobile-drawer-actions">
            <a
              className="mka-btn-primary"
              href={primaryHref}
              onClick={() => {
                onSignUpClick();
                setMenuOpen(false);
              }}
            >
              {primaryLabel}
            </a>
            <a
              className="mka-btn-secondary mka-btn-secondary--sm"
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              GitHub (MIT) ↗
            </a>
            {!auth.user ? (
              <a
                className="mka-link-subtle"
                href={auth.signInUrl}
                onClick={() => {
                  onSignInClick();
                  setMenuOpen(false);
                }}
              >
                {isIt ? 'Accedi' : 'Sign in'}
              </a>
            ) : null}
            <a
              className="mka-lang-switch"
              href={langHref}
              lang={isIt ? 'en' : 'it'}
              aria-label={isIt ? 'Switch to English' : "Passa all'italiano"}
              onClick={() => setMenuOpen(false)}
            >
              {isIt ? 'English (EN)' : 'Italiano (IT)'}
            </a>
          </div>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="mka-footer">
        <div className="mka-container">
          <div className="mka-footer-grid">
            <div className="mka-footer-brand">
              <a className="mka-wordmark" href={homeHref} aria-label={isIt ? 'Tracky — pagina iniziale' : 'Tracky home'}>
                <TrackyMark />
                <span>Tracky</span>
              </a>
              <p>
                {isIt
                  ? 'Budget zero-based e pianificazione del flusso di cassa open source con licenza MIT. Non è consulenza finanziaria: tutte le proiezioni sono stime di pianificazione costruite sui tuoi dati.'
                  : 'Open-source, MIT-licensed zero-based budgeting and cash-flow planning. Not financial advice; all projections are planning estimates built from your data.'}
              </p>
            </div>

            {footerColumns.map((col) => (
              <div className="mka-footer-col" key={col.title}>
                <h3>{col.title}</h3>
                <ul>
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noopener noreferrer' : undefined}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mka-footer-bottom">
            <span>
              {isIt ? '© 2026 Tracky contributors · Licenza MIT' : '© 2026 Tracky contributors · MIT License'}
            </span>
            <span>
              {isIt
                ? 'Costruito con Convex, TanStack Start e WorkOS AuthKit'
                : 'Built with Convex, TanStack Start & WorkOS AuthKit'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
