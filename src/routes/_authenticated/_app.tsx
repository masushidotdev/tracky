import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect } from 'react';

import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { api } from '../../../convex/_generated/api';
import type { CSSProperties } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandMenu, CommandMenuProvider } from '@/components/app/command-menu';
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
  const { balancesHidden } = Route.useLoaderData();

  return (
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
          <ProfileBootstrap />
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
  );
}

function ProfileBootstrap() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });
  const ensureCurrentUserProfile = useMutation(api.authProfiles.ensureCurrentUserProfile);

  useEffect(() => {
    if (isLoading || !isAuthenticated || deleting) {
      return;
    }

    void ensureCurrentUserProfile({}).catch((error: unknown) => {
      console.warn('Unable to ensure WorkOS profile sync', error);
    });
  }, [deleting, ensureCurrentUserProfile, isAuthenticated, isLoading]);

  return null;
}
