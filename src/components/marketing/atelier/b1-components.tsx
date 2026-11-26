import * as React from 'react';

import '../../../styles/marketing/b1-atelier.css';
import { Section, SectionHead } from './primitives';
import type { FaqItem } from './primitives';

export type RelatedLinkItem = {
  kicker: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  external?: boolean;
};

export function RelatedLinksSection({
  id = 'related',
  tone = 'cotton',
  kicker,
  title,
  subtitle,
  items,
}: {
  id?: string;
  tone?: 'cotton' | 'parchment';
  kicker: string;
  title: string;
  subtitle?: string;
  items: Array<RelatedLinkItem>;
}) {
  return (
    <Section id={id} tone={tone} className="mka-b1-related">
      <SectionHead kicker={kicker} title={title} subtitle={subtitle} />
      <div className="mka-b1-related-grid">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="mka-b1-related-card"
            target={item.external ? '_blank' : undefined}
            rel={item.external ? 'noopener noreferrer' : undefined}
          >
            <span className="mka-b1-related-kicker">{item.kicker}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="mka-b1-related-cta">{item.ctaLabel}</span>
          </a>
        ))}
      </div>
    </Section>
  );
}

export function B1ArticleEntry({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mka-b1-entry">
      <div className="mka-b1-entry-head">
        <span className="mka-b1-entry-num">{num}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function B1CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mka-b1-pre">
      <code>{children}</code>
    </pre>
  );
}

export function B1Figure({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="mka-b1-figure">
      <div className="mka-b1-figure-frame">
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function B1ArticleFaqList({
  items,
  defaultOpenFirst = false,
}: {
  items: Array<FaqItem>;
  defaultOpenFirst?: boolean;
}) {
  return (
    <div className="mka-b1-article-faq">
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
  );
}
