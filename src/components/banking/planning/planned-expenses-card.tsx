import { PlusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { PlannedExpenseActionsMenu } from './planned-expense-actions';
import { formatIsoDateLabel } from './helpers';
import type { PlannedExpense } from './helpers';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { plannedExpenseStatusKey } from '@/lib/planning-i18n';

export function PlannedExpensesCard({
  plannedExpenses,
  onCreate,
  onCreateMoneyBox,
  onEditPlannedExpense,
}: {
  plannedExpenses: Array<PlannedExpense> | undefined;
  onCreate: () => void;
  onCreateMoneyBox: (expense: PlannedExpense) => void;
  onEditPlannedExpense: (expense: PlannedExpense) => void;
}) {
  const { intlLocale, t } = useI18n();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t('planning.expenses.title')}</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          {t('planning.expenses.new')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {plannedExpenses?.length === 0 && <EmptyState className="p-4" title={t('planning.expenses.empty')} />}
        {plannedExpenses && plannedExpenses.length > 0 ? (
          <div className="divide-y">
            {plannedExpenses.map((expense) => (
              <div key={expense._id} className="flex items-center gap-3 py-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {(expense.direction ?? 'outflow') === 'inflow' ? <TrendingUpIcon /> : <TrendingDownIcon />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{expense.name}</div>
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{t(plannedExpenseStatusKey(expense.status))}</Badge>
                    {expense.description ? <span className="truncate">{expense.description}</span> : null}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {formatIsoDateLabel(expense.dueDate, intlLocale)}
                </div>
                <div className="shrink-0 text-right text-sm font-medium">
                    <Amount
                      money={expense.amount}
                      variant="signed"
                      direction={(expense.direction ?? 'outflow') === 'inflow' ? 'CRDT' : 'DBIT'}
                    />
                </div>
                <PlannedExpenseActionsMenu
                    plannedExpenseId={expense._id}
                    status={expense.status}
                    hasMoneyBox={Boolean(expense.moneyBoxId)}
                    plannedExpense={expense}
                    onCreateMoneyBox={onCreateMoneyBox}
                    onEdit={onEditPlannedExpense}
                />
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
