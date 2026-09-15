import { createFileRoute } from '@tanstack/react-router';

import { TelegramLinkCard } from '@/components/banking/analyst/telegram-link-card';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { Card } from '@/components/ui/card';
import { CategoriesCard } from '@/components/settings/categories-card';
import { CategoryRulesCard } from '@/components/settings/category-rules-card';
import { DangerZoneCard } from '@/components/settings/danger-zone-card';
import { DataExportCard } from '@/components/settings/data-export-card';
import { MemoriesCard } from '@/components/settings/memories-card';
import { NotificationPreferencesCard } from '@/components/settings/notification-preferences-card';
import { PlanCard } from '@/components/settings/plan-card';
import { ProfileCard } from '@/components/settings/profile-card';

export const Route = createFileRoute('/_authenticated/_app/app/settings/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PanelErrorBoundary>
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <ProfileCard />
        <PlanCard />
        <NotificationPreferencesCard />
        <CategoriesCard />
        <CategoryRulesCard />
        <Card className="gap-0 py-0">
          <TelegramLinkCard />
        </Card>
        <MemoriesCard />
        <DataExportCard />
        <DangerZoneCard />
      </div>
    </PanelErrorBoundary>
  );
}
