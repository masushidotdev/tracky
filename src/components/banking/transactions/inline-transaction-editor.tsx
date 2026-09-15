import * as React from 'react';
import { useMutation } from 'convex/react';
import { enUS as enUSDateLocale, it as itDateLocale } from 'date-fns/locale';

import { api } from '../../../../convex/_generated/api';
import {
  emptyInlineEntryDraft,
  inlineEntryRecurrenceOptions,
  inlineEntryRecurrenceValue,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  minimumBookingDate,
  plannedExpenseDirection,
  recurrenceForInlineEntry,
  todayIsoDate,
  validateInlineEntry,
  withAmountField,
} from './inline-entry';
import type { InlineEntryDraft, InlineEntryErrorCode, InlineEntryField } from './inline-entry';
import type { Column } from '@tanstack/react-table';
import type { TransactionRow } from './columns';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { AppLocale, TranslationKey } from '@/lib/i18n';
import { CategoryPicker } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { TableCell, TableRow } from '@/components/ui/table';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue } from '@/lib/money';
import { cn } from '@/lib/utils';

const CREATE_PENDING_KEY = 'inline-transaction-create';

export type InlineTransactionEditorMode =
  | { kind: 'create' }
  | { kind: 'plannedRule'; row: TransactionRow };

export type InlineTransactionEditorController = {
  mode: InlineTransactionEditorMode;
  accounts: Array<Doc<'financialAccounts'>>;
  categories: Array<Doc<'categories'>>;
  draft: InlineEntryDraft;
  update: (patch: Partial<InlineEntryDraft>) => void;
  updateAmount: (field: 'outflow' | 'inflow', value: string) => void;
  account: Doc<'financialAccounts'> | null;
  minBookingDate: string | undefined;
  scheduled: boolean;
  /** True once Repeat is anything but Never: the save goes to the planner, not to the ledger. */
  repeats: boolean;
  errorFor: (field: InlineEntryField) => string | null;
  scopeAccountId?: Id<'financialAccounts'>;
  pending: boolean;
  canSaveAnother: boolean;
  cancel: () => void;
  save: (mode: 'close' | 'another') => void;
};

const errorKeys: Record<InlineEntryErrorCode, TranslationKey> = {
  account: 'transactions.inline.errorAccount',
  date: 'transactions.inline.errorDate',
  dateLinkedAccount: 'transactions.inline.linkedAccountHint',
  description: 'transactions.inline.errorDescription',
  amountMissing: 'transactions.inline.errorAmount',
  amountInvalid: 'transactions.inline.errorAmountInvalid',
};

