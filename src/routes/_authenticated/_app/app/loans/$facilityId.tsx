import { createFileRoute } from '@tanstack/react-router';
import { LandmarkIcon } from 'lucide-react';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

import { AppPage } from '@/components/app/app-page';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton } from '@/components/app/skeletons';
import { LoanDetailView } from '@/components/banking/loans/loan-detail-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/loans/$facilityId')({
  component: RouteComponent,
});

function RouteComponent() {
  const { facilityId } = Route.useParams();
  const { t } = useI18n();
  const loans = useAuthedQuery(api.banking.loans.listLoans, {});
  const loan = loans?.find((candidate) => candidate._id === facilityId);

  if (loans === undefined) {
    return (
      <AppPage>
        <PanelSkeleton rows={4} />
      </AppPage>
    );
  }

  if (!loan) {
    return (
      <AppPage>
        <EmptyState icon={LandmarkIcon} title={t('common.notFound')} />
      </AppPage>
    );
  }

  return (
    <PanelErrorBoundary>
      <LoanDetailView facilityId={facilityId as Id<'creditFacilities'>} fallbackName={loan.name} />
    </PanelErrorBoundary>
  );
}
