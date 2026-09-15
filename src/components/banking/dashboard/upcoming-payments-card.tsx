import { Link } from '@tanstack/react-router';
import { RepeatIcon } from 'lucide-react';

import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { accountLabel } from '@/lib/accounts';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export type UpcomingPaymentDatum = {
  id: string;
  name: string;
  dueDate: string;
  amount: Money;
  direction: 'inflow' | 'outflow';
  source:
    | 'plannedExpense'
    | 'subscription'
    | 'scheduledTransaction'
    | 'creditInstallment'
    | 'creditStatement'
    | 'plannedTransfer';
  account?: {
    _id: string;
    alias?: string | null;
    institutionName?: string | null;
    ibanMasked?: string | null;
    name?: string | null;
  };
};

type PaymentGroup = {
  id: string;
  account?: UpcomingPaymentDatum['account'];
  payments: Array<UpcomingPaymentDatum>;
  totals: Array<Money>;
};

function groupPayments(data: Array<UpcomingPaymentDatum>): Array<PaymentGroup> {
  const groups = new Map<string, PaymentGroup>();
  for (const payment of data) {
    const id = payment.account?._id ?? 'unknown';
    const group = groups.get(id) ?? { id, account: payment.account, payments: [], totals: [] };
    group.payments.push(payment);
    // Subtotal = amount due per account: outflows only, so inflows and receiving transfer legs don't offset it.
    if (payment.direction === 'outflow') {
      const total = group.totals.find((money) => money.currency === payment.amount.currency);
      if (total) {
        total.amountMinor += payment.amount.amountMinor;
      } else {
        group.totals.push({ amountMinor: payment.amount.amountMinor, currency: payment.amount.currency });
      }
    }
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    payments: group.payments.toSorted((left, right) => left.dueDate.localeCompare(right.dueDate)),
    totals: group.totals.toSorted((left, right) => left.currency.localeCompare(right.currency)),
  }));
}

export function UpcomingPaymentsCard({
  data,
  selectedAccountId,
}: {
  data: Array<UpcomingPaymentDatum> | undefined;
  selectedAccountId?: string;
}) {
  const { intlLocale, t } = useI18n();
  const groups = data ? groupPayments(data) : undefined;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('dashboard.upcoming.title')}</CardTitle>
        <CardAction>
          <Link to="/app/planning" className="text-sm text-muted-foreground hover:text-foreground">
            {t('dashboard.viewAll')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data === undefined ? <ListSkeleton rows={8} /> : null}
        {data?.length === 0 ? (
          <EmptyState
            className="min-h-56 border-0 p-0"
            icon={RepeatIcon}
            title={t('dashboard.upcoming.emptyTitle')}
            hint={t('dashboard.upcoming.empty')}
          />
        ) : null}
        {groups && groups.length > 0 ? (
          <Accordion key={selectedAccountId ?? 'all'} type="single" collapsible defaultValue={selectedAccountId ?? undefined}>
            {groups.map((group) => (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger>
                  <span className="min-w-0">
                    <span className="block truncate">{accountLabel(group.account, t('planning.cashflow.unknownAccount'))}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('dashboard.upcoming.groupCount', { count: group.payments.length })}
                    </span>
                  </span>
                  <span className="mr-2 flex shrink-0 flex-wrap justify-end gap-x-1.5">
                    {group.totals.map((total) => (
                      <Amount key={total.currency} money={total} variant="neutral" />
                    ))}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="divide-y divide-border/60">
                    {group.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{payment.name}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatIsoDate(payment.dueDate, intlLocale)}</span>
                            <Badge variant="secondary">
                              {t(
                                payment.source === 'plannedExpense' && payment.direction === 'inflow'
                                  ? 'planning.cashflow.source.plannedIncome'
                                  : `planning.cashflow.source.${payment.source}`,
                              )}
                            </Badge>
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-medium">
                          <Amount
                            money={payment.amount}
                            variant="signed"
                            direction={payment.direction === 'outflow' ? 'DBIT' : 'CRDT'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
