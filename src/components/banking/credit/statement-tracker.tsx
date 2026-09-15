import { CheckCircle2Icon, CircleHelpIcon, CreditCardIcon, LinkIcon, XCircleIcon } from 'lucide-react';
import { currentCycleMonth, nextMonthDueDate } from './helpers';
import type * as React from 'react';

import type { CreditFacility, CreditUsageCycle, CreditUsageCyclePaymentCandidate } from './types';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';

export function CreditActionTooltip({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={ariaLabel}>
          <CircleHelpIcon data-icon="icon" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="max-w-96 items-start text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function StatementTracker({
  facility,
  isAnyPending,
  onConfirmUsageCyclePayment,
  onSetUsageCycleStatus,
  openCycle,
  paymentCandidateByCycleId,
  scheduledCycles,
  usageCycleStatusPending,
}: {
  facility: CreditFacility;
  isAnyPending: boolean;
  onConfirmUsageCyclePayment: (
    usageCycleId: Id<'creditFacilityUsageCycles'>,
    transactionId: Id<'transactions'>,
  ) => void;
  onSetUsageCycleStatus: (usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') => void;
  openCycle: CreditUsageCycle | undefined;
  paymentCandidateByCycleId: Map<string, CreditUsageCyclePaymentCandidate>;
  scheduledCycles: Array<CreditUsageCycle>;
  usageCycleStatusPending: (usageCycleId: Id<'creditFacilityUsageCycles'>) => boolean;
}) {
  const { t } = useI18n();
  const cycleMonth = openCycle?.cycleMonth ?? currentCycleMonth();
  const dueDate = openCycle?.dueDate ?? nextMonthDueDate(facility.paymentDayOfMonth);

  return (
    <div className="mt-4 rounded-md bg-muted/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CreditCardIcon data-icon="inline-start" />
            <span className="font-medium">{t('credit.statement.title')}</span>
            <Badge variant="secondary">{cycleMonth}</Badge>
            <CreditActionTooltip ariaLabel={t('credit.statementTooltip.aria')}>
              <div className="flex max-w-80 flex-col gap-1">
                <p className="font-medium">{t('credit.statementTooltip.title')}</p>
                <p>{t('credit.statementTooltip.body')}</p>
                <p>{t('credit.statementTooltip.planning')}</p>
              </div>
            </CreditActionTooltip>
          </div>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <span>{t('credit.statement.currentTracked')}</span>
            <Amount money={facility.currentStatementAmount} variant="neutral" />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">{t('credit.statement.dueDate', { date: dueDate })}</div>
      </div>
      {scheduledCycles.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {scheduledCycles.map((cycle) => {
            const statusPending = usageCycleStatusPending(cycle._id);
            const candidate = paymentCandidateByCycleId.get(cycle._id);
            return (
              <div key={cycle._id} className="flex flex-col gap-2 rounded-md border bg-background p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <div className="flex items-center gap-1 font-medium">
                      <span>{cycle.cycleMonth} -</span>
                      <Amount money={cycle.trackedAmount} variant="neutral" />
                    </div>
                    <div className="text-muted-foreground">{cycle.dueDate}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isAnyPending}
                      onClick={() => onSetUsageCycleStatus(cycle._id, 'paid')}
                    >
                      {statusPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <CheckCircle2Icon data-icon="inline-start" />
                      )}
                      {t('credit.statement.markPaid')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isAnyPending}
                      onClick={() => onSetUsageCycleStatus(cycle._id, 'cancelled')}
                    >
                      {statusPending ? <Spinner data-icon="inline-start" /> : <XCircleIcon data-icon="inline-start" />}
                      {t('credit.statement.cancel')}
                    </Button>
                  </div>
                </div>
                {candidate ? (
                  <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <div className="truncate font-medium">{candidate.transaction.description}</div>
                      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                        <span>{candidate.transaction.bookingDate}</span>
                        <span>·</span>
                        <Amount money={candidate.transaction.amount} variant="neutral" />
                        {candidate.amountDelta.amountMinor > 0n ? (
                          <>
                            <span>·</span>
                            <span>{t('credit.statement.candidateDelta')}</span>
                            <Amount money={candidate.amountDelta} variant="neutral" />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isAnyPending || !candidate.confirmable}
                      onClick={() => onConfirmUsageCyclePayment(cycle._id, candidate.transaction._id)}
                    >
                      {statusPending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
                      {t('credit.statement.linkPayment')}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