export function useInlineTransactionEditor({
  accounts,
  categories,
  mode,
  onClose,
  scopeAccountId,
}: {
  accounts: Array<Doc<'financialAccounts'>>;
  categories: Array<Doc<'categories'>>;
  mode: InlineTransactionEditorMode | null;
  onClose: () => void;
  scopeAccountId?: Id<'financialAccounts'>;
}): InlineTransactionEditorController | null {
  const { t } = useI18n();
  const { isPending, run } = usePendingAction();
  const createManualTransaction = useMutation(api.banking.manualTransactions.createManualTransaction);
  const createPlannedExpense = useMutation(api.banking.planning.createPlannedExpense);
  const updatePlannedExpense = useMutation(api.banking.planning.updatePlannedExpense);
  const today = todayIsoDate();
  const modeKey =
    mode?.kind === 'plannedRule'
      ? `planned:${mode.row.plannedOccurrence?.plannedTransactionId ?? mode.row._id}:${mode.row.bookingDate}`
      : (mode?.kind ?? null);
  const [draft, setDraft] = React.useState<InlineEntryDraft>(() => emptyInlineEntryDraft(today));
  const [draftModeKey, setDraftModeKey] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [serverError, setServerError] = React.useState<{ field: InlineEntryField; message: string } | null>(null);

  React.useEffect(() => {
    if (!mode) {
      setDraftModeKey(null);
      return;
    }

    if (mode.kind === 'create') {
      setDraft(emptyInlineEntryDraft(todayIsoDate(), scopeAccountId ?? accounts.at(0)?._id ?? ''));
    } else {
      const { plannedOccurrence, amount, direction } = mode.row;
      if (!plannedOccurrence) return;
      const amountValue = moneyInputValue(amount);
      setDraft({
        accountId: mode.row.accountId,
        bookingDate: plannedOccurrence.dueDate,
        counterpartyName: mode.row.counterpartyName ?? '',
        description: mode.row.description,
        categoryId: mode.row.categoryId ?? null,
        note: mode.row.note ?? '',
        outflow: direction === 'DBIT' ? amountValue : '',
        inflow: direction === 'CRDT' ? amountValue : '',
        recurrence: inlineEntryRecurrenceValue(
          plannedOccurrence.recurrence.interval,
          plannedOccurrence.recurrence.count,
        ),
      });
    }
    setDraftModeKey(modeKey);
    setShowErrors(false);
    setServerError(null);
  }, [accounts, mode, modeKey, scopeAccountId]);

  const account = accounts.find((candidate) => candidate._id === draft.accountId) ?? null;
  const validation = validateInlineEntry(draft, {
    today,
    account,
    requireFutureDateForLinkedAccount: mode?.kind !== 'plannedRule',
  });

  const update = React.useCallback((patch: Partial<InlineEntryDraft>) => {
    setServerError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const updateAmount = React.useCallback((field: 'outflow' | 'inflow', value: string) => {
    setServerError(null);
    setDraft((current) => withAmountField(current, field, value));
  }, []);

  const errorFor = React.useCallback(
    (field: InlineEntryField) => {
      if (serverError?.field === field) return serverError.message;
      const code = validation.errors[field];
      if (!code) return null;
      // The linked-account rule is a property of the account, not a typo: say it as soon as that
      // account is picked instead of waiting for a save that is already known to fail.
      if (!showErrors && code !== 'dateLinkedAccount') return null;
      return t(errorKeys[code]);
    },
    [serverError, showErrors, t, validation.errors],
  );

  const save = React.useCallback(
    (saveMode: 'close' | 'another') => {
      setShowErrors(true);
      setServerError(null);
      if (!mode || !account || !validation.values) return;

      const values = validation.values;
      const note = draft.note.trim();
      const description = draft.description.trim();
      const counterpartyName = draft.counterpartyName.trim();
      const categoryId = draft.categoryId ? (draft.categoryId as Id<'categories'>) : undefined;
      const recurrence = recurrenceForInlineEntry(draft.recurrence);
      const editingRule = mode.kind === 'plannedRule';
      const pendingKey = editingRule
        ? `inline-planned-rule-edit:${mode.row.plannedOccurrence?.plannedTransactionId ?? mode.row._id}`
        : CREATE_PENDING_KEY;

      void run(
        pendingKey,
        async () => {
          if (editingRule) {
            const plannedOccurrence = mode.row.plannedOccurrence;
            if (!plannedOccurrence) return;
            await updatePlannedExpense({
              plannedExpenseId: plannedOccurrence.plannedTransactionId,
              // Creation stores what the ledger calls Description as the rule name and Payee below it.
              name: description || counterpartyName,
              description: counterpartyName || undefined,
              note: note || null,
              amount: { amountMinor: values.amountMinor, currency: account.currency },
              direction: plannedExpenseDirection(values.direction),
              dueDate: draft.bookingDate,
              ...(recurrence
                ? {
                    recurrenceInterval: recurrence.interval,
                    recurrenceIntervalCount: recurrence.count,
                  }
                : {}),
              accountId: account._id,
              categoryId: categoryId ?? null,
            });
            return;
          }

          // A repeating entry is not a ledger row at all: it becomes a planned item the projection can
          // roll forward, which is the only place a recurrence can live.
          if (recurrence) {
            await createPlannedExpense({
              // Cash Flow lists these by name and shows the description beneath, so the description
              // leads: a recurring row reads better as what is being paid than as who is paid.
              name: description || counterpartyName,
              description: counterpartyName || undefined,
              note: note || undefined,
              amount: { amountMinor: values.amountMinor, currency: account.currency },
              direction: plannedExpenseDirection(values.direction),
              dueDate: draft.bookingDate,
              recurrenceInterval: recurrence.interval,
              recurrenceIntervalCount: recurrence.count,
              accountId: account._id,
              categoryId,
            });
            return;
          }

          await createManualTransaction({
            accountId: account._id,
            direction: values.direction,
            amount: { amountMinor: values.amountMinor, currency: account.currency },
            bookingDate: draft.bookingDate,
            description,
            counterpartyName: counterpartyName || undefined,
            note: note || undefined,
            categoryId,
          });
        },
        {
          success: editingRule
            ? t('planning.expenses.updated')
            : recurrence
              ? t('planning.form.created')
              : t('transactions.manual.created'),
          error: editingRule
            ? t('planning.expenses.updateFailed')
            : recurrence
              ? t('planning.form.createFailed')
              : t('transactions.manual.saveFailed'),
          getErrorMessage: (error) => {
            const raw = error instanceof Error ? error.message : String(error);
            // The backend refuses a non-scheduled row on a linked account. Say it under the date
            // field rather than throwing the raw ConvexError at the user.
            if (!editingRule && raw.includes('a linked account only accepts scheduled ones')) {
              const message = t('transactions.inline.linkedAccountHint');
              setServerError({ field: 'bookingDate', message });
              return message;
            }
            return editingRule
              ? t('planning.expenses.updateFailed')
              : recurrence
                ? t('planning.form.createFailed')
                : t('transactions.manual.saveFailed');
          },
        },
      ).then((saved) => {
        if (!saved) return;
        if (!editingRule && saveMode === 'another') {
          // Keep the run going: same date, same account, everything else blank.
          setDraft((current) => emptyInlineEntryDraft(current.bookingDate, current.accountId));
          setShowErrors(false);
          return;
        }
        onClose();
      });
    },
    [
      account,
      createManualTransaction,
      createPlannedExpense,
      draft.bookingDate,
      draft.categoryId,
      draft.counterpartyName,
      draft.description,
      draft.note,
      draft.recurrence,
      mode,
      onClose,
      run,
      t,
      updatePlannedExpense,
      validation.values,
    ],
  );

  if (!mode || draftModeKey !== modeKey) return null;
  const pendingKey =
    mode.kind === 'plannedRule'
      ? `inline-planned-rule-edit:${mode.row.plannedOccurrence?.plannedTransactionId ?? mode.row._id}`
      : CREATE_PENDING_KEY;

  return {
    mode,
    accounts,
    categories,
    draft,
    update,
    updateAmount,
    account,
    minBookingDate: mode.kind === 'create' ? minimumBookingDate(account, today) : undefined,
    scheduled: validation.scheduled,
    repeats: recurrenceForInlineEntry(draft.recurrence) !== null,
    errorFor,
    scopeAccountId,
    pending: isPending(pendingKey),
    canSaveAnother: mode.kind === 'create',
    cancel: onClose,
    save,
  };
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

const cellInputClassName = 'h-8 w-full min-w-0 px-2 text-xs';

const calendarLocales: Record<AppLocale, typeof enUSDateLocale> = {
  en: enUSDateLocale,
  it: itDateLocale,
};

const recurrenceIntervalLabelKeys = {
  day: { one: 'subscriptions.interval.day.one', other: 'subscriptions.interval.day.other' },
  week: { one: 'subscriptions.interval.week.one', other: 'subscriptions.interval.week.other' },
  month: { one: 'subscriptions.interval.month.one', other: 'subscriptions.interval.month.other' },
  year: { one: 'subscriptions.interval.year.one', other: 'subscriptions.interval.year.other' },
} as const satisfies Record<string, Record<'one' | 'other', TranslationKey>>;

/**
 * Date and Repeat share one popover: the cell is only as wide as the Date column, and the two
 * answers together are what decides whether the entry lands in the ledger or in the plan.
 */
function BookingDateField({
  draft,
  minBookingDate,
  update,
}: {
  draft: InlineEntryDraft;
  minBookingDate: string | undefined;
  update: (patch: Partial<InlineEntryDraft>) => void;
}) {
  const { intlLocale, locale, t } = useI18n();
  const repeatId = React.useId();
  const [open, setOpen] = React.useState(false);
  const selected = draft.bookingDate ? localDateFromIsoDate(draft.bookingDate) : undefined;
  // On a linked account anything before tomorrow is refused by the backend, so it is not offered.
  const minDate = minBookingDate ? localDateFromIsoDate(minBookingDate) : undefined;
  const customRecurrence = draft.recurrence.startsWith('custom:')
    ? recurrenceForInlineEntry(draft.recurrence)
    : null;
  const customRecurrenceLabel = customRecurrence
    ? t('transactions.scheduled.recurrenceMany', {
        count: customRecurrence.count,
        interval: t(recurrenceIntervalLabelKeys[customRecurrence.interval].other),
      })
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(cellInputClassName, 'justify-start font-normal')}
          aria-label={t('transactions.inline.date')}
        >
          <span className="truncate">
            {draft.bookingDate ? formatIsoDate(draft.bookingDate, intlLocale) : t('transactions.inline.selectDate')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          locale={calendarLocales[locale]}
          selected={selected}
          defaultMonth={selected ?? minDate}
          startMonth={minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => {
            if (!date) return;
            update({ bookingDate: isoDateFromLocalDate(date) });
          }}
        />
        <div className="flex flex-col gap-1.5 border-t p-3">
          <label htmlFor={repeatId} className="text-xs font-medium text-muted-foreground">
            {t('transactions.inline.repeat')}
          </label>
          <Select
            value={draft.recurrence}
            onValueChange={(value) => update({ recurrence: value as InlineEntryDraft['recurrence'] })}
          >
            <SelectTrigger id={repeatId} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {customRecurrenceLabel ? (
                  <SelectItem value={draft.recurrence}>{customRecurrenceLabel}</SelectItem>
                ) : null}
                {inlineEntryRecurrenceOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One editor input per column id. Both layouts render from here so the desktop row and the mobile
 * card can never drift apart.
 */
function useEditorFields(controller: InlineTransactionEditorController, showInlineErrors = true) {
  const { t } = useI18n();
  const { account, accounts, categories, draft, update, updateAmount } = controller;
  // In the table the cells are as narrow as their columns - the date one is 88px - so a message
  // rendered there is clipped to a fifth of itself. The row layout shows them together underneath
  // instead; the stacked card has the width to keep them beside their field.
  const errorFor = React.useCallback(
    (field: InlineEntryField) => (showInlineErrors ? controller.errorFor(field) : null),
    [controller, showInlineErrors],
  );
  const category = draft.categoryId
    ? (categories.find((candidate) => candidate._id === draft.categoryId) ?? null)
    : null;

  return React.useMemo<Partial<Record<string, React.ReactNode>>>(
    () => ({
      account: (
        <>
          <Select value={draft.accountId} onValueChange={(value) => update({ accountId: value })}>
            <SelectTrigger className={cn(cellInputClassName, 'gap-1')} aria-label={t('transactions.inline.account')}>
              <SelectValue placeholder={t('transactions.inline.account')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {accounts.map((candidate) => (
                  <SelectItem key={candidate._id} value={candidate._id}>
                    {accountLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError message={errorFor('account')} />
        </>
      ),
      bookingDate: (
        <>
          <BookingDateField draft={draft} minBookingDate={controller.minBookingDate} update={update} />
          <FieldError message={errorFor('bookingDate')} />
        </>
      ),
      counterpartyName: (
        <Input
          className={cellInputClassName}
          aria-label={t('transactions.inline.payee')}
          placeholder={t('transactions.inline.payee')}
          value={draft.counterpartyName}
          onChange={(event) => update({ counterpartyName: event.target.value })}
        />
      ),
      description: (
        <>
          <Input
            className={cellInputClassName}
            aria-label={t('transactions.inline.description')}
            placeholder={t('transactions.inline.description')}
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
          />
          <FieldError message={errorFor('description')} />
        </>
      ),
      category: (
        <CategoryPicker
          categories={categories}
          category={category}
          onValueChange={(categoryId) => update({ categoryId })}
        />
      ),
      note: (
        <Input
          className={cellInputClassName}
          aria-label={t('transactions.inline.memo')}
          placeholder={t('transactions.inline.memo')}
          value={draft.note}
          onChange={(event) => update({ note: event.target.value })}
        />
      ),
      outflow: (
        <>
          <Input
            inputMode="decimal"
            className={cn(cellInputClassName, 'text-right')}
            aria-label={t('transactions.inline.outflow')}
            placeholder={account?.currency ?? ''}
            value={draft.outflow}
            onChange={(event) => updateAmount('outflow', event.target.value)}
          />
          {/* One error for the pair, shown under the box the user is actually typing in. */}
          <FieldError message={draft.inflow.trim() ? null : errorFor('amount')} />
        </>
      ),
      inflow: (
        <>
          <Input
            inputMode="decimal"
            className={cn(cellInputClassName, 'text-right')}
            aria-label={t('transactions.inline.inflow')}
            placeholder={account?.currency ?? ''}
            value={draft.inflow}
            onChange={(event) => updateAmount('inflow', event.target.value)}
          />
          <FieldError message={draft.inflow.trim() ? errorFor('amount') : null} />
        </>
      ),
    }),
    [
      account?.currency,
      accounts,
      categories,
      category,
      controller.minBookingDate,
      draft,
      errorFor,
      t,
      update,
      updateAmount,
    ],
  );
}

const editorErrorFields: Array<InlineEntryField> = ['account', 'bookingDate', 'description', 'amount'];

function EditorActions({
  controller,
  showErrors = false,
}: {
  controller: InlineTransactionEditorController;
  showErrors?: boolean;
}) {
  const { t } = useI18n();
  const messages = showErrors
    ? [...new Set(editorErrorFields.map((field) => controller.errorFor(field)).filter(Boolean))]
    : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {messages.length > 0 ? (
        <div className="mr-auto flex flex-col gap-0.5">
          {messages.map((message) => (
            <span key={message} className="text-xs text-destructive">
              {message}
            </span>
          ))}
        </div>
      ) : controller.mode.kind === 'plannedRule' ? (
        <span className="mr-auto text-xs text-muted-foreground">{t('transactions.inline.ruleEditHint')}</span>
      ) : controller.repeats ? (
        // A repeat overrules the scheduled line: the entry never becomes a row here, so saying it
        // is "saved as scheduled" would point at the wrong screen.
        <span className="mr-auto text-xs text-muted-foreground">{t('transactions.inline.repeatHint')}</span>
      ) : controller.scheduled ? (
        <span className="mr-auto text-xs text-muted-foreground">{t('transactions.inline.scheduledHint')}</span>
      ) : (
        <span className="mr-auto" />
      )}
      <Button type="button" variant="ghost" size="sm" onClick={controller.cancel}>
        {t('common.cancel')}
      </Button>
      {controller.canSaveAnother ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={controller.pending}
          onClick={() => controller.save('another')}
        >
          {t('transactions.inline.saveAndAnother')}
        </Button>
      ) : null}
      <Button type="button" size="sm" disabled={controller.pending} onClick={() => controller.save('close')}>
        {controller.pending ? <Spinner data-icon="inline-start" /> : null}
        {t('common.save')}
      </Button>
    </div>
  );
}

/**
 * The editor lives inside the ledger's own <table>, one cell per visible column at that column's
 * current size, so dragging a column resizes the editor with it instead of leaving a parallel grid
 * behind.
 */
export function InlineTransactionEditorRows({
  columns,
  controller,
}: {
  columns: Array<Column<TransactionRow, unknown>>;
  controller: InlineTransactionEditorController;
}) {
  const { t } = useI18n();
  const fields = useEditorFields(controller, false);

  if (controller.accounts.length === 0) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={columns.length} className="text-sm text-muted-foreground">
          {t('transactions.inline.noAccounts')}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        {columns.map((column) => (
          <TableCell key={column.id} style={{ overflow: 'hidden', width: column.getSize() }} className="align-top">
            {fields[column.id] ?? null}
          </TableCell>
        ))}
      </TableRow>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={columns.length}>
          <EditorActions controller={controller} showErrors />
        </TableCell>
      </TableRow>
    </>
  );
}

/** Same controller, stacked, for the card list the ledger falls back to below md. */
export function InlineTransactionEditorCard({ controller }: { controller: InlineTransactionEditorController }) {
  const { t } = useI18n();
  const fields = useEditorFields(controller);

  if (controller.accounts.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">{t('transactions.inline.noAccounts')}</div>
    );
  }

  const rows: Array<{ id: string; label: string }> = [
    ...(controller.scopeAccountId ? [] : [{ id: 'account', label: t('transactions.inline.account') }]),
    { id: 'bookingDate', label: t('transactions.inline.date') },
    { id: 'counterpartyName', label: t('transactions.inline.payee') },
    { id: 'description', label: t('transactions.inline.description') },
    { id: 'category', label: t('transactions.table.category') },
    { id: 'note', label: t('transactions.inline.memo') },
    { id: 'outflow', label: t('transactions.inline.outflow') },
    { id: 'inflow', label: t('transactions.inline.inflow') },
  ];

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <FieldGroup>
        {rows.map((row) => (
          <Field key={row.id}>
            <FieldLabel>{row.label}</FieldLabel>
            {fields[row.id] ?? null}
          </Field>
        ))}
      </FieldGroup>
      <div className="mt-3">
        <EditorActions controller={controller} />
      </div>
    </div>
  );
}
