import { CreditCardIcon } from 'lucide-react';

import { FacilityCard } from './facility-card';
import type { ComponentProps } from 'react';
import type { FacilityEditValues } from './facility-card';
import type { LoanFormValues } from '../loans/loan-form-fields';
import type {
  CreditFacility,
  CreditInstallmentPlan,
  CreditUsageCycle,
  CreditUsageCyclePaymentCandidate,
  FinancialAccount,
} from './types';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

type InstallmentProgress = {
  elapsedInstallments: number;
  percent: number;
  remainingInstallments: number;
  totalInstallments: number;
};

export type FacilityListItem = {
  facility: CreditFacility;
  installmentPlan: CreditInstallmentPlan | undefined;
  installmentProgress: InstallmentProgress | null;
  isInstallmentCredit: boolean;
  progress: number;
  openCycle: CreditUsageCycle | undefined;
  scheduledCycles: Array<CreditUsageCycle>;
  usageDraft: string;
};

export function FacilityList({
  accounts,
  facilities,
  installmentPlansLoading,
  isAnyPending,
  items,
  onCloseCycle,
  onConfirmUsageCyclePayment,
  onDeleteLoan,
  onReclassifyAsLoan,
  onSetUsageCycleStatus,
  onUpdateFacility,
  onUpdateUsage,
  onUsageDraftChange,
  paymentCandidateByCycleId,
  pendingClose,
  pendingFacilityUpdate,
  pendingDelete,
  pendingReclassification,
  pendingUsage,
  planCurrency,
  planGroups,
  usageCycleStatusPending,
}: {
  accounts: Array<FinancialAccount> | undefined;
  facilities: Array<CreditFacility> | undefined;
  installmentPlansLoading: boolean;
  isAnyPending: boolean;
  items: Array<FacilityListItem>;
  onCloseCycle: (facility: CreditFacility, cycleMonth?: string) => void;
  onConfirmUsageCyclePayment: (
    usageCycleId: Id<'creditFacilityUsageCycles'>,
    transactionId: Id<'transactions'>,
  ) => void;
  onDeleteLoan: (facility: CreditFacility) => void;
  onReclassifyAsLoan: (facility: CreditFacility, values: LoanFormValues) => void;
  onSetUsageCycleStatus: (usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') => void;
  onUpdateFacility: (facility: CreditFacility, values: FacilityEditValues) => void;
  onUpdateUsage: (facility: CreditFacility) => void;
  onUsageDraftChange: (facilityId: Id<'creditFacilities'>, value: string) => void;
  paymentCandidateByCycleId: Map<string, CreditUsageCyclePaymentCandidate>;
  pendingClose: (facilityId: Id<'creditFacilities'>) => boolean;
  pendingFacilityUpdate: (facilityId: Id<'creditFacilities'>) => boolean;
  pendingDelete: (facilityId: Id<'creditFacilities'>) => boolean;
  pendingReclassification: (facilityId: Id<'creditFacilities'>) => boolean;
  pendingUsage: (facilityId: Id<'creditFacilities'>) => boolean;
  planCurrency: string | undefined;
  planGroups: ComponentProps<typeof FacilityCard>['planGroups'];
  usageCycleStatusPending: (usageCycleId: Id<'creditFacilityUsageCycles'>) => boolean;
}) {
  const { t } = useI18n();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('credit.capacity.title')}</CardTitle>
        <CardDescription>{t('credit.capacity.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {facilities === undefined && <ListSkeleton rows={3} />}
        {facilities?.length === 0 && (
          <EmptyState icon={CreditCardIcon} title={t('credit.capacity.empty')} className="border" />
        )}
        {items.length > 0 ? (
          // Each facility is its own card now, so they sit apart on a grid instead of being welded
          // into one bordered list where a taller card stretched the dividers around its neighbours.
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {items.map((item) => (
              <FacilityCard
                accounts={accounts}
                facility={item.facility}
                installmentPlan={item.installmentPlan}
                installmentPlansLoading={installmentPlansLoading}
                installmentProgress={item.installmentProgress}
                isAnyPending={isAnyPending}
                isInstallmentCredit={item.isInstallmentCredit}
                key={item.facility._id}
                onCloseCycle={() => onCloseCycle(item.facility, item.openCycle?.cycleMonth)}
                onConfirmUsageCyclePayment={onConfirmUsageCyclePayment}
                onDeleteLoan={() => onDeleteLoan(item.facility)}
                onReclassifyAsLoan={(values) => onReclassifyAsLoan(item.facility, values)}
                onSetUsageCycleStatus={onSetUsageCycleStatus}
                paymentCandidateByCycleId={paymentCandidateByCycleId}
                onUpdateFacility={(values) => onUpdateFacility(item.facility, values)}
                onUpdateUsage={() => onUpdateUsage(item.facility)}
                onUsageDraftChange={(value) => onUsageDraftChange(item.facility._id, value)}
                pendingClose={pendingClose(item.facility._id)}
                pendingFacilityUpdate={pendingFacilityUpdate(item.facility._id)}
                pendingDelete={pendingDelete(item.facility._id)}
                pendingReclassification={pendingReclassification(item.facility._id)}
                pendingUsage={pendingUsage(item.facility._id)}
                planGroups={planCurrency === item.facility.limitAmount.currency ? planGroups : []}
                progress={item.progress}
                openCycle={item.openCycle}
                scheduledCycles={item.scheduledCycles}
                usageCycleStatusPending={usageCycleStatusPending}
                usageDraft={item.usageDraft}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
