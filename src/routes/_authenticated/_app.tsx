import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import type { CSSProperties } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandMenu, CommandMenuProvider } from '@/components/app/command-menu';
import { DeletionRouteGuard } from '@/components/settings/deletion-route-guard';
import { ProfileBootstrap } from '@/components/auth/profile-bootstrap';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BalancePrivacyProvider } from '@/lib/balance-privacy-context';
import { BALANCE_PRIVACY_COOKIE, parseBalancePrivacyValue, readBalancePrivacyCookie } from '@/lib/balance-privacy';

const fetchBalancePrivacy = createServerFn({ method: 'GET' }).handler(() => {
  return parseBalancePrivacyValue(getCookie(BALANCE_PRIVACY_COOKIE));
});

export const Route = createFileRoute('/_authenticated/_app')({
  loader: async () => {
    const { user } = await getAuth();
    const signInUrl = await getSignInUrl();
    const signUpUrl = await getSignUpUrl();
    // Reading the cookie here makes the very first render already correct, so hidden balances never
    // flash before an effect can hide them. In the browser the cookie is right there, so the loader
    // stays free of an extra server round trip.
    const balancesHidden =
      typeof document === 'undefined' ? await fetchBalancePrivacy() : readBalancePrivacyCookie(document.cookie);

    return { user, signInUrl, signUpUrl, balancesHidden };
  },
  component: AppLayout,
});

function AppLayout() {
  const { balancesHidden, user } = Route.useLoaderData();
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });

  return (
    <DeletionRouteGuard>
      {deleting ? (
        <Outlet />
      ) : (
        <ProfileBootstrap key={user?.id}>
          <BalancePrivacyProvider initialHidden={balancesHidden}>
            <CommandMenuProvider>
              <SidebarProvider
                style={
                  {
                    '--sidebar-width': 'calc(var(--spacing) * 72)',
                    '--header-height': 'calc(var(--spacing) * 12)',
                  } as CSSProperties
                }
              >
                <CommandMenu />
                <AppSidebar variant="inset" />
                <SidebarInset>
                  <SiteHeader />
                  <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                      <Outlet />
                    </div>
                  </div>
                </SidebarInset>
              </SidebarProvider>
            </CommandMenuProvider>
          </BalancePrivacyProvider>
        </ProfileBootstrap>
      )}
    </DeletionRouteGuard>
  );
}
