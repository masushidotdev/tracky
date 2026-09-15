import * as React from 'react';
import { CommandIcon, LandmarkIcon, PlusIcon } from 'lucide-react';

import { Link, useLoaderData } from '@tanstack/react-router';

import { ManualAccountDialog } from '@/components/banking/accounts/manual-account-dialog';
import { NavAccounts } from '@/components/app/nav-accounts';
import { NavFooter, NavMain } from '@/components/nav-main';
import { Button } from '@/components/ui/button';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useI18n } from '@/lib/i18n';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useLoaderData({ from: '/_authenticated/_app' });
  const { t } = useI18n();
  const [manualAccountOpen, setManualAccountOpen] = React.useState(false);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/app">
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">Tracky</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavAccounts />
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => setManualAccountOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t('accounts.addAccount')}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/settings/bank-connections">
                <LandmarkIcon data-icon="inline-start" />
                {t('nav.accounts')}
              </Link>
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <NavFooter />
        {user && (
          <NavUser
            user={{
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              avatar: user.profilePictureUrl,
            }}
          />
        )}
      </SidebarFooter>
      <ManualAccountDialog open={manualAccountOpen} onOpenChange={setManualAccountOpen} />
    </Sidebar>
  );
}
