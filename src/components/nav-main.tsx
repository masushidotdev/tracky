import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';

import type { AppNavItem } from '@/lib/navigation';
import { useCommandMenu } from '@/components/app/command-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Kbd } from '@/components/ui/kbd';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useSidebarGroupState } from '@/hooks/use-sidebar-group-state';
import { useI18n } from '@/lib/i18n';
import { analystNavItem, appFooterNav, appPrimaryNav, appToolsNav, isAnalystEnabled, isNavItemActive } from '@/lib/navigation';

function NavItem({ item, pathname }: { item: AppNavItem; pathname: string }) {
  const { t } = useI18n();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={t(item.titleKey)} isActive={isNavItemActive(item, pathname)} asChild>
        <Link to={item.url}>
          <item.icon />
          <span>{t(item.titleKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NavMain() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tools = useSidebarGroupState('tools');

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {appPrimaryNav.map((item) => (
              <NavItem key={item.url} item={item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <Collapsible open={tools.open} onOpenChange={tools.onOpenChange} asChild>
        <SidebarGroup>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel className="cursor-pointer [&[data-state=open]>svg]:rotate-90">
              <ChevronRightIcon className="transition-transform" />
              <span>{t(appToolsNav.labelKey)}</span>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {appToolsNav.items.map((item) => (
                <SidebarMenuSubItem key={item.url}>
                  <SidebarMenuSubButton isActive={isNavItemActive(item, pathname)} asChild>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </>
  );
}

export function NavFooter() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpen } = useCommandMenu();

  return (
    <SidebarMenu>
      {appFooterNav
        .filter((item) => item !== analystNavItem)
        .map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton tooltip={t(item.titleKey)} isActive={isNavItemActive(item, pathname)} asChild>
              <Link to={item.url}>
                <item.icon />
                <span>{t(item.titleKey)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={t('command.search')} onClick={() => setOpen(true)}>
          <SearchIcon />
          <span>{t('command.search')}</span>
          <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘K</Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {isAnalystEnabled() ? <NavItem item={analystNavItem} pathname={pathname} /> : null}
    </SidebarMenu>
  );
}
