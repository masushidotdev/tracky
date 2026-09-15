import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ArrowRightIcon, BookXIcon } from 'lucide-react';

import type { DocsEntry, DocsLocale } from '@/lib/docs/types';
import { docsMdxComponents } from '@/components/docs/mdx-components';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { docsManifest, getDoc, loadDocsModule } from '@/lib/docs/content';
import { getDocsCopy } from '@/lib/docs/copy';
import { getAdjacentDocs } from '@/lib/docs/manifest-core';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function DocsPage({ slug }: Readonly<{ slug: string }>) {
  const { locale } = useI18n();
  const copy = getDocsCopy(locale);
  const doc = getDoc(slug, locale);

  if (!doc) {
    return (
      <Empty className="m-4 min-h-96 md:m-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookXIcon />
          </EmptyMedia>
          <EmptyTitle>{copy.notFoundTitle}</EmptyTitle>
          <EmptyDescription>{copy.notFoundDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <ResolvedDocsPage doc={doc} locale={locale} />;
}

function ResolvedDocsPage({
  doc,
  locale,
}: Readonly<{
  doc: DocsEntry;
  locale: DocsLocale;
}>) {
  const { intlLocale } = useI18n();
  const copy = getDocsCopy(locale);

  const { next, previous } = getAdjacentDocs(docsManifest, doc.slug, locale);
  const Content = React.useMemo(
    () =>
      React.lazy(async () => {
        const module = await loadDocsModule(doc.sourcePath);
        return { default: module.default };
      }),
    [doc.sourcePath],
  );
  const updatedAt = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).format(
    new Date(`${doc.updatedAt}T00:00:00Z`),
  );

  return (
    <div className="grid min-w-0 gap-12 p-4 md:p-8 xl:grid-cols-[minmax(0,52rem)_14rem] xl:justify-center xl:p-12">
      <main className="min-w-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/app/docs">{copy.title}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{doc.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <header className="mt-8 grid gap-3 border-b pb-8">
          <p className="text-sm font-medium text-muted-foreground">{doc.section}</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{doc.title}</h1>
          <p className="text-base text-muted-foreground md:text-lg">{doc.description}</p>
          <p className="text-xs text-muted-foreground">
            {copy.updated} {updatedAt}
          </p>
        </header>

        <article className="docs-content mt-8">
          <React.Suspense fallback={<DocsPageSkeleton />}>
            <Content components={docsMdxComponents} />
          </React.Suspense>
        </article>

        {previous || next ? (
          <nav aria-label="Pagination" className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {previous ? (
              <Button asChild className="h-auto justify-start whitespace-normal py-3 text-left" variant="ghost">
                <Link params={{ slug: previous.slug }} to="/app/docs/$slug">
                  <ArrowLeftIcon data-icon="inline-start" />
                  <span>
                    <span className="block text-xs text-muted-foreground">{copy.previous}</span>
                    {previous.title}
                  </span>
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button asChild className="h-auto justify-end whitespace-normal py-3 text-right" variant="ghost">
                <Link params={{ slug: next.slug }} to="/app/docs/$slug">
                  <span>
                    <span className="block text-xs text-muted-foreground">{copy.next}</span>
                    {next.title}
                  </span>
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </main>

      {doc.headings.length > 0 ? (
        <aside className="sticky top-[calc(var(--header-height)+3rem)] hidden h-fit xl:block">
          <p className="mb-3 text-sm font-medium">{copy.onThisPage}</p>
          <nav aria-label={copy.onThisPage} className="grid gap-1 border-l pl-4">
            {doc.headings.map((heading) => (
              <a
                className={cn(
                  'py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  heading.depth === 3 && 'pl-3',
                )}
                href={`#${heading.id}`}
                key={heading.id}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </aside>
      ) : null}
    </div>
  );
}

function DocsPageSkeleton() {
  return (
    <div className="grid gap-4" aria-label="Loading documentation">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="mt-4 h-40 w-full" />
    </div>
  );
}
