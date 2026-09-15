import { Link, useRouterState } from '@tanstack/react-router';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18n';

const settingsTabs = [
  { value: 'general', to: '/app/settings', labelKey: 'settings.navigation.general' },
  {
    value: 'bank-connections',
    to: '/app/settings/bank-connections',
    labelKey: 'settings.navigation.bankConnections',
  },
  { value: 'accounts', to: '/app/settings/accounts', labelKey: 'settings.navigation.accounts' },
  { value: 'credit', to: '/app/settings/credit', labelKey: 'settings.navigation.credit' },
  { value: 'import', to: '/app/settings/import', labelKey: 'settings.navigation.import' },
] as const;

export function SettingsNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();
  const activeTab =
    settingsTabs.find((tab) =>
      tab.to === '/app/settings'
        ? pathname === tab.to || pathname === `${tab.to}/`
        : pathname === tab.to || pathname.startsWith(`${tab.to}/`),
    )?.value ?? 'general';

  return (
    <nav aria-label={t('settings.title')} className="overflow-x-auto pb-1">
      <Tabs value={activeTab} className="w-max min-w-full">
        <TabsList className="w-max" variant="line">
          {settingsTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} asChild>
              <Link to={tab.to}>{t(tab.labelKey)}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
