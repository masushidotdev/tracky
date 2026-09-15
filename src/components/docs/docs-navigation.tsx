import { Link, useRouterState } from '@tanstack/react-router';
import { cva } from 'class-variance-authority';

import { ScrollArea } from '@/components/ui/scroll-area';
import { getDocsSections } from '@/lib/docs/content';
import { getDocsCopy } from '@/lib/docs/copy';
import { useI18n } from '@/lib/i18n';

const docsNavigationLinkVariants = cva(
  'block w-fit max-w-full rounded-md px-2 py-1.5 text-sm/5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  {
    variants: {
      active: {
        false: 'text-foreground/75 hover:bg-muted/60 hover:text-foreground',
        true: 'bg-muted font-medium text-foreground',
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export function DocsNavigation({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { locale } = useI18n();
  const copy = getDocsCopy(locale);
  const sections = getDocsSections(locale);
  const indexActive = pathname === '/app/docs' || pathname === '/app/docs/';

  return (
    <ScrollArea
      className="h-full"
      viewportClassName="scroll-fade scroll-fade-10 overscroll-contain [--scroll-fade-reveal:72px]"
    >
      <nav aria-label={copy.navigation} className="flex flex-col gap-7 px-5 py-6">
        <Link
          aria-current={indexActive ? 'page' : undefined}
          className={docsNavigationLinkVariants({ active: indexActive })}
          onClick={onNavigate}
          to="/app/docs"
        >
          {copy.allGuides}
        </Link>

        {sections.map((section) => {
          const sectionId = `docs-section-${section.docs[0]?.slug ?? 'other'}`;

          return (
            <section aria-labelledby={sectionId} className="flex flex-col gap-1" key={section.title}>
              <h2 className="mb-1 px-2 text-sm/5 font-medium text-muted-foreground" id={sectionId}>
                {section.title}
              </h2>
              <div className="flex flex-col gap-0.5">
                {section.docs.map((doc) => {
                  const href = `/app/docs/${doc.slug}`;
                  const active = pathname === href;

                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={docsNavigationLinkVariants({ active })}
                      key={`${doc.locale}:${doc.slug}`}
                      onClick={onNavigate}
                      params={{ slug: doc.slug }}
                      to="/app/docs/$slug"
                    >
                      {doc.title}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </ScrollArea>
  );
}
