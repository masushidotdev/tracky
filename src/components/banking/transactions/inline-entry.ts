import type { TranslationKey } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export type InlineEntryDraft = {
  accountId: string;
  bookingDate: string;
  counterpartyName: string;
  description: string;
  categoryId: string | null;
  note: string;
  outflow: string;
  inflow: string;
  recurrence: InlineEntryRecurrenceValue;
};

/** The four steps `recurrenceIntervalValidator` accepts on the backend. */
export type InlineEntryRecurrenceInterval = 'day' | 'week' | 'month' | 'year';

export type InlineEntryRecurrenceId =
  | 'never'
  | 'daily'
  | 'weekly'
  | 'everyOtherWeek'
  | 'everyFourWeeks'
  | 'monthly'
  | 'everyOtherMonth'
  | 'everyThreeMonths'
  | 'everyFourMonths'
  | 'twiceAYear'
  | 'yearly'
  | 'everyOtherYear';

export type InlineEntryRecurrenceValue =
  | InlineEntryRecurrenceId
  | `custom:${InlineEntryRecurrenceInterval}:${number}`;

export type InlineEntryRecurrenceOption = {
  id: InlineEntryRecurrenceId;
  labelKey: TranslationKey;
  /** null on 'never' only: the entry stays a one-off row instead of becoming a planned item. */
  recurrence: { interval: InlineEntryRecurrenceInterval; count: number } | null;
};

/**
 * Every offer here is an interval multiplied by a count, which is all the backend stores. A
 * "twice a month" step (the 1st and the 15th) is semi-monthly and cannot be written that way, so it
 * is deliberately missing rather than mapped onto something that would drift by a day every month.
 */
export const inlineEntryRecurrenceOptions: ReadonlyArray<InlineEntryRecurrenceOption> = [
  { id: 'never', labelKey: 'transactions.inline.repeat.never', recurrence: null },
  { id: 'daily', labelKey: 'transactions.inline.repeat.daily', recurrence: { interval: 'day', count: 1 } },
  { id: 'weekly', labelKey: 'transactions.inline.repeat.weekly', recurrence: { interval: 'week', count: 1 } },
  {
    id: 'everyOtherWeek',
    labelKey: 'transactions.inline.repeat.everyOtherWeek',
    recurrence: { interval: 'week', count: 2 },
  },
  {
    id: 'everyFourWeeks',
    labelKey: 'transactions.inline.repeat.everyFourWeeks',
    recurrence: { interval: 'week', count: 4 },
  },
  { id: 'monthly', labelKey: 'transactions.inline.repeat.monthly', recurrence: { interval: 'month', count: 1 } },
  {
    id: 'everyOtherMonth',
    labelKey: 'transactions.inline.repeat.everyOtherMonth',
    recurrence: { interval: 'month', count: 2 },
  },
  {
    id: 'everyThreeMonths',
    labelKey: 'transactions.inline.repeat.everyThreeMonths',
    recurrence: { interval: 'month', count: 3 },
  },
  {
    id: 'everyFourMonths',
    labelKey: 'transactions.inline.repeat.everyFourMonths',
    recurrence: { interval: 'month', count: 4 },
  },
  { id: 'twiceAYear', labelKey: 'transactions.inline.repeat.twiceAYear', recurrence: { interval: 'month', count: 6 } },
  { id: 'yearly', labelKey: 'transactions.inline.repeat.yearly', recurrence: { interval: 'year', count: 1 } },
  {
    id: 'everyOtherYear',
    labelKey: 'transactions.inline.repeat.everyOtherYear',
    recurrence: { interval: 'year', count: 2 },
  },
];

export function recurrenceForInlineEntry(id: InlineEntryRecurrenceValue) {
  const known = inlineEntryRecurrenceOptions.find((option) => option.id === id)?.recurrence;
  if (known !== undefined) return known;

  const [prefix, interval, rawCount] = id.split(':');
  const count = Number(rawCount);
  if (
    prefix !== 'custom' ||
    !['day', 'week', 'month', 'year'].includes(interval) ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    return null;
  }

  return { interval: interval as InlineEntryRecurrenceInterval, count };
}

