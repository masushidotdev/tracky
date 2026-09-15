import { useMutation } from 'convex/react';
import { LightbulbIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

import { api } from '../../../../convex/_generated/api';

import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function SuggestionsCard() {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const { data: suggestedPlannedExpenses } = useQuery(
    convexQuery(api.banking.planning.listSuggestedPlannedExpenses, {
      limit: 5,
      minAmount: { amountMinor: 20000n, currency: 'EUR' },
    }),
  );
  const acceptPlannedExpenseSuggestion = useMutation(api.banking.planning.acceptPlannedExpenseSuggestion);
  const { isPending, run } = usePendingAction();

  async function acceptSuggestion(suggestionKey: string, direction: 'inflow' | 'outflow') {
    await run(
      `planning-suggestion:${suggestionKey}`,
      async () => {
        await acceptPlannedExpenseSuggestion({
          suggestionKey,
          createMoneyBox: direction === 'outflow',
        });
      },
      {
        success: t('planning.suggestions.created'),
        error: t('planning.suggestions.createFailed'),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('planning.suggestions.title')}</CardTitle>
        <CardDescription>{t('planning.suggestions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {suggestedPlannedExpenses === undefined && <Skeleton className="h-24 w-full" />}
        {suggestedPlannedExpenses?.length === 0 && (
          <EmptyState className="p-4" icon={LightbulbIcon} title={t('planning.suggestions.empty')} />
        )}
        {suggestedPlannedExpenses?.map((suggestion) => (
          <div key={suggestion.suggestionKey} className="rounded-md border p-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{suggestion.name}</span>
                  <Badge variant="secondary">
                    {t('planning.suggestions.confidence', { value: Math.round(suggestion.confidence * 100) })}
                  </Badge>
                  <Badge variant="secondary">
                    {t(
                      suggestion.direction === 'inflow'
                        ? 'planning.cashflow.source.plannedIncome'
                        : 'planning.cashflow.source.plannedExpense',
                    )}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('planning.suggestions.lastPaid', {
                    dueDate: suggestion.dueDate,
                    lastPaidDate: suggestion.lastPaidDate,
                  })}
                </div>
                <div className="text-sm text-muted-foreground">{suggestion.description}</div>
              </div>
              <div className="text-left text-sm sm:text-right">
                <div className="font-medium">
                  <Amount
                    money={suggestion.amount}
                    variant="signed"
                    direction={suggestion.direction === 'inflow' ? 'CRDT' : 'DBIT'}
                  />
                </div>
                {suggestion.direction === 'outflow' ? (
                  <div className="text-muted-foreground">
                    {t('planning.suggestions.monthly', {
                      amount: maskValue(formatMoney(suggestion.funding.monthlyRequiredAmount, intlLocale)),
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {suggestion.direction === 'outflow' ? (
                <div className="text-sm text-muted-foreground">
                  {t('planning.suggestions.monthsToFund', { months: suggestion.funding.monthsRemaining })}
                </div>
              ) : (
                <div />
              )}
              <Button
                type="button"
                variant="outline"
                disabled={isPending(`planning-suggestion:${suggestion.suggestionKey}`)}
                onClick={() => acceptSuggestion(suggestion.suggestionKey, suggestion.direction)}
              >
                {isPending(`planning-suggestion:${suggestion.suggestionKey}`) ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {t(suggestion.direction === 'inflow' ? 'planning.suggestions.addIncome' : 'planning.form.createMoneyBox')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
