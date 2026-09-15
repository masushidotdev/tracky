import { describe, expect, test } from 'vitest';

import {
  emptyInlineEntryDraft,
  inlineEntryRecurrenceOptions,
  inlineEntryRecurrenceValue,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  minimumBookingDate,
  nextIsoDate,
  plannedExpenseDirection,
  recurrenceForInlineEntry,
  validateInlineEntry,
  withAmountField,
} from './inline-entry';
import type { InlineEntryDraft, InlineEntryRecurrenceId } from './inline-entry';

const manualAccount = { provider: 'manual', currency: 'EUR' };
const linkedAccount = { provider: 'enableBanking', currency: 'EUR' };
const today = '2026-07-31';

function draft(overrides: Partial<InlineEntryDraft> = {}): InlineEntryDraft {
  return {
    ...emptyInlineEntryDraft(today, 'account-1'),
    description: 'Groceries',
    outflow: '12.50',
    ...overrides,
  };
}

describe('withAmountField', () => {
  test('typing in one box empties the other so the pair names one direction', () => {
    const withOutflow = withAmountField(draft({ outflow: '', inflow: '80' }), 'outflow', '12');
    expect(withOutflow).toMatchObject({ outflow: '12', inflow: '' });

    const withInflow = withAmountField(withOutflow, 'inflow', '80');
    expect(withInflow).toMatchObject({ outflow: '', inflow: '80' });
  });
});

describe('validateInlineEntry amounts', () => {
  test('an outflow is a debit and an inflow is a credit', () => {
    expect(validateInlineEntry(draft({ outflow: '12.50', inflow: '' }), { today, account: manualAccount }).values)
      .toEqual({ direction: 'DBIT', amountMinor: 1250n });
    expect(validateInlineEntry(draft({ outflow: '', inflow: '12.50' }), { today, account: manualAccount }).values)
      .toEqual({ direction: 'CRDT', amountMinor: 1250n });
  });

  // The separator is read from the keystrokes, never from the interface language: the same bug was
  // fixed once in loan-form-utils and must not come back through a second number field.
  test('the last of , or . is the decimal separator whatever the interface language', () => {
    const cases: Array<[string, bigint]> = [
      ['3,50', 350n],
      ['3.50', 350n],
      ['1.234,56', 123_456n],
      ['1,234.56', 123_456n],
      ['1 234,56', 123_456n],
      ['12', 1200n],
    ];

    for (const [input, expected] of cases) {
      expect(validateInlineEntry(draft({ outflow: input }), { today, account: manualAccount }).values).toEqual({
        direction: 'DBIT',
        amountMinor: expected,
      });
    }
  });

  test('a missing, unparseable or zero amount is a field error', () => {
    expect(
      validateInlineEntry(draft({ outflow: '', inflow: '' }), { today, account: manualAccount }).errors.amount,
    ).toBe('amountMissing');
    expect(validateInlineEntry(draft({ outflow: 'abc' }), { today, account: manualAccount }).errors.amount).toBe(
      'amountInvalid',
    );
    expect(validateInlineEntry(draft({ outflow: '0' }), { today, account: manualAccount }).errors.amount).toBe(
      'amountInvalid',
    );
  });
});

