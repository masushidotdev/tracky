import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  Clock3Icon,
  HistoryIcon,
  LandmarkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PiggyBankIcon,
  Settings2Icon,
  TrendingUpIcon,
  WalletCardsIcon,
} from 'lucide-react';

import type { Doc } from '../../../../convex/_generated/dataModel';
import type { MoneyBoxFundingPlan } from './goals-utils';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function statusPresentation(status: MoneyBoxFundingPlan['funding']['status']) {
  if (status === 'ahead') {
    return {
      icon: TrendingUpIcon,
      key: 'goals.saveUp.status.ahead' as const,
      className: 'bg-positive/10 text-positive',
      variant: 'secondary' as const,
    };
  }
  if (status === 'behind') {
    return {
      icon: AlertTriangleIcon,
      key: 'goals.saveUp.status.behind' as const,
      className: undefined,
      variant: 'destructive' as const,
    };
  }
  if (status === 'completed') {
    return {
      icon: CheckCircle2Icon,
      key: 'goals.saveUp.status.completed' as const,
      className: 'bg-positive/10 text-positive',
      variant: 'secondary' as const,
    };
  }
  return {
    icon: Clock3Icon,
    key: 'goals.saveUp.status.onTrack' as const,
    className: undefined,
    variant: 'secondary' as const,
  };
}

export function GoalCard({
  archivePending,
  onArchive,
  onContribute,
  onConvert,
  onEdit,
  onOpenActivity,
  onOpenSettings,
  onWithdraw,
  plan,
}: {
  archivePending: boolean;
  onArchive: (moneyBox: Doc<'moneyBoxes'>) => void;
  onContribute: (moneyBox: Doc<'moneyBoxes'>) => void;
  onConvert: (moneyBox: Doc<'moneyBoxes'>) => void;
  onEdit: (moneyBox: Doc<'moneyBoxes'>) => void;
  onOpenActivity: (moneyBox: Doc<'moneyBoxes'>) => void;
  onOpenSettings: (moneyBox: Doc<'moneyBoxes'>) => void;
  onWithdraw: (moneyBox: Doc<'moneyBoxes'>) => void;
  plan: MoneyBoxFundingPlan;
}) {
  const { intlLocale, t } = useI18n();
  const { funding, moneyBox } = plan;
  const status = statusPresentation(funding.status);
  const StatusIcon = status.icon;

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-base font-semibold">{moneyBox.name}</div>
          <Badge variant={status.variant} className={status.className}>
            <StatusIcon data-icon="inline-start" />
            {t(status.key)}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={archivePending}
                aria-label={t('goals.saveUp.actions', { name: moneyBox.name })}
              >
                {archivePending ? <Spinner /> : <MoreHorizontalIcon />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onContribute(moneyBox)}>
                  <PiggyBankIcon />
                  {t('goals.saveUp.contribute')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={moneyBox.savedAmount.amountMinor <= 0n}
                  onClick={() => onWithdraw(moneyBox)}
                >
                  <WalletCardsIcon />
                  {t('goals.saveUp.withdraw.action')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenActivity(moneyBox)}>
                  <HistoryIcon />
                  {t('goals.saveUp.activity')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenSettings(moneyBox)}>
                  <Settings2Icon />
                  {t('goals.saveUp.settings.action')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={moneyBox.status !== 'active'} onClick={() => onEdit(moneyBox)}>
                  <PencilIcon />
                  {t('planning.moneyBoxes.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  aria-describedby={
                    moneyBox.heldOutsideBalance === true ? undefined : `goal-convert-unavailable-${moneyBox._id}`
                  }
                  disabled={moneyBox.heldOutsideBalance !== true}
                  onClick={() => onConvert(moneyBox)}
                >
                  <LandmarkIcon />
                  {t('goals.saveUp.convert.action')}
                </DropdownMenuItem>
                {moneyBox.heldOutsideBalance !== true ? (
                  <p
                    id={`goal-convert-unavailable-${moneyBox._id}`}
                    className="max-w-64 px-3 pt-1 pb-2 text-xs text-muted-foreground"
                  >
                    {t('goals.saveUp.convert.unavailable')}
                  </p>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={archivePending} onClick={() => onArchive(moneyBox)}>
                <ArchiveIcon />
                {t('planning.moneyBoxes.archive')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('goals.saveUp.saved')}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              <Amount money={moneyBox.savedAmount} variant="neutral" />
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {t('goals.saveUp.ofTarget')} <Amount money={moneyBox.targetAmount} variant="neutral" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Progress
            value={funding.progressPercent}
            aria-label={t('goals.saveUp.progressLabel', { name: moneyBox.name })}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t('goals.saveUp.progress', { percent: Math.round(funding.progressPercent) })}</span>
            <span>
              {t('goals.saveUp.monthlyPace')} <Amount money={funding.monthlyRequiredAmount} variant="neutral" />
            </span>
          </div>
        </div>
        <div className="grid gap-2 border-t border-border/60 pt-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">{t('goals.saveUp.targetDate')}</div>
            <div className="font-medium">{formatIsoDate(moneyBox.targetDate, intlLocale)}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-muted-foreground">{t('goals.saveUp.projected')}</div>
            <div className="font-medium">
              {funding.projectedCompletionDate
                ? formatIsoDate(funding.projectedCompletionDate, intlLocale)
                : t('goals.saveUp.projectedUnavailable')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
