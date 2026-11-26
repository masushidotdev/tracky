import * as React from 'react';

import { FeatureSpotIcon, FitIcon, PosterCornerMotifs, StepIcon } from './brand';

import type { FeatureSpotKind, StepIconKind } from './brand';
import type { MarketingAuth } from '@/components/marketing/site';
import type { AppLocale } from '@/lib/i18n';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

export type StampTone = 'default' | 'cobalt' | 'marigold' | 'sage';
export type SpotTone = 'marigold' | 'cobalt' | 'sage' | 'vermilion';
export type ScopeKind = 'both' | 'selfhost';
export type CtaLocation = 'landing' | 'nav' | 'marketing';

export function Section({
  id,
  tone = 'cotton',
  className = '',
  children,
}: {
  id?: string;
  tone?: 'cotton' | 'parchment';
  className?: string;
  children: React.ReactNode;
}) {
  const toneClass = tone === 'parchment' ? ' mka-section--parchment' : '';
  const extra = className ? ` ${className}` : '';
  return (
    <section id={id} className={`mka-section${toneClass}${extra}`}>
      <div className="mka-container">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="mka-kicker">{children}</span>;
}

export function SectionHead({
  kicker,
  title,
  subtitle,
  action,
  compact = false,
}: {
  kicker: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'mka-section-head mka-section-head--compact' : 'mka-section-head'}>
      <Eyebrow>{kicker}</Eyebrow>
      <h2 className="mka-section-title">{title}</h2>
      {subtitle ? <p className="mka-section-sub">{subtitle}</p> : null}
      {action ? <div className="mka-section-action">{action}</div> : null}
    </div>
  );
}

export function Chip({ tone = 'default', children }: { tone?: StampTone; children: React.ReactNode }) {
  const mod = tone === 'default' ? '' : ` mka-stamp--${tone}`;
  return <span className={`mka-stamp${mod}`}>{children}</span>;
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="mka-stamp-row">{children}</div>;
}

export function ScopePill({ scope, label }: { scope: ScopeKind; label: string }) {
  return (
    <span className={`mka-scope-pill ${scope === 'both' ? 'mka-scope-pill--both' : 'mka-scope-pill--selfhost'}`}>
      {label}
    </span>
  );
}