describe('validateInlineEntry dates', () => {
  test('today or earlier stays booked, later is announced as scheduled', () => {
    expect(validateInlineEntry(draft({ bookingDate: today }), { today, account: manualAccount }).scheduled).toBe(false);
    expect(validateInlineEntry(draft({ bookingDate: '2026-07-30' }), { today, account: manualAccount }).scheduled).toBe(
      false,
    );
    expect(validateInlineEntry(draft({ bookingDate: '2026-08-01' }), { today, account: manualAccount }).scheduled).toBe(
      true,
    );
  });

  test('a linked account rejects anything not in the future before the mutation is called', () => {
    expect(validateInlineEntry(draft({ bookingDate: today }), { today, account: linkedAccount }).errors.bookingDate)
      .toBe('dateLinkedAccount');
    expect(
      validateInlineEntry(draft({ bookingDate: '2026-08-01' }), { today, account: linkedAccount }).errors.bookingDate,
    ).toBeUndefined();
  });

  test('editing a rule can keep today on a linked account', () => {
    expect(
      validateInlineEntry(draft({ bookingDate: today }), {
        today,
        account: linkedAccount,
        requireFutureDateForLinkedAccount: false,
      }).errors.bookingDate,
    ).toBeUndefined();
  });

  test('the date picker on a linked account starts at tomorrow', () => {
    expect(minimumBookingDate(linkedAccount, today)).toBe('2026-08-01');
    expect(minimumBookingDate(manualAccount, today)).toBeUndefined();
    expect(nextIsoDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('inline entry recurrence', () => {
  test('every option maps onto an interval the backend validator accepts', () => {
    const mapping = inlineEntryRecurrenceOptions.map((option) => [option.id, option.recurrence] as const);

    expect(mapping).toEqual([
      ['never', null],
      ['daily', { interval: 'day', count: 1 }],
      ['weekly', { interval: 'week', count: 1 }],
      ['everyOtherWeek', { interval: 'week', count: 2 }],
      ['everyFourWeeks', { interval: 'week', count: 4 }],
      ['monthly', { interval: 'month', count: 1 }],
      ['everyOtherMonth', { interval: 'month', count: 2 }],
      ['everyThreeMonths', { interval: 'month', count: 3 }],
      ['everyFourMonths', { interval: 'month', count: 4 }],
      ['twiceAYear', { interval: 'month', count: 6 }],
      ['yearly', { interval: 'year', count: 1 }],
      ['everyOtherYear', { interval: 'year', count: 2 }],
    ]);
  });

  test('only Never keeps the entry out of the planner, and a new draft starts there', () => {
    expect(recurrenceForInlineEntry('never')).toBeNull();
    expect(emptyInlineEntryDraft(today).recurrence).toBe('never');

    for (const option of inlineEntryRecurrenceOptions) {
      if (option.id === 'never') continue;
      expect(recurrenceForInlineEntry(option.id)).not.toBeNull();
    }
  });

  test('an uncommon stored interval round-trips without changing its count', () => {
    const value = inlineEntryRecurrenceValue('week', 5);
    expect(value).toBe('custom:week:5');
    expect(recurrenceForInlineEntry(value)).toEqual({ interval: 'week', count: 5 });
    expect(inlineEntryRecurrenceValue('month', 3)).toBe('everyThreeMonths');
  });

  test('an unknown id is treated as no recurrence rather than crashing the editor', () => {
    expect(recurrenceForInlineEntry('twiceAMonth' as InlineEntryRecurrenceId)).toBeNull();
  });

  test('a debit is planned as an outflow and a credit as an inflow', () => {
    expect(plannedExpenseDirection('DBIT')).toBe('outflow');
    expect(plannedExpenseDirection('CRDT')).toBe('inflow');
  });
});

describe('calendar dates', () => {
  test('a day picked in the calendar keeps its date whatever the timezone offset', () => {
    // A Date at local midnight read through toISOString() slips to the day before west of
    // Greenwich; the round trip must land back on the same day.
    expect(isoDateFromLocalDate(new Date(2026, 6, 31))).toBe('2026-07-31');
    expect(isoDateFromLocalDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(isoDateFromLocalDate(localDateFromIsoDate('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('validateInlineEntry required fields', () => {
  test('no values come back while anything is missing', () => {
    expect(validateInlineEntry(draft({ description: '  ' }), { today, account: manualAccount })).toMatchObject({
      errors: { description: 'description' },
      values: null,
    });
    expect(validateInlineEntry(draft(), { today, account: null })).toMatchObject({
      errors: { account: 'account' },
      values: null,
    });
    expect(validateInlineEntry(draft({ bookingDate: '' }), { today, account: manualAccount })).toMatchObject({
      errors: { bookingDate: 'date' },
      values: null,
    });
  });
});
