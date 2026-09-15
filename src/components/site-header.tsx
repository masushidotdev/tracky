import { LanguagesIcon, SearchIcon } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';

import { useCommandMenu } from '@/components/app/command-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { BalancePrivacyToggle } from '@/components/balance-privacy-toggle';
import { NotificationBell } from '@/components/notification-bell';
import { useI18n } from '@/lib/i18n';
import { allNavItems, isNavItemActive } from '@/lib/navigation';

export function SiteHeader() {
  const { locale, localeOptions, setLocale, t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpen } = useCommandMenu();
  const activeItem = allNavItems.find((item) => isNavItemActive(item, pathname));

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-sm font-medium">{activeItem ? t(activeItem.titleKey) : t('header.workspace')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label={t('command.search')} onClick={() => setOpen(true)}>
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            <span className="hidden sm:inline">{t('command.search')}</span>
            <Kbd aria-hidden="true">⌘K</Kbd>
          </Button>
          <NotificationBell />
          <BalancePrivacyToggle />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('header.language')}>
                <LanguagesIcon data-icon="inline-start" />
                <span className="sr-only">{t('header.language')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {localeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setLocale(option.value)}
                  data-active={locale === option.value}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
