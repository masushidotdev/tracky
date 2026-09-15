import type * as React from 'react';

import { cn } from '@/lib/utils';

type AppPageProps = {
  /**
   * Omit it when the shell header already names the page and the space is better spent on content,
   * as the Plan grid does. The route keeps its accessible name from the shell breadcrumb.
   */
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Bounds the page to the viewport so children can own their scrolling, as the Plan grid and its
   * inspector do. The app shell is `min-h-svh`, so there is no height chain to inherit: a page that
   * wants independently scrolling panes has to establish one itself.
   */
  fullHeight?: boolean;
};

export function AppPage({ title, description, actions, filters, children, fullHeight }: AppPageProps) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none',
        fullHeight &&
          'lg:h-[calc(100svh-var(--header-height)-1rem)] lg:flex-none lg:contain-paint lg:min-h-0 lg:overflow-hidden',
      )}
    >
      {title || description || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {filters}
      {fullHeight ? <div className="flex flex-1 flex-col lg:min-h-0">{children}</div> : children}
    </div>
  );
}
