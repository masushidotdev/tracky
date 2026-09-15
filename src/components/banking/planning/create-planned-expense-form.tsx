import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import {
  formattedWeeklyOccurrence,
  isIsoDate,
  nextIsoDateOnOrAfterWeekday,
  weekdayFromIsoDate,
  weekdayLabel,
  weekdays,
} from './helpers';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';

import type { RecurrenceInterval, Weekday } from './helpers';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function CreatePlannedExpenseForm({
  accounts,
  initialAccountId,
  onCreated,
}: {
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  initialAccountId?: Id<'financialAccounts'>;
  onCreated?: () => void;
}) {
  const { intlLocale, t } = useI18n();
  const createPlannedExpense = useMutation(api.banking.planning.createPlannedExpense);
  const { isPending, run } = usePendingAction();

  const [name, setName] = React.useState('');
  const [account, setAccount] = React.useState<Id<'financialAccounts'> | undefined>(initialAccountId);
  const [amount, setAmount] = React.useState('');
  const [direction, setDirection] = React.useState<'inflow' | 'outflow'>('outflow');
  const [dueDate, setDueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [createMoneyBox, setCreateMoneyBox] = React.useState(false);
  const [recurringExpense, setRecurringExpense] = React.useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = React.useState<RecurrenceInterval>('day');
  const [recurrenceIntervalCount, setRecurrenceIntervalCount] = React.useState(1);
  const [weeklyWeekday, setWeeklyWeekday] = React.useState<Weekday>(() => weekdayFromIsoDate(dueDate));

  const recurrenceIntervalCountValue =
    Number.isInteger(recurrenceIntervalCount) && recurrenceIntervalCount > 0 ? recurrenceIntervalCount : 1;
  const normalizedDueDate =
    recurringExpense && recurrenceInterval === 'week' ? nextIsoDateOnOrAfterWeekday(dueDate, weeklyWeekday) : dueDate;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await run(
      'planned-expense-create',
      async () => {
        await createPlannedExpense({
          name,
          amount: {
            amountMinor: parseMoneyMinor(amount, 'EUR'),
            currency: 'EUR',
          },
          direction,
          dueDate: normalizedDueDate,
          createMoneyBox: direction === 'outflow' ? createMoneyBox : false,
          ...(recurringExpense
            ? {
                recurrenceInterval,
                recurrenceIntervalCount: recurrenceIntervalCountValue,
              }
            : {}),
          ...(account ? { accountId: account } : {}),
        });
      },
      {
        success: t('planning.form.created'),
        error: t('planning.form.createFailed'),
      },
    );

    if (created) {
      setName('');
      setAmount('');
      setDueDate(normalizedDueDate);
      onCreated?.();
    }
  }

  return (
    <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="plannedName">{t('common.name')}</FieldLabel>
              <Input
                id="plannedName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('planning.form.namePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plannedAmount">{t('common.amount')}</FieldLabel>
              <Input
                id="plannedAmount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="720.00"
              />
            </Field>
            <Field>
              <FieldLabel>{t('planning.form.direction')}</FieldLabel>
              <ToggleGroup
                type="single"
                value={direction}
                variant="outline"
                spacing={0}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  const nextDirection = value as 'inflow' | 'outflow';
                  setDirection(nextDirection);
                  if (nextDirection === 'inflow') {
                    setCreateMoneyBox(false);
                  }
                }}
              >
                <ToggleGroupItem value="outflow">{t('planning.form.direction.outflow')}</ToggleGroupItem>
                <ToggleGroupItem value="inflow">{t('planning.form.direction.inflow')}</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="plannedDueDate">{t('planning.form.dueDate')}</FieldLabel>
              <Input
                id="plannedDueDate"
                type="date"
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.target.value);
                  if (recurringExpense && recurrenceInterval === 'week') {
                    setWeeklyWeekday(weekdayFromIsoDate(event.target.value));
                  }
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account">{t('planning.form.account')}</FieldLabel>
              <Select value={account} onValueChange={(value) => setAccount(value as Id<'financialAccounts'>)}>
                <SelectTrigger>
                  <SelectValue></SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-24">
                  <SelectGroup>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc._id} value={acc._id}>
                        {accountLabel(acc)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {direction === 'outflow' ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="createMoneyBox"
                  checked={createMoneyBox}
                  onCheckedChange={(checked) => setCreateMoneyBox(checked as boolean)}
                />
                <FieldLabel htmlFor="createMoneyBox">{t('planning.form.createMoneyBox')}</FieldLabel>
              </Field>
            ) : null}
            <Field orientation="horizontal">
              <Checkbox
                id="recurring"
                checked={recurringExpense}
                onCheckedChange={(checked) => setRecurringExpense(checked as boolean)}
              />
              <FieldLabel htmlFor="recurring">{t('planning.form.recurring')}</FieldLabel>
            </Field>
            {recurringExpense && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="recurrenceInterval">{t('planning.form.recurrenceInterval')}</FieldLabel>

                  <ButtonGroup>
                    <Field>
                      <Input
                        type="number"
                        id="recurrenceIntervalCount"
                        value={recurrenceIntervalCount}
                        onChange={(event) =>
                          setRecurrenceIntervalCount(event.target.value ? Number(event.target.value) : 1)
                        }
                        placeholder="1"
                        autoComplete="off"
                        className="rounded-e-none"
                        step="1"
                      />
                    </Field>
                    <Select
                      value={recurrenceInterval}
                      onValueChange={(value) => {
                        const nextInterval = value as RecurrenceInterval;
                        setRecurrenceInterval(nextInterval);
                        if (nextInterval === 'week') {
                          setWeeklyWeekday(weekdayFromIsoDate(dueDate));
                        }
                      }}
                    >
                      <SelectTrigger className="font-mono">
                        <SelectValue>{recurrenceInterval}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-24">
                        <SelectGroup>
                          <SelectItem value={'day'}>{t('planning.form.interval.day')}</SelectItem>
                          <SelectItem value={'week'}>{t('planning.form.interval.week')}</SelectItem>
                          <SelectItem value={'month'}>{t('planning.form.interval.month')}</SelectItem>
                          <SelectItem value={'year'}>{t('planning.form.interval.year')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </ButtonGroup>
                </Field>
                {recurrenceInterval === 'week' ? (
                  <Field>
                    <FieldLabel htmlFor="recurrenceWeekday">{t('planning.form.weekday')}</FieldLabel>
                    <Select
                      value={String(weeklyWeekday)}
                      onValueChange={(value) => setWeeklyWeekday(Number(value) as Weekday)}
                    >
                      <SelectTrigger id="recurrenceWeekday" className="w-full">
                        <SelectValue>{weekdayLabel(weeklyWeekday, intlLocale)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {weekdays.map((weekday) => (
                            <SelectItem key={weekday} value={String(weekday)}>
                              {weekdayLabel(weekday, intlLocale)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {isIsoDate(normalizedDueDate) ? (
                      <p className="text-sm text-muted-foreground">
                        {t('planning.form.weeklyPreview', {
                          date: formattedWeeklyOccurrence(normalizedDueDate, intlLocale),
                          count: recurrenceIntervalCountValue,
                        })}
                      </p>
                    ) : null}
                  </Field>
                ) : null}
              </FieldGroup>
            )}
            <Button
              type="submit"
              disabled={!name.trim() || !amount.trim() || !dueDate || isPending('planned-expense-create')}
            >
              {isPending('planned-expense-create') ? <Spinner data-icon="inline-start" /> : null}
              {t('planning.form.submit')}
            </Button>
          </FieldGroup>
    </form>
  );
}

export function CreatePlannedExpenseDialog({
  accountId,
  accounts,
  onOpenChange,
  open,
}: {
  accountId?: Id<'financialAccounts'>;
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('planning.form.title')}</DialogTitle>
          <DialogDescription>{t('planning.form.description')}</DialogDescription>
        </DialogHeader>
        <CreatePlannedExpenseForm
          key={accountId}
          accounts={accounts}
          initialAccountId={accountId}
          onCreated={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
