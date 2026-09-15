import { PlusIcon, TargetIcon } from 'lucide-react';

import { GoalCard } from './goal-card';
import type { Doc } from '../../../../convex/_generated/dataModel';
import type { MoneyBoxFundingPlan } from './goals-utils';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export function SaveUpTab({
  archivePending,
  onArchive,
  onContribute,
  onConvert,
  onCreate,
  onEdit,
  onOpenActivity,
  onOpenSettings,
  onWithdraw,
  plans,
}: {
  archivePending: (moneyBoxId: Doc<'moneyBoxes'>['_id']) => boolean;
  onArchive: (moneyBox: Doc<'moneyBoxes'>) => void;
  onContribute: (moneyBox: Doc<'moneyBoxes'>) => void;
  onConvert: (moneyBox: Doc<'moneyBoxes'>) => void;
  onCreate: () => void;
  onEdit: (moneyBox: Doc<'moneyBoxes'>) => void;
  onOpenActivity: (moneyBox: Doc<'moneyBoxes'>) => void;
  onOpenSettings: (moneyBox: Doc<'moneyBoxes'>) => void;
  onWithdraw: (moneyBox: Doc<'moneyBoxes'>) => void;
  plans: Array<MoneyBoxFundingPlan> | undefined;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('goals.saveUp.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('goals.saveUp.description')}</p>
        </div>
        <Button type="button" size="sm" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          {t('goals.saveUp.new')}
        </Button>
      </div>

      {plans === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={2} />
        </div>
      ) : null}
      {plans?.length === 0 ? (
        <EmptyState
          icon={TargetIcon}
          title={t('goals.saveUp.emptyTitle')}
          hint={t('goals.saveUp.emptyDescription')}
          action={
            <Button type="button" onClick={onCreate}>
              <PlusIcon data-icon="inline-start" />
              {t('goals.saveUp.new')}
            </Button>
          }
        />
      ) : null}
      {plans && plans.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <GoalCard
              key={plan.moneyBox._id}
              archivePending={archivePending(plan.moneyBox._id)}
              plan={plan}
              onArchive={onArchive}
              onContribute={onContribute}
              onConvert={onConvert}
              onEdit={onEdit}
              onOpenActivity={onOpenActivity}
              onOpenSettings={onOpenSettings}
              onWithdraw={onWithdraw}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
