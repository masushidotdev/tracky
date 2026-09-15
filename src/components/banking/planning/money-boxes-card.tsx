import { Link } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import {
  ArchiveIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  TargetIcon,
  WalletCardsIcon,
} from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { formatIsoDateLabel } from './helpers';
import type { FunctionReturnType } from 'convex/server';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { fundingStatusKey } from '@/lib/planning-i18n';
import { cn } from '@/lib/utils';

export type FundingPlan = FunctionReturnType<typeof api.banking.planning.listMoneyBoxFundingPlans>[number];

function MoneyBoxCard({
  funding,
  moneyBox,
  onEdit,
  onRegisterContribution,
  onViewActivity,
}: Pick<FundingPlan, 'moneyBox' | 'funding'> & {
  onEdit: (moneyBox: Doc<'moneyBoxes'>) => void;
  onRegisterContribution: (moneyBox: Doc<'moneyBoxes'>) => void;
  onViewActivity: (moneyBox: Doc<'moneyBoxes'>) => void;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const setMoneyBoxStatus = useMutation(api.banking.planning.setMoneyBoxStatus);
  const { isPending, run } = usePendingAction();
  const pendingKey = `money-box-archive:${moneyBox._id}`;

  function archive() {
    void run(
      pendingKey,
      async () => {
        await setMoneyBoxStatus({ moneyBoxId: moneyBox._id, status: 'archived' });
      },
      {
        success: t('planning.moneyBoxes.archived'),
        error: t('planning.moneyBoxes.archiveFailed'),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        {/* CardHeader is a grid; a single flex child keeps name/badge/menu on one row. */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {moneyBox.name}
          </div>
          <Badge
            variant={
              funding.fundingStatus === 'covered'
                ? 'default'
                : funding.fundingStatus === 'behind'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {t(fundingStatusKey(funding.fundingStatus))}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={isPending(pendingKey)}
                aria-label={moneyBox.name}
              >
                {isPending(pendingKey) ? <Spinner /> : <MoreHorizontalIcon />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onRegisterContribution(moneyBox)}>
                  <PiggyBankIcon />
                  {t('planning.moneyBoxes.registerContribution')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(moneyBox)}>
                  <PencilIcon />
                  {t('planning.moneyBoxes.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewActivity(moneyBox)}>
                  <HistoryIcon />
                  {t('planning.moneyBoxes.viewActivity')}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={isPending(pendingKey)} onClick={archive}>
                  <ArchiveIcon />
                  {t('planning.moneyBoxes.archive')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">
              <Amount money={moneyBox.targetAmount} variant="neutral" />
            </span>
            <span className="text-sm text-muted-foreground">
              {t('planning.suggestions.monthly', {
                amount: maskValue(formatMoney(funding.monthlyRequiredAmount, intlLocale)),
              })}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">
                {formatIsoDateLabel(moneyBox.targetDate, intlLocale)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('planning.moneyBoxes.monthsLeft', { months: funding.monthsRemaining })}</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Progress value={funding.progressPercent} />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1 text-xs">
              <div>
                {t('planning.moneyBoxes.saved', { amount: maskValue(formatMoney(moneyBox.savedAmount, intlLocale)) })}
              </div>
              <div>
                {t('planning.moneyBoxes.remaining', {
                  amount: maskValue(formatMoney(funding.remainingAmount, intlLocale)),
                })}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t('planning.moneyBoxes.percentAchieved', { percent: Math.round(funding.progressPercent) })}
          </span>
          <Amount money={moneyBox.savedAmount} />
        </div>
      </CardContent>
    </Card>
  );
}

export function MoneyBoxesSection({
  fundingPlans,
  onCreate,
  onEdit,
  onRegisterContribution,
  onViewActivity,
}: {
  fundingPlans: Array<FundingPlan> | undefined;
  onCreate: () => void;
  onEdit: (moneyBox: Doc<'moneyBoxes'>) => void;
  onRegisterContribution: (moneyBox: Doc<'moneyBoxes'>) => void;
  onViewActivity: (moneyBox: Doc<'moneyBoxes'>) => void;
}) {
  const { t } = useI18n();
  const columnClass =
    fundingPlans && fundingPlans.length >= 3
      ? 'sm:grid-cols-2 xl:grid-cols-3'
      : fundingPlans?.length === 2
        ? 'sm:grid-cols-2'
        : 'grid-cols-1';

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('planning.moneyBoxes.title')}</h2>
        <div className="flex items-center gap-2">
          <Button asChild type="button" size="sm" variant="ghost">
            <Link to="/app/goals">
              <TargetIcon data-icon="inline-start" />
              {t('goals.open')}
            </Link>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCreate}>
            <PlusIcon data-icon="inline-start" />
            {t('planning.moneyBoxes.new')}
          </Button>
        </div>
      </div>
      {fundingPlans === undefined ? <Skeleton className="h-24 w-full" /> : null}
      {fundingPlans?.length === 0 ? (
        <EmptyState className="p-4" icon={WalletCardsIcon} title={t('planning.moneyBoxes.empty')} />
      ) : null}
      {fundingPlans && fundingPlans.length > 0 ? (
        <div className={cn('grid gap-4', columnClass)}>
          {fundingPlans.map(({ moneyBox, funding }) => (
            <MoneyBoxCard
              key={moneyBox._id}
              moneyBox={moneyBox}
              funding={funding}
              onEdit={onEdit}
              onRegisterContribution={onRegisterContribution}
              onViewActivity={onViewActivity}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
