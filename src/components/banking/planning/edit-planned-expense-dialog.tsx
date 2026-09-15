import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import {
  formattedWeeklyOccurrence,
  isIsoDate,
  moneyAmountInputValue,
  nextIsoDateOnOrAfterWeekday,
  weekdayFromIsoDate,
  weekdayLabel,
  weekdays,
} from './helpers';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';

import type { PlannedExpense, RecurrenceInterval, Weekday } from './helpers';
import { accountLabel } from '@/lib/accounts';
import { CategoryPicker } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function EditPlannedExpenseDialog({
  expense,
  accounts,
  categories,
  onClose,
}: {
  expense: PlannedExpense | null;
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  categories: Array<Doc<'categories'>> | undefined;
  onClose: () => void;
}) {
  const { intlLocale, t } = useI18n();
  const updatePlannedExpense = useMutation(api.banking.planning.updatePlannedExpense);
  const { isPending, run } = usePendingAction();

  const [editName, setEditName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editNote, setEditNote] = React.useState('');
  const [editAmount, setEditAmount] = React.useState('');
  const [editDirection, setEditDirection] = React.useState<'inflow' | 'outflow'>('outflow');
  const [editDueDate, setEditDueDate] = React.useState('');
  const [editAccount, setEditAccount] = React.useState<string>('none');
  const [editCategoryId, setEditCategoryId] = React.useState<Id<'categories'> | null>(null);
  const [editRecurringExpense, setEditRecurringExpense] = React.useState(false);
  const [editRecurrenceInterval, setEditRecurrenceInterval] = React.useState<RecurrenceInterval>('day');
  const [editRecurrenceIntervalCount, setEditRecurrenceIntervalCount] = React.useState(1);
  const [editWeeklyWeekday, setEditWeeklyWeekday] = React.useState<Weekday>(0);

  React.useEffect(() => {
    if (!expense) {
      return;
    }

    setEditName(expense.name);
    setEditDescription(expense.description ?? '');
    setEditNote(expense.note ?? '');
    setEditAmount(moneyAmountInputValue(expense.amount));
    setEditDirection(expense.direction ?? 'outflow');
    setEditDueDate(expense.dueDate);
    setEditAccount(expense.accountId ?? 'none');
    setEditCategoryId(expense.categoryId ?? null);
    setEditRecurringExpense(Boolean(expense.recurrenceInterval));
    setEditRecurrenceInterval(expense.recurrenceInterval ?? 'day');
    setEditRecurrenceIntervalCount(expense.recurrenceIntervalCount ?? 1);
    setEditWeeklyWeekday(weekdayFromIsoDate(expense.dueDate));
  }, [expense]);

  const editRecurrenceIntervalCountValue =
    Number.isInteger(editRecurrenceIntervalCount) && editRecurrenceIntervalCount > 0 ? editRecurrenceIntervalCount : 1;
  const editCategory = categories?.find((category) => category._id === editCategoryId) ?? null;
  const editNormalizedDueDate =
    editRecurringExpense && editRecurrenceInterval === 'week'
      ? nextIsoDateOnOrAfterWeekday(editDueDate, editWeeklyWeekday)
      : editDueDate;

  async function onEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expense) {
      return;
    }

    const updated = await run(
      `planned-expense-edit:${expense._id}`,
      async () => {
        await updatePlannedExpense({
          plannedExpenseId: expense._id,
          name: editName,
          description: editDescription.trim() ? editDescription : undefined,
          note: editNote.trim() ? editNote : null,
          amount: {
            amountMinor: parseMoneyMinor(editAmount, expense.amount.currency),
            currency: expense.amount.currency,
          },
          direction: editDirection,
          dueDate: editNormalizedDueDate,
          ...(editRecurringExpense
            ? {
                recurrenceInterval: editRecurrenceInterval,
                recurrenceIntervalCount: editRecurrenceIntervalCountValue,
              }
            : {}),
          accountId: editAccount === 'none' ? null : (editAccount as Id<'financialAccounts'>),
          categoryId: editCategoryId,
        });
      },
      {
        success: t('planning.expenses.updated'),
        error: t('planning.expenses.updateFailed'),
      },
    );

    if (updated) {
      onClose();
    }
  }

  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('planning.expenses.editTitle')}</DialogTitle>
          <DialogDescription>{t('planning.expenses.editDescription')}</DialogDescription>
        </DialogHeader>
        <form id="edit-planned-expense-form" onSubmit={onEditSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="editPlannedName">{t('common.name')}</FieldLabel>
              <Input
                id="editPlannedName"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder={t('planning.form.namePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedDescription">{t('transactions.table.payee')}</FieldLabel>
              <Input
                id="editPlannedDescription"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedNote">{t('transactions.table.memo')}</FieldLabel>
              <Input
                id="editPlannedNote"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                placeholder={t('planning.form.notePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedAmount">{t('common.amount')}</FieldLabel>
              <Input
                id="editPlannedAmount"
                value={editAmount}
                onChange={(event) => setEditAmount(event.target.value)}
                placeholder="720.00"
              />
            </Field>
            <Field>
              <FieldLabel>{t('planning.form.direction')}</FieldLabel>
              <ToggleGroup
                type="single"
                value={editDirection}
                variant="outline"
                spacing={0}
                onValueChange={(value) => {
                  if (value) {
                    setEditDirection(value as 'inflow' | 'outflow');
                  }
                }}
              >
                <ToggleGroupItem value="outflow">{t('planning.form.direction.outflow')}</ToggleGroupItem>
                <ToggleGroupItem value="inflow" disabled={Boolean(expense?.moneyBoxId)}>
                  {t('planning.form.direction.inflow')}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedDueDate">{t('planning.form.dueDate')}</FieldLabel>
              <Input
                id="editPlannedDueDate"
                type="date"
                value={editDueDate}
                onChange={(event) => {
                  setEditDueDate(event.target.value);
                  if (editRecurringExpense && editRecurrenceInterval === 'week') {
                    setEditWeeklyWeekday(weekdayFromIsoDate(event.target.value));
                  }
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editAccount">{t('planning.form.account')}</FieldLabel>
              <Select value={editAccount} onValueChange={setEditAccount}>
                <SelectTrigger id="editAccount" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('planning.form.noAccount')}</SelectItem>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc._id} value={acc._id}>
                        {accountLabel(acc)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t('transactions.table.category')}</FieldLabel>
              <CategoryPicker
                categories={categories ?? []}
                category={editCategory}
                onValueChange={setEditCategoryId}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="editRecurring"
                checked={editRecurringExpense}
                onCheckedChange={(checked) => setEditRecurringExpense(checked as boolean)}
              />
              <FieldLabel htmlFor="editRecurring">{t('planning.form.recurring')}</FieldLabel>
            </Field>
            {editRecurringExpense ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="editRecurrenceInterval">{t('planning.form.recurrenceInterval')}</FieldLabel>
                  <ButtonGroup>
                    <Field>
                      <Input
                        type="number"
                        id="editRecurrenceIntervalCount"
                        value={editRecurrenceIntervalCount}
                        onChange={(event) =>
                          setEditRecurrenceIntervalCount(event.target.value ? Number(event.target.value) : 1)
                        }
                        placeholder="1"
                        autoComplete="off"
                        className="rounded-e-none"
                        step="1"
                      />
                    </Field>
                    <Select
                      value={editRecurrenceInterval}
                      onValueChange={(value) => {
                        const nextInterval = value as RecurrenceInterval;
                        setEditRecurrenceInterval(nextInterval);
                        if (nextInterval === 'week') {
                          setEditWeeklyWeekday(weekdayFromIsoDate(editDueDate));
                        }
                      }}
                    >
                      <SelectTrigger id="editRecurrenceInterval" className="font-mono">
                        <SelectValue>{editRecurrenceInterval}</SelectValue>
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
                {editRecurrenceInterval === 'week' ? (
                  <Field>
                    <FieldLabel htmlFor="editRecurrenceWeekday">{t('planning.form.weekday')}</FieldLabel>
                    <Select
                      value={String(editWeeklyWeekday)}
                      onValueChange={(value) => setEditWeeklyWeekday(Number(value) as Weekday)}
                    >
                      <SelectTrigger id="editRecurrenceWeekday" className="w-full">
                        <SelectValue>{weekdayLabel(editWeeklyWeekday, intlLocale)}</SelectValue>
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
                    {isIsoDate(editNormalizedDueDate) ? (
                      <p className="text-sm text-muted-foreground">
                        {t('planning.form.weeklyPreview', {
                          date: formattedWeeklyOccurrence(editNormalizedDueDate, intlLocale),
                          count: editRecurrenceIntervalCountValue,
                        })}
                      </p>
                    ) : null}
                  </Field>
                ) : null}
              </FieldGroup>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('planning.expenses.editCancel')}
          </Button>
          <Button
            type="submit"
            form="edit-planned-expense-form"
            disabled={!editName.trim() || !editAmount.trim() || !editDueDate || isPending()}
          >
            {isPending() ? <Spinner data-icon="inline-start" /> : null}
            {t('planning.expenses.editSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
