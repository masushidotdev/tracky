import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import { Suspense, lazy } from 'react';

import appCssUrl from '../app.css?url';

import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ConvexReactClient } from 'convex/react';
import type { ConvexQueryClient } from '@convex-dev/react-query';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { I18nProvider, useI18n } from '@/lib/i18n';

// Dev-only panel: static `null` in production so the devtools chunk is never
// requested outside development.
const DevtoolsPanel = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : () => null;

const fetchWorkosAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = await getAuth();
  const { user } = auth;

  return {
    userId: user?.id ?? null,
    token: user ? auth.accessToken : null,
  };
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Tracky',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCssUrl },
      { rel: 'icon', href: '/tracky.svg' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  beforeLoad: async (ctx) => {
    // Marketing pages must SSR for crawlers without WorkOS/Convex: a failed
    // auth fetch degrades to logged-out instead of 500ing the page.
    try {
      const { userId, token } = await fetchWorkosAuth();

      // During SSR only (the only time serverHttpClient exists),
      // set the WorkOS auth token to make HTTP queries with.
      if (token) {
        ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
      }

      return { userId, token };
    } catch {
      return { userId: null, token: null };
    }
  },
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function NotFoundPage() {
  const { t } = useI18n();

  return <div className="p-6 text-sm text-muted-foreground">{t('common.notFound')}</div>;
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </I18nProvider>
          <Toaster />
        </ThemeProvider>
        <Scripts />
        <Suspense>
          <DevtoolsPanel />
        </Suspense>
      </body>
    </html>
  );
}
