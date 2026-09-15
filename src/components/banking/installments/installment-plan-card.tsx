import { HistoryIcon, MoreHorizontalIcon, PencilIcon, ReceiptTextIcon } from 'lucide-react';

import { InstallmentSegments } from './installment-segments';
import { remainingRepaymentAmount } from './helpers';
import type { CreditFacility, InstallmentPlan } from './helpers';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function InstallmentPlanCard({
  facility,
  onBackfill,
  onEdit,
  onMarkPaid,
  onRecordCustomPayment,
  pending,
  plan,
}: {
  facility?: CreditFacility;
  onBackfill: () => void;
  onEdit: () => void;
  onMarkPaid: () => void;
  onRecordCustomPayment: () => void;
  pending: boolean;
  plan: InstallmentPlan;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const paidInstallments = Math.max(0, plan.installmentCount - plan.remainingInstallments);
  const residualAmount = remainingRepaymentAmount(plan);

  return (
    <Card size="sm">
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{facility?.name ?? t('credit.installments.facility')}</Badge>
              <span className="text-sm text-muted-foreground">{t('credit.installments.dueLabel')}</span>
              <span className="font-medium text-chart-5">{plan.nextPaymentDate ?? t('common.notScheduled')}</span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <h3 className="truncate text-xl font-semibold tracking-tight">{plan.name}</h3>
              <p className="text-sm text-muted-foreground">
                {t('credit.installments.endsOn', {
                  date: plan.endDate,
                })}
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-left sm:grid-cols-2 lg:min-w-80 lg:text-right">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {t('credit.installments.monthlyShort')}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                <Amount money={plan.monthlyPaymentAmount} variant="neutral" />
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">{t('credit.installments.residual')}</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                <Amount money={residualAmount} variant="balance" />
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <InstallmentSegments paidInstallments={paidInstallments} totalInstallments={plan.installmentCount} />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-base">
              {t('credit.installments.segmentedProgress', {
                amount: maskValue(formatMoney(plan.monthlyPaymentAmount, intlLocale)),
                remainingInstallments: plan.remainingInstallments,
                totalInstallments: plan.installmentCount,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button disabled={pending} onClick={onMarkPaid} type="button">
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? t('credit.installments.recording') : t('credit.installments.recordPayment')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={t('credit.installments.actions')} size="icon-sm" type="button" variant="outline">
                    <MoreHorizontalIcon data-icon="icon" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={onEdit}>
                      <PencilIcon />
                      {t('credit.installments.editPlan')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onRecordCustomPayment}>
                      <ReceiptTextIcon />
                      {t('credit.installments.recordCustomPayment')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onBackfill}>
                      <HistoryIcon />
                      {t('credit.installments.backfillAction')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
