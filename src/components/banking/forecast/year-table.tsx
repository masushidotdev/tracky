import * as React from 'react';
import { Settings2Icon } from 'lucide-react';

import { EventsTab } from './events-tab';
import { EXTRA_SAVINGS_ACCOUNT_ID, displayMinor, shortId, targetId } from './forecast-utils';
import type {
  AccountOption,
  EurosMode,
  FacilityOption,
  ForecastAccountAssumption,
  ForecastLifeEvent,
  ForecastProjection,
  InvalidForecastLifeEvent,
} from './forecast-utils';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

export function YearTable({
  accounts,
  assumptions,
  facilities,
  invalidEvents,
  isPending,
  lifeEvents,
  mode,
  onAddEvent,
  onDeleteEvent,
  onEditAccount,
  onEditEvent,
  onToggleEvent,
  projection,
}: {
  accounts: Array<AccountOption>;
  assumptions: Array<ForecastAccountAssumption>;
  facilities: Array<FacilityOption>;
  invalidEvents: Array<InvalidForecastLifeEvent>;
  isPending: (key?: string) => boolean;
  lifeEvents: Array<ForecastLifeEvent>;
  mode: EurosMode;
  onAddEvent: () => void;
  onDeleteEvent: (event: ForecastLifeEvent) => Promise<boolean>;
  onEditAccount: (assumption: ForecastAccountAssumption, label: string) => void;
  onEditEvent: (event: ForecastLifeEvent) => void;
  onToggleEvent: (event: ForecastLifeEvent, enabled: boolean) => Promise<boolean>;
  projection: ForecastProjection;
}) {
  const { t } = useI18n();
  const [tab, setTab] = React.useState('accounts');
  const liabilityIds = new Set(
    projection.assumptions.accounts.filter((account) => account.kind === 'liability').map((account) => account.id),
  );
  const accountRows: Array<{ id: string; assumption?: ForecastAccountAssumption }> = [
    ...assumptions.map((assumption) => ({ id: targetId(assumption.target), assumption })),
    { id: EXTRA_SAVINGS_ACCOUNT_ID },
  ];

  const resolveLabel = (assumption: ForecastAccountAssumption) => {
    const target = assumption.target;
    if (target.kind === 'account') {
      return accountLabel(
        accounts.find((account) => account._id === target.accountId),
        t('forecast.table.unavailableAccount'),
      );
    }
    const facility = facilities.find((item) => item.creditFacilityId === target.creditFacilityId);
    return facility?.name ?? t('forecast.table.creditFacility', { suffix: shortId(target.creditFacilityId) });
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('forecast.table.title')}</CardTitle>
        <CardDescription>{t('forecast.table.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="accounts">{t('forecast.table.accounts')}</TabsTrigger>
            <TabsTrigger value="cashflow">{t('forecast.table.cashflow')}</TabsTrigger>
            <TabsTrigger value="events">{t('forecast.table.events')}</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="mt-4">
            <div className="overflow-x-auto rounded-2xl border">
              <table className="min-w-max text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="sticky left-0 z-20 min-w-56 bg-muted px-3 py-3 text-left font-medium">
                      {t('forecast.table.account')}
                    </th>
                    {projection.yearly.map((checkpoint) => (
                      <th key={checkpoint.date} className="min-w-32 px-3 py-3 text-right font-medium">
                        <span className="block">{checkpoint.calendarYear}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t('forecast.table.age', { age: checkpoint.age })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accountRows.map((row) => {
                    const isLiability = liabilityIds.has(row.id) || row.assumption?.target.kind === 'creditFacility';
                    const label = row.assumption ? resolveLabel(row.assumption) : t('forecast.table.extraSavings');
                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                        <th className="sticky left-0 z-10 bg-card px-3 py-3 text-left font-medium">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {row.assumption && !row.assumption.included ? (
                              <Badge variant="outline">{t('forecast.table.excluded')}</Badge>
                            ) : null}
                            {row.assumption ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('forecast.table.editAccount', { name: label })}
                                onClick={() => onEditAccount(row.assumption!, label)}
                              >
                                <Settings2Icon />
                              </Button>
                            ) : null}
                          </div>
                        </th>
                        {projection.yearly.map((checkpoint) => {
                          const balance = checkpoint.accounts.find((item) => item.id === row.id)?.endBalanceMinor;
                          if (balance === undefined) {
                            return (
                              <td key={checkpoint.date} className="px-3 py-3 text-right text-muted-foreground">
                                —
                              </td>
                            );
                          }
                          const signedBalance = isLiability ? -balance : balance;
                          return (
                            <td key={checkpoint.date} className="px-3 py-3 text-right">
                              <Amount
                                money={{
                                  amountMinor: displayMinor(signedBalance, checkpoint.deflatorScaled, mode),
                                  currency: projection.currency,
                                }}
                                variant="balance"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="cashflow" className="mt-4">
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="sticky left-0 z-20 bg-muted px-3 py-3 text-left font-medium">{t('forecast.table.year')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('forecast.table.income')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('forecast.table.expenses')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('forecast.table.savings')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.yearly.map((checkpoint) => (
                    <tr key={checkpoint.date} className="border-b last:border-0 hover:bg-muted/30">
                      <th className="sticky left-0 z-10 bg-card px-3 py-3 text-left font-medium">
                        {checkpoint.calendarYear}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {t('forecast.table.age', { age: checkpoint.age })}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right">
                        <Amount
                          money={{
                            amountMinor: displayMinor(checkpoint.annualIncomeMinor, checkpoint.deflatorScaled, mode),
                            currency: projection.currency,
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Amount
                          money={{
                            amountMinor: displayMinor(checkpoint.annualExpensesMinor, checkpoint.deflatorScaled, mode),
                            currency: projection.currency,
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Amount
                          money={{
                            amountMinor: displayMinor(checkpoint.annualSavingsMinor, checkpoint.deflatorScaled, mode),
                            currency: projection.currency,
                          }}
                          variant="balance"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventsTab
              events={lifeEvents}
              invalidEvents={invalidEvents}
              isPending={isPending}
              onAdd={onAddEvent}
              onDelete={onDeleteEvent}
              onEdit={onEditEvent}
              onToggle={onToggleEvent}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
