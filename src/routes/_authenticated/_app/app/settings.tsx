import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { SettingsNavigation } from '@/components/settings/settings-navigation';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/settings')({
  component: SettingsRouteLayout,
});

function SettingsRouteLayout() {
  const { t } = useI18n();
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });

  return (
    <AppPage
      title={deleting ? undefined : t('settings.title')}
      description={deleting ? undefined : t('settings.description')}
      filters={deleting ? undefined : <SettingsNavigation />}
    >
      <Outlet />
    </AppPage>
  );
}
