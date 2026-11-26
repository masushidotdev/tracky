import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import '../../styles/marketing/blog-index.css';

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

export const blogIndexEnPosts: Array<BlogPostSummary> = [
  {
    slug: 'self-hosting-tracky-docker',
    href: '/blog/self-hosting-tracky-docker',
    title: 'Self-host Tracky with Docker: a step-by-step guide',
    description:
      'Run Tracky on your machine or VPS with Docker Compose and self-hosted Convex. Zero product telemetry, clear setup steps, and honest limits.',
    datePublished: '2026-11-26',
    dateLabel: '26 Nov 2026',
    tag: 'Guide',
    tagTone: 'cobalt',
  },
  {
    slug: 'tracky-v0-1-0',
    href: '/blog/tracky-v0-1-0',
    title: 'Tracky v0.1.0 — First public open-source release',
    description:
      'Tracky v0.1.0 is tagged under the MIT license: zero-based Plan, loans, browser CSV import, Cash Flow, Reports, immediate erasure, and security hardening.',
    datePublished: '2026-11-24',
    dateLabel: '24 Nov 2026',
    tag: 'Release',
    tagTone: 'marigold',
  },
];

export const Route = createFileRoute('/blog/')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Blog — Guides & release notes · Tracky';
    const description =
      'Release notes, Docker self-hosting guides, and engineering updates from Tracky — the MIT-licensed zero-based budget planner.';
    const url = `${SITE_ORIGIN}/blog`;

    return buildMarketingHead({
      title,
      description,
      locale: 'en',
      path: '/blog',
      ogImage: ogImageFor('blog'),
      jsonLd: [
        blogIndexJsonLd({
          name: 'Tracky Blog',
          description,
          url,
          inLanguage: 'en',
          posts: blogIndexEnPosts.map((post) => ({
            headline: post.title,
            url: `${SITE_ORIGIN}${post.href}`,
            datePublished: post.datePublished,
            inLanguage: 'en',
          })),
        }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ]),
      ],
    });
  },
  component: BlogIndexEn,
});

function BlogIndexEn() {
  const auth = Route.useLoaderData();
  return <BlogIndexEnView auth={auth} />;
}

export function BlogIndexEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/blog">
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />

            <Eyebrow>Blog</Eyebrow>
            <h1 className="mka-hero-headline">
              Guides &amp; release notes <span className="mka-accent-ink">from Tracky.</span>
            </h1>
            <p className="mka-hero-dek">
              Self-hosting walkthroughs, tagged releases, and practical notes on how Tracky is built and maintained
              under the MIT license.
            </p>
          </div>
        </div>
      </section>

      <Section id="posts" tone="parchment">
        <div className="mka-blog-list">
          {blogIndexEnPosts.map((post) => (
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
                  Read the article →
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="mka-blog-releases">
          <p>Looking for every tag, commit, or changelog entry?</p>
          <div className="mka-blog-releases-links">
            <a className="mka-text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              GitHub releases ↗
            </a>
            <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub repository ↗
            </a>
          </div>
        </div>
      </Section>

      <FinalCta
        headline="Try the demo or self-host Tracky."
        meta="€0 hosted demo · MIT-licensed Docker self-host · No credit card or checkout"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            GitHub releases ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