export function Breadcrumb({ items, ariaLabel }: { items: Array<{ label: string; href?: string }>; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="mka-breadcrumb">
        {items.map((item, idx) => (
          <React.Fragment key={item.label}>
            {idx > 0 ? (
              <li className="mka-breadcrumb-sep" aria-hidden="true">
                /
              </li>
            ) : null}
            <li>
              {item.href ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function AuthCta({
  auth,
  locale,
  ctaLocation,
  variant = 'primary',
  loggedOutLabel,
  loggedInLabel,
}: {
  auth: MarketingAuth;
  locale: AppLocale;
  ctaLocation: CtaLocation;
  variant?: 'primary' | 'primary-lg' | 'marigold';
  loggedOutLabel?: string;
  loggedInLabel?: string;
}) {
  const isIt = locale === 'it';
  const href = auth.user ? '/app' : auth.signUpUrl;
  const label = auth.user
    ? (loggedInLabel ?? (isIt ? 'Apri la demo →' : 'Open the demo →'))
    : (loggedOutLabel ?? (isIt ? 'Prova gratis la demo →' : 'Try the demo free →'));

  const className =
    variant === 'primary-lg'
      ? 'mka-btn-primary mka-btn-primary--lg'
      : variant === 'marigold'
        ? 'mka-btn-marigold'
        : 'mka-btn-primary';

  return (
    <a
      className={className}
      href={href}
      onClick={() =>
        auth.user
          ? undefined
          : trackEvent(analyticsEvents.signupStarted, { cta_location: ctaLocation }, { sendBeacon: true })
      }
    >
      {label}
    </a>
  );
}

export type StepItem = {
  num: string;
  icon: StepIconKind;
  title: string;
  body: React.ReactNode;
};

export function StepCards({ steps }: { steps: Array<StepItem> }) {
  return (
    <div className="mka-steps-grid">
      {steps.map((step) => (
        <article className="mka-step-card" key={step.num}>
          <div className="mka-step-head">
            <span className="mka-step-num">{step.num}</span>
            <StepIcon kind={step.icon} />
          </div>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </article>
      ))}
    </div>
  );
}

export type FeatureCardItem = {
  key: string;
  icon: FeatureSpotKind;
  spotTone: SpotTone;
  scope: ScopeKind;
  scopeLabel: string;
  title: string;
  description: React.ReactNode;
  factLabel: string;
  fact: React.ReactNode;
  linkHref: string;
  linkLabel: string;
};

export function FeatureCard({ item }: { item: FeatureCardItem }) {
  return (
    <article className="mka-feature-card">
      <div className="mka-feature-top">
        <div className={`mka-spot-wrap mka-spot--${item.spotTone}`} aria-hidden="true">
          <FeatureSpotIcon kind={item.icon} />
        </div>
        <ScopePill scope={item.scope} label={item.scopeLabel} />
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="mka-feature-fact">
        <strong>{item.factLabel}</strong> {item.fact}
        <div className="mka-feature-link-row">
          <a className="mka-text-link" href={item.linkHref}>
            {item.linkLabel}
          </a>
        </div>
      </div>
    </article>
  );
}

export function FeatureGrid({ items }: { items: Array<FeatureCardItem> }) {
  return (
    <div className="mka-features-grid">
      {items.map((item) => (
        <FeatureCard key={item.key} item={item} />
      ))}
    </div>
  );
}

export function FitCheck({
  yesTitle,
  yesItems,
  noTitle,
  noItems,
}: {
  yesTitle: string;
  yesItems: Array<React.ReactNode>;
  noTitle: string;
  noItems: Array<React.ReactNode>;
}) {
  return (
    <div className="mka-fit-grid">
      <div className="mka-fit-sheet mka-fit-sheet--yes">
        <div className="mka-fit-head">
          <h3>{yesTitle}</h3>
          <FitIcon kind="yes" />
        </div>
        <ul className="mka-fit-items">
          {yesItems.map((item, idx) => (
            <li key={idx}>
              <span className="mka-fit-badge" aria-hidden="true">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mka-fit-sheet mka-fit-sheet--no">
        <div className="mka-fit-head">
          <h3>{noTitle}</h3>
          <FitIcon kind="no" />
        </div>
        <ul className="mka-fit-items">
          {noItems.map((item, idx) => (
            <li key={idx}>
              <span className="mka-fit-badge" aria-hidden="true">
                ×
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export type PricingTierProps = {
  tag: string;
  figure: string;
  description: string;
  bullets: Array<React.ReactNode>;
  cta?: React.ReactNode;
};

export function PricingCards({ free, pro }: { free: PricingTierProps; pro: PricingTierProps }) {
  return (
    <div className="mka-pricing-grid">
      <div className="mka-pricing-card mka-pricing-card--free">
        <div className="mka-pricing-head">
          <h3 className="mka-pricing-tag">{free.tag}</h3>
          <span className="mka-pricing-fig">{free.figure}</span>
        </div>
        <p className="mka-pricing-desc">{free.description}</p>
        <ul className="mka-pricing-bullets">
          {free.bullets.map((bullet, idx) => (
            <li key={idx}>{bullet}</li>
          ))}
        </ul>
        {free.cta ? <div className="mka-pricing-cta">{free.cta}</div> : null}
      </div>

      <div className="mka-pricing-card mka-pricing-card--pro">
        <div className="mka-pricing-head">
          <h3 className="mka-pricing-tag">{pro.tag}</h3>
          <span className="mka-pricing-fig">{pro.figure}</span>
        </div>
        <p className="mka-pricing-desc">{pro.description}</p>
        <ul className="mka-pricing-bullets">
          {pro.bullets.map((bullet, idx) => (
            <li key={idx}>{bullet}</li>
          ))}
        </ul>
        {pro.cta ? <div className="mka-pricing-cta">{pro.cta}</div> : null}
      </div>
    </div>
  );
}

export type FaqItem = {
  q: string;
  a: string;
  /** Optional rich JSX rendering for display; JSON-LD always uses plain string `a`. */
  aNode?: React.ReactNode;
};

export function FaqSection({
  id = 'faq',
  tone = 'cotton',
  kicker,
  title,
  subtitle,
  moreLink,
  items,
  defaultOpenFirst = true,
}: {
  id?: string;
  tone?: 'cotton' | 'parchment';
  kicker: string;
  title: string;
  subtitle: string;
  moreLink?: { href: string; label: string };
  items: Array<FaqItem>;
  defaultOpenFirst?: boolean;
}) {
  return (
    <Section id={id} tone={tone}>
      <div className="mka-faq-layout">
        <SectionHead
          kicker={kicker}
          title={title}
          subtitle={subtitle}
          compact
          action={
            moreLink ? (
              <a className="mka-text-link" href={moreLink.href}>
                {moreLink.label}
              </a>
            ) : undefined
          }
        />

        <div className="mka-faq-grid">
          {items.map((item, idx) => (
            <details className="mka-faq-card" key={item.q} open={defaultOpenFirst && idx === 0}>
              <summary>
                <span className="mka-faq-q-inner">
                  <span className="mka-faq-idx">{String(idx + 1).padStart(2, '0')}</span>
                  <span>{item.q}</span>
                </span>
                <span className="mka-faq-plus" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mka-faq-body">{item.aNode ?? item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function FinalCta({
  id,
  headline,
  meta,
  primaryCta,
  secondaryCta,
}: {
  id?: string;
  headline: string;
  meta: string;
  primaryCta: React.ReactNode;
  secondaryCta?: React.ReactNode;
}) {
  return (
    <section id={id} className="mka-poster-cta">
      <div className="mka-container">
        <div className="mka-poster-box">
          <PosterCornerMotifs />
          <h2>{headline}</h2>
          <p className="mka-poster-meta">{meta}</p>
          <div className="mka-poster-actions">
            {primaryCta}
            {secondaryCta}
          </div>
        </div>
      </div>
    </section>
  );
}

export type ProofTabItem = {
  id: string;
  tabLabel: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  heading: string;
  body: React.ReactNode;
  checklist: Array<React.ReactNode>;
  footnoteLabel: string;
  footnote: React.ReactNode;
};

export function ProofTabs({
  ariaLabel,
  metaNote,
  tabs,
}: {
  ariaLabel: string;
  metaNote: string;
  tabs: Array<ProofTabItem>;
}) {
  const [activeId, setActiveId] = React.useState(tabs[0]?.id ?? '');
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveId(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="mka-proof-plate">
      <div className="mka-proof-topbar">
        <div className="mka-proof-tabs" role="tablist" aria-label={ariaLabel}>
          {tabs.map((tab, index) => {
            const isSelected = tab.id === activeId;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                className="mka-proof-tab"
                role="tab"
                id={`mka-tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`mka-panel-${tab.id}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveId(tab.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {tab.tabLabel}
              </button>
            );
          })}
        </div>
        <span className="mka-proof-meta-note">{metaNote}</span>
      </div>

      {tabs.map((tab) => {
        const isSelected = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className="mka-proof-panel"
            id={`mka-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`mka-tab-${tab.id}`}
            hidden={!isSelected}
          >
            <div className="mka-proof-stage">
              <div className="mka-proof-crop">
                <img
                  src={tab.imageSrc}
                  width={tab.imageWidth}
                  height={tab.imageHeight}
                  loading="lazy"
                  alt={tab.imageAlt}
                />
              </div>
              <div className="mka-proof-aside">
                <h3>{tab.heading}</h3>
                <p>{tab.body}</p>
                <ul className="mka-proof-checklist">
                  {tab.checklist.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
                <div className="mka-proof-footnote">
                  <strong>{tab.footnoteLabel}</strong> {tab.footnote}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type ComparisonRow = {
  capability: string;
  demo: { text: string; tone?: 'yes' | 'opt' | 'no' };
  selfHost: { text: string; tone?: 'yes' | 'opt' | 'no' };
};

export function ComparisonTable({
  headers,
  rows,
  caption,
}: {
  headers: [string, string, string];
  rows: Array<ComparisonRow>;
  caption?: string;
}) {
  const toneClass = (tone?: 'yes' | 'opt' | 'no') =>
    tone === 'yes' ? 'mka-cell-yes' : tone === 'opt' ? 'mka-cell-opt' : 'mka-cell-no';

  return (
    <div className="mka-table-wrap">
      <table className="mka-table">
        {caption ? <caption className="mka-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            <th scope="col">{headers[1]}</th>
            <th scope="col">{headers[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.capability}>
              <th scope="row">{row.capability}</th>
              <td className={toneClass(row.demo.tone)}>{row.demo.text}</td>
              <td className={toneClass(row.selfHost.tone)}>{row.selfHost.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodePlate({
  ariaLabel,
  lines,
}: {
  ariaLabel: string;
  lines: Array<{ text: string; comment?: boolean }>;
}) {
  return (
    <div className="mka-code-plate" aria-label={ariaLabel}>
      {lines.map((line, idx) => (
        <div key={idx}>
          {line.comment ? <span className="mka-code-comment">{line.text}</span> : <code>{line.text}</code>}
        </div>
      ))}
    </div>
  );
}
