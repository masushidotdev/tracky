import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, BookOpenIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getDocsSections } from '@/lib/docs/content';
import { getDocsCopy } from '@/lib/docs/copy';
import { useI18n } from '@/lib/i18n';

export function DocsIndex() {
  const { locale } = useI18n();
  const copy = getDocsCopy(locale);
  const sections = getDocsSections(locale);

  return (
    <main className="grid gap-8 p-4 md:p-8 xl:p-12">
      <header className="grid max-w-3xl gap-3">
        <p className="text-sm font-medium text-muted-foreground">Tracky</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h1>
        <p className="text-base text-muted-foreground md:text-lg">{copy.description}</p>
      </header>

      {sections.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
            <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>
                  {section.docs.length} {section.docs.length === 1 ? copy.guide : copy.guides}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1">
                {section.docs.map((doc) => (
                  <Link
                    className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    key={`${doc.locale}:${doc.slug}`}
                    params={{ slug: doc.slug }}
                    to="/app/docs/$slug"
                  >
                    <span>{doc.title}</span>
                    <ArrowRightIcon className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
