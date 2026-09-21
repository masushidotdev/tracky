import * as React from 'react';
import { BookOpenIcon, EyeIcon, EyeOffIcon, FileTextIcon, LaptopIcon, MoonIcon, PlusIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useNavigate } from '@tanstack/react-router';

import type { DocsSearchResult } from '@/lib/docs/search';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { allNavItems, analystNavItem, isAnalystEnabled } from '@/lib/navigation';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';

type CommandMenuContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(null);

export function CommandMenuProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return <CommandMenuContext.Provider value={value}>{children}</CommandMenuContext.Provider>;
}

export function useCommandMenu() {
  const context = React.useContext(CommandMenuContext);
  if (!context) {
    throw new Error('useCommandMenu must be used within CommandMenuProvider');
  }

  return context;
}

export function CommandMenu() {
  const { open, setOpen } = useCommandMenu();
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const { hidden: balancesHidden, setHidden: setBalancesHidden } = useBalancePrivacy();
  const { locale, localeOptions, setLocale, t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [docsResults, setDocsResults] = React.useState<Array<DocsSearchResult>>([]);
  const deferredQuery = React.useDeferredValue(query.trim());
  const visibleNavItems = allNavItems.filter((item) => item !== analystNavItem || isAnalystEnabled());

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((currentOpen) => !currentOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  React.useEffect(() => {
    if (open) {
      trackEvent(analyticsEvents.commandMenuOpened, {});
      return;
    }

    setQuery('');
    setDocsResults([]);
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;

    if (!open || deferredQuery.length < 2) {
      setDocsResults([]);
      return () => {
        cancelled = true;
      };
    }

    setDocsResults([]);
    void import('@/lib/docs/search')
      .then(({ searchDocs }) => searchDocs(deferredQuery, locale))
      .then((results) => {
        if (!cancelled) {
          React.startTransition(() => setDocsResults(results));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocsResults([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, locale, open]);

  const runCommand = React.useCallback(
    (command: () => void) => {
      command();
      setOpen(false);
    },
    [setOpen],
  );

  const openDocsResult = React.useCallback(
    (result: DocsSearchResult) => {
      runCommand(() =>
        void navigate({
          to: '/app/docs/$slug',
          params: { slug: result.slug },
          hash: result.anchor,
        }),
      );
    },
    [navigate, runCommand],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t('command.title')} description={t('command.description')}>
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t('command.placeholder')}
        />
        <CommandList>
          <CommandEmpty>{t('command.empty')}</CommandEmpty>
          {docsResults.length > 0 ? (
            <CommandGroup forceMount heading={t('command.docs')}>
              {docsResults.map((result) => (
                <CommandItem
                  forceMount
                  key={`${result.slug}:${result.anchor ?? 'page'}`}
                  keywords={[query]}
                  value={`${result.title} ${result.heading ?? ''} ${result.excerpt} ${result.slug}`}
                  onSelect={() => openDocsResult(result)}
                >
                  {result.anchor ? <FileTextIcon /> : <BookOpenIcon />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">
                      {result.title}
                      {result.heading ? ` · ${result.heading}` : ''}
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {result.section} · {result.excerpt}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading={t('command.navigation')}>
            {visibleNavItems.map((item) => {
              const Icon = item.icon;

              return (
                <CommandItem
                  key={item.url}
                  value={t(item.titleKey)}
                  onSelect={() => runCommand(() => void navigate({ to: item.url }))}
                >
                  <Icon />
                  <span>{t(item.titleKey)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading={t('command.actions')}>
            <CommandItem
              value={t('command.newSubscription')}
              onSelect={() => runCommand(() => void navigate({ to: '/app/subscriptions/create' }))}
            >
              <PlusIcon />
              <span>{t('command.newSubscription')}</span>
            </CommandItem>
            <CommandItem
              value={t('command.newPlannedExpense')}
              onSelect={() => runCommand(() => void navigate({ to: '/app/planning' }))}
            >
              <PlusIcon />
              <span>{t('command.newPlannedExpense')}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t('command.privacy')}>
            <CommandItem
              value={balancesHidden ? t('privacy.showBalances') : t('privacy.hideBalances')}
              data-checked={balancesHidden}
              onSelect={() => runCommand(() => setBalancesHidden(!balancesHidden))}
            >
              {balancesHidden ? <EyeOffIcon /> : <EyeIcon />}
              <span>{balancesHidden ? t('privacy.showBalances') : t('privacy.hideBalances')}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t('command.theme')}>
            <CommandItem
              value={t('theme.light')}
              data-checked={theme === 'light'}
              onSelect={() => runCommand(() => setTheme('light'))}
            >
              <SunIcon />
              <span>{t('theme.light')}</span>
            </CommandItem>
            <CommandItem
              value={t('theme.dark')}
              data-checked={theme === 'dark'}
              onSelect={() => runCommand(() => setTheme('dark'))}
            >
              <MoonIcon />
              <span>{t('theme.dark')}</span>
            </CommandItem>
            <CommandItem
              value={t('theme.system')}
              data-checked={(theme ?? 'system') === 'system'}
              onSelect={() => runCommand(() => setTheme('system'))}
            >
              <LaptopIcon />
              <span>{t('theme.system')}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t('command.language')}>
            {localeOptions.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                data-checked={locale === option.value}
                onSelect={() => runCommand(() => setLocale(option.value))}
              >
                <span>{option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