export function inlineEntryRecurrenceValue(interval: InlineEntryRecurrenceInterval, count: number) {
  const known = inlineEntryRecurrenceOptions.find(
    (option) => option.recurrence?.interval === interval && option.recurrence.count === count,
  );
  return known?.id ?? (`custom:${interval}:${count}` as const);
}

/** The ledger speaks CRDT/DBIT, the planner speaks inflow/outflow. */
export function plannedExpenseDirection(direction: 'CRDT' | 'DBIT') {
  return direction === 'DBIT' ? ('outflow' as const) : ('inflow' as const);
}

export type InlineEntryAccount = {
  provider: string;
  currency: string;
};

export type InlineEntryErrorCode =
  | 'account'
  | 'date'
  | 'dateLinkedAccount'
  | 'description'
  | 'amountMissing'
  | 'amountInvalid';

export type InlineEntryField = 'account' | 'bookingDate' | 'description' | 'amount';

export type InlineEntryValidation = {
  errors: Partial<Record<InlineEntryField, InlineEntryErrorCode>>;
  /** True once the date is past today: the backend writes the row as SCHD on its own. */
  scheduled: boolean;
  values: { direction: 'CRDT' | 'DBIT'; amountMinor: bigint } | null;
};

export function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function nextIsoDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * The calendar hands back a Date at local midnight. Reading it back through toISOString() would
 * shift it a day west of Greenwich, so the ISO string is built from the local fields.
 */
export function isoDateFromLocalDate(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function localDateFromIsoDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function emptyInlineEntryDraft(bookingDate: string, accountId = ''): InlineEntryDraft {
  return {
    accountId,
    bookingDate,
    counterpartyName: '',
    description: '',
    categoryId: null,
    note: '',
    outflow: '',
    inflow: '',
    recurrence: 'never',
  };
}

/**
 * Outflow and inflow are one field with two boxes: whichever the user is typing in wins and the
 * other is emptied, so the pair can only ever describe one direction.
 */
export function withAmountField(draft: InlineEntryDraft, field: 'outflow' | 'inflow', value: string): InlineEntryDraft {
  return field === 'outflow' ? { ...draft, outflow: value, inflow: '' } : { ...draft, inflow: value, outflow: '' };
}

/**
 * A linked account's balance belongs to the bank, so it only accepts entries dated in the future.
 * Offering an earlier date at all just walks the user into a rejected mutation.
 */
export function minimumBookingDate(account: InlineEntryAccount | null, today: string) {
  return account && account.provider !== 'manual' ? nextIsoDate(today) : undefined;
}

export function validateInlineEntry(
  draft: InlineEntryDraft,
  options: {
    today: string;
    account: InlineEntryAccount | null;
    requireFutureDateForLinkedAccount?: boolean;
  },
): InlineEntryValidation {
  const { account, today, requireFutureDateForLinkedAccount = true } = options;
  const errors: Partial<Record<InlineEntryField, InlineEntryErrorCode>> = {};
  const scheduled = Boolean(draft.bookingDate) && draft.bookingDate > today;

  if (!account) {
    errors.account = 'account';
  }

  if (!draft.bookingDate) {
    errors.bookingDate = 'date';
  } else if (requireFutureDateForLinkedAccount && account && account.provider !== 'manual' && !scheduled) {
    errors.bookingDate = 'dateLinkedAccount';
  }

  if (!draft.description.trim()) {
    errors.description = 'description';
  }

  const outflow = draft.outflow.trim();
  const inflow = draft.inflow.trim();
  const direction = outflow ? ('DBIT' as const) : ('CRDT' as const);
  const rawAmount = outflow || inflow;

  let amountMinor: bigint | null = null;
  if (!rawAmount) {
    errors.amount = 'amountMissing';
  } else if (!account) {
    // Without an account there is no currency, so the amount cannot be parsed yet.
  } else {
    try {
      const parsed = parseMoneyMinor(rawAmount, account.currency);
      if (parsed <= 0n) {
        errors.amount = 'amountInvalid';
      } else {
        amountMinor = parsed;
      }
    } catch {
      errors.amount = 'amountInvalid';
    }
  }

  return {
    errors,
    scheduled,
    values: Object.keys(errors).length === 0 && amountMinor !== null ? { direction, amountMinor } : null,
  };
}
