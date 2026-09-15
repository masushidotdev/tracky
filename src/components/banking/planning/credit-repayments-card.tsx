import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { formatIsoDateLabel } from './helpers';

import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoneyList } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function sumMoneyByCurrency(values: Array<Money>) {
  const totals = new Map<string, bigint>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0n) + value.amountMinor);
  }

  return Array.from(totals, ([currency, amountMinor]) => ({ amountMinor, currency }));
}

export function CreditRepaymentsCard() {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const [expandedFacilityIds, setExpandedFacilityIds] = React.useState<Set<string>>(() => new Set());
  const { data: upcomingInstallmentPayments } = useQuery(
    convexQuery(api.banking.credit.listUpcomingInstallmentPaymentGroups, {
      monthsAhead: 6,
      limit: 20,
    }),
  );
  const { data: activePlans } = useQuery(
    convexQuery(api.banking.credit.listInstallmentPlans, { status: 'active', limit: 100 }),
  );

  const firstGroupByFacility = new Map<string, NonNullable<typeof upcomingInstallmentPayments>[number]>();
  for (const group of [...(upcomingInstallmentPayments ?? [])].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate),
  )) {
    if (!firstGroupByFacility.has(group.facility._id)) {
      firstGroupByFacility.set(group.facility._id, group);
    }
  }
  const facilities = Array.from(firstGroupByFacility.values());

  const plansByFacility = new Map<string, NonNullable<typeof activePlans>>();
  for (const plan of activePlans ?? []) {
    const plans = plansByFacility.get(plan.creditFacilityId) ?? [];
    plans.push(plan);
    plansByFacility.set(plan.creditFacilityId, plans);
  }

  const monthlyCommitment = maskValue(
    formatMoneyList(sumMoneyByCurrency(facilities.map((facility) => facility.amount)), intlLocale, ' + '),
  );
  const totalOutstanding = maskValue(
    formatMoneyList(sumMoneyByCurrency((activePlans ?? []).map((plan) => plan.outstandingAmount)), intlLocale, ' + '),
  );
  const isLoading = upcomingInstallmentPayments === undefined || activePlans === undefined;

  function toggleFacility(facilityId: string) {
    setExpandedFacilityIds((current) => {
      const next = new Set(current);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('planning.creditRepayments.title')}</CardTitle>
        <CardDescription>{t('planning.creditRepayments.description')}</CardDescription>
        {!isLoading && facilities.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t('planning.creditRepayments.monthlyCommitment', { amount: monthlyCommitment })}
            </span>
            <span>
              {t('planning.creditRepayments.totalOutstanding', { amount: totalOutstanding })}
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!isLoading && facilities.length === 0 ? (
          <EmptyState className="p-4" title={t('planning.creditRepayments.empty')} />
        ) : null}
        {!isLoading && facilities.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('planning.creditRepayments.table.facility')}</TableHead>
                  <TableHead className="text-right">{t('planning.creditRepayments.table.installment')}</TableHead>
                  <TableHead>{t('planning.creditRepayments.table.nextDue')}</TableHead>
                  <TableHead className="text-right">{t('planning.creditRepayments.table.remaining')}</TableHead>
                  <TableHead>{t('planning.creditRepayments.table.endDate')}</TableHead>
                  <TableHead className="text-right">{t('planning.creditRepayments.table.outstanding')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilities.map((facility) => {
                  const plans = plansByFacility.get(facility.facility._id) ?? [];
                  const isMultiPlan = plans.length > 1;
                  const isExpanded = expandedFacilityIds.has(facility.facility._id);
                  const endDate = plans.reduce(
                    (latest, plan) => (plan.endDate > latest ? plan.endDate : latest),
                    '',
                  );
                  const outstanding = sumMoneyByCurrency(plans.map((plan) => plan.outstandingAmount));

                  return (
                    <React.Fragment key={facility.facility._id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            {isMultiPlan ? (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-expanded={isExpanded}
                                aria-label={t('planning.creditRepayments.planCount', { count: plans.length })}
                                onClick={() => toggleFacility(facility.facility._id)}
                              >
                                <ChevronRightIcon className={cn('transition-transform', isExpanded ? 'rotate-90' : undefined)} />
                              </Button>
                            ) : null}
                            <span>{facility.facility.name}</span>
                            {isMultiPlan ? (
                              <span className="text-muted-foreground">
                                · {t('planning.creditRepayments.planCount', { count: plans.length })}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right"><Amount money={facility.amount} variant="neutral" /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{formatIsoDateLabel(facility.dueDate, intlLocale)}</span>
                            {facility.isOverdue ? <Badge variant="destructive">{t('common.overdue')}</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {plans.length === 1 ? plans[0].remainingInstallments : '—'}
                        </TableCell>
                        <TableCell>{endDate ? formatIsoDateLabel(endDate, intlLocale) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {plans.length === 1 ? (
                            <Amount money={plans[0].outstandingAmount} variant="neutral" />
                          ) : outstanding.length > 0 ? (
                            maskValue(formatMoneyList(outstanding, intlLocale, ' + '))
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                      {isMultiPlan && isExpanded
                        ? plans.map((plan) => (
                            <TableRow key={plan._id} className="bg-muted/20">
                              <TableCell className="pl-8 text-muted-foreground">{plan.name}</TableCell>
                              <TableCell className="text-right">
                                <Amount money={plan.monthlyPaymentAmount} variant="neutral" />
                              </TableCell>
                              <TableCell>—</TableCell>
                              <TableCell className="text-right">{plan.remainingInstallments}</TableCell>
                              <TableCell>{formatIsoDateLabel(plan.endDate, intlLocale)}</TableCell>
                              <TableCell className="text-right">
                                <Amount money={plan.outstandingAmount} variant="neutral" />
                              </TableCell>
                            </TableRow>
                          ))
                        : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
