import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import '../../../styles/marketing/blog-index.css';

import type { MarketingAuth, StampTone } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  Eyebrow,
  FinalCta,
  GITHUB_REPO_URL,
  Section,
} from '@/components/marketing/atelier';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { SITE_ORIGIN } from '@/lib/marketing/pages';
import { blogIndexJsonLd, breadcrumbJsonLd, buildMarketingHead, ogImageFor } from '@/lib/marketing/seo';

const RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

type BlogPostSummary = {
  slug: string;
  href: string;
  title: string;
  description: string;
  datePublished: string;
  dateLabel: string;
  tag: string;
  tagTone: StampTone;
};

export const blogIndexItPosts: Array<BlogPostSummary> = [
  {
    slug: 'self-hosting-tracky-docker',
    href: '/it/blog/self-hosting-tracky-docker',
    title: 'Self-hosting di Tracky con Docker: guida passo passo',
    description:
      'Avvia Tracky sul tuo server o PC con Docker Compose e Convex self-hosted. Zero telemetria di prodotto, configurazione guidata e limiti chiari.',
    datePublished: '2026-11-26',
    dateLabel: '26 nov 2026',
    tag: 'Guida',
    tagTone: 'cobalt',
  },
  {
    slug: 'tracky-v0-1-0',
    href: '/it/blog/tracky-v0-1-0',
    title: 'Tracky v0.1.0 — Primo rilascio pubblico open source',
    description:
      'Tracky v0.1.0 esce con licenza MIT: Piano zero-based, mutui e prestiti, import CSV nel browser, Flusso di cassa, Report, cancellazione immediata e sicurezza.',
    datePublished: '2026-11-24',
    dateLabel: '24 nov 2026',
    tag: 'Rilascio',
    tagTone: 'marigold',
  },
];

export const Route = createFileRoute('/it/blog/')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Blog — Guide e note di rilascio · Tracky';
    const description =
      'Note di rilascio, guide al self-hosting con Docker e aggiornamenti dal progetto Tracky, il budget planner zero-based open source.';
    const url = `${SITE_ORIGIN}/it/blog`;

    return buildMarketingHead({
      title,
      description,
      locale: 'it',
      path: '/it/blog',
      ogImage: ogImageFor('blog'),
      jsonLd: [
        blogIndexJsonLd({
          name: 'Blog di Tracky',
          description,
          url,
          inLanguage: 'it',
          posts: blogIndexItPosts.map((post) => ({
            headline: post.title,
            url: `${SITE_ORIGIN}${post.href}`,
            datePublished: post.datePublished,
            inLanguage: 'it',
          })),
        }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Blog', path: '/it/blog' },
        ]),
      ],
    });
  },
  component: BlogIndexIt,
});

function BlogIndexIt() {
  const auth = Route.useLoaderData();
  return <BlogIndexItView auth={auth} />;
}

export function BlogIndexItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/blog">
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Blog' }]}
            />

            <Eyebrow>Blog</Eyebrow>
            <h1 className="mka-hero-headline">
              Guide e note di rilascio <span className="mka-accent-ink">di Tracky.</span>
            </h1>
            <p className="mka-hero-dek">
              Guide pratiche al self-hosting, versioni pubblicate e aggiornamenti sullo sviluppo di Tracky con licenza
              MIT.
            </p>
          </div>
        </div>
      </section>

      <Section id="posts" tone="parchment">
        <div className="mka-blog-list">
          {blogIndexItPosts.map((post) => (
            <article className="mka-blog-card" key={post.slug}>
              <div className="mka-blog-card-meta">
                <Chip tone={post.tagTone}>{post.tag}</Chip>
                <time className="mka-blog-card-date" dateTime={post.datePublished}>
                  {post.dateLabel}
                </time>
              </div>
              <h2 className="mka-blog-card-title">
                <a href={post.href}>{post.title}</a>
              </h2>
              <p className="mka-blog-card-desc">{post.description}</p>
              <div className="mka-blog-card-foot">
                <a className="mka-text-link" href={post.href}>
                  Leggi l&apos;articolo →
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="mka-blog-releases">
          <p>Cerchi tutti i tag, i commit o il changelog completo?</p>
          <div className="mka-blog-releases-links">
            <a className="mka-text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              Release su GitHub ↗
            </a>
            <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              Repository GitHub ↗
            </a>
          </div>
        </div>
      </Section>

      <FinalCta
        headline="Prova la demo o installa Tracky in self-hosting."
        meta="Demo ospitata €0 · Self-host Docker con licenza MIT · Nessuna carta né checkout"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            Release su GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
