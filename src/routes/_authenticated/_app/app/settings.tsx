import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { SettingsNavigation } from '@/components/settings/settings-navigation';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/settings')({
  component: SettingsRouteLayout,
});

function SettingsRouteLayout() {
  const { t } = useI18n();

  return (
    <AppPage title={t('settings.title')} description={t('settings.description')} filters={<SettingsNavigation />}>
      <Outlet />
    </AppPage>
  );
}
