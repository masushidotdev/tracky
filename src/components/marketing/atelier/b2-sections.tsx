import * as React from 'react';

import '../../../styles/marketing/b2-pages.css';
import { Chip, Section, SectionHead } from './primitives';

import type { StampTone } from './primitives';
import type { MarketingAuth } from '@/components/marketing/site';
import type { AppLocale } from '@/lib/i18n';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

/**
 * Auth-aware CTA for Phase B2 marketing pages that optionally routes signed-in
 * users straight to a specific /app sub-route (e.g. /app/plan, /app/planning, /app/reports)
 * while preserving the exact signup_started sendBeacon event for anonymous visitors.
 */
export function B2AppCta({
  auth,
  locale,
  loggedInHref = '/app',
  loggedOutLabel,
  loggedInLabel,
  variant = 'primary-lg',
}: {
  auth: MarketingAuth;
  locale: AppLocale;
  loggedInHref?: string;
  loggedOutLabel?: string;
  loggedInLabel?: string;
  variant?: 'primary' | 'primary-lg' | 'marigold';
}) {
  const isIt = locale === 'it';
  const href = auth.user ? loggedInHref : auth.signUpUrl;
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
          : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
      }
    >
      {label}
    </a>
  );
}

/**
 * Explicit availability banner for feature pages (Hosted demo vs Self-host Docker),
 * matching the transparency of the homepage capability cards.
 */
export function B2AvailabilityBand({
  demoTone,
  demoBadge,
  demoTitle,
  demoBody,
  selfHostTone,
  selfHostBadge,
  selfHostTitle,
  selfHostBody,
}: {
  demoTone: StampTone;
  demoBadge: string;
  demoTitle: string;
  demoBody: React.ReactNode;
  selfHostTone: StampTone;
  selfHostBadge: string;
  selfHostTitle: string;
  selfHostBody: React.ReactNode;
}) {
  return (
    <div className="mka-b2-availability">
      <div className="mka-b2-availability-col">
        <div className="mka-b2-availability-head">
          <h3>{demoTitle}</h3>
          <Chip tone={demoTone}>{demoBadge}</Chip>
        </div>
        <p>{demoBody}</p>
      </div>
      <div className="mka-b2-availability-col">
        <div className="mka-b2-availability-head">
          <h3>{selfHostTitle}</h3>
          <Chip tone={selfHostTone}>{selfHostBadge}</Chip>
        </div>
        <p>{selfHostBody}</p>
      </div>
    </div>
  );
}

export type B2StepItem = {
  title: string;
  body: string;
  note?: React.ReactNode;
};

/**
 * Numbered step list for evergreen 5-step educational guides.
 * Keeps `title` and `body` plain strings so HowTo JSON-LD stays aligned 1:1.
 */
export function B2GuideSteps({
  steps,
  stepPrefix,
}: {
  steps: Array<B2StepItem>;
  stepPrefix: string;
}) {
  return (
    <ol className="mka-b2-step-list">
      {steps.map((step, index) => (
        <li className="mka-b2-step-item" key={step.title}>
          <span className="mka-b2-step-badge">
            {stepPrefix} {String(index + 1).padStart(2, '0')}
          </span>
          <div className="mka-b2-step-body">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            {step.note ? <div className="mka-b2-step-note">{step.note}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Crop-marked screenshot figure with explicit width/height and lazy loading.
 */
export function B2ScreenshotFigure({
  src,
  alt,
  width,
  height,
  captionTitle,
  captionBody,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  captionTitle: string;
  captionBody: React.ReactNode;
}) {
  return (
    <figure className="mka-b2-figure">
      <div className="mka-proof-crop">
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      </div>
      <figcaption>
        <strong>{captionTitle}</strong> — {captionBody}
      </figcaption>
    </figure>
  );
}

export type B2PillarCard = {
  tag: string;
  title: string;
  body: React.ReactNode;
  footer?: React.ReactNode;
};

export function B2PillarGrid({ items }: { items: Array<B2PillarCard> }) {
  return (
    <div className="mka-b2-tri-grid">
      {items.map((item) => (
        <article className="mka-b2-card" key={item.title}>
          <span className="mka-b2-card-tag">{item.tag}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          {item.footer ? <div className="mka-b2-card-footer">{item.footer}</div> : null}
        </article>
      ))}
    </div>
  );
}

export type B2RelatedLink = {
  kicker: string;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

export function B2RelatedSection({
  tone = 'cotton',
  kicker,
  title,
  subtitle,
  items,
}: {
  tone?: 'cotton' | 'parchment';
  kicker: string;
  title: string;
  subtitle?: string;
  items: Array<B2RelatedLink>;
}) {
  return (
    <Section tone={tone}>
      <SectionHead kicker={kicker} title={title} subtitle={subtitle} />
      <div className="mka-b2-related-grid">
        {items.map((item) => (
          <a className="mka-b2-related-card" href={item.href} key={item.href}>
            <span className="mka-b2-related-kicker">{item.kicker}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="mka-b2-related-link">{item.linkLabel}</span>
          </a>
        ))}
      </div>
    </Section>
  );
}
