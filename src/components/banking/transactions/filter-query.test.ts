import { describe, expect, test } from 'vitest';

import { parseFilterQuery, serializeFilterQuery, suggestFor, toTransactionFilters } from './filter-query';
import type { FilterQueryContext } from './filter-query';
import type { Id } from '../../../../convex/_generated/dataModel';

const accountId = 'account_1' as Id<'financialAccounts'>;
const categoryId = 'category_1' as Id<'categories'>;
const context: FilterQueryContext = {
  accounts: [{ accountId, label: 'Reserve (4242)' }],
  categories: [{ categoryId, label: 'Groceries' }],
  payees: ['Rex Groceries', 'Salary Ltd'],
  locale: 'it-IT',
  currency: 'EUR',
  today: '2026-07-31',
  labels: {
    account: 'Conto',
    category: 'Categoria',
    payee: 'Beneficiario',
    classification: 'Classificazione',
    status: 'Stato',
    on: 'Il',
    before: 'Prima del',
    after: 'Dopo il',
    outflow: 'Uscita',
    inflow: 'Entrata',
    equals: 'uguale a',
    atLeast: 'maggiore o uguale a',
    atMost: 'minore o uguale a',
    findAny: 'Cerca “{value}” in qualsiasi campo',
    findPayee: 'Cerca “{value}” nei beneficiari',
    findCategory: 'Cerca “{value}” nelle categorie',
    findMemo: 'Cerca “{value}” nelle note',
  },
};

describe('parseFilterQuery', () => {
  test('parses completed comma-separated clauses and leaves the final token active', () => {
    expect(parseFilterQuery('Conto: Reserve (4242), Categoria: Groceries, rew', context)).toEqual({
      clauses: [
        { kind: 'account', accountId },
        { kind: 'category', categoryId },
      ],
      activeToken: 'rew',
    });
  });

  test('keeps a decimal comma inside the active monetary token', () => {
    expect(parseFilterQuery('12,50', context)).toEqual({ clauses: [], activeToken: '12,50' });
    const suggestion = suggestFor('12,50', context).find((item) => item.id === 'outflow:eq:1250');
    expect(suggestion?.clause).toEqual({ kind: 'outflow', op: 'eq', amountMinor: 1250n });
  });

  test('round-trips canonical serialized clauses', () => {
    const clauses = [
      { kind: 'account' as const, accountId },
      { kind: 'dateAfter' as const, date: '2026-07-01' },
      { kind: 'outflow' as const, op: 'gte' as const, amountMinor: 1234n },
      { kind: 'text' as const, field: 'memo' as const, value: 'holiday: Rome' },
    ];
    expect(parseFilterQuery(serializeFilterQuery(clauses), context).clauses).toEqual(clauses);
  });
});

describe('suggestFor', () => {
  test('orders entity, date, amount, any-field, and scoped suggestions', () => {
    const entity = suggestFor('Re', context);
    expect(entity.slice(0, 2).map((item) => item.label)).toEqual([
      'Conto: Reserve (4242)',
      'Beneficiario: Rex Groceries',
    ]);
    expect(entity.at(-4)?.clause).toEqual({ kind: 'text', field: 'any', value: 'Re' });

    const dates = suggestFor('26/07', context);
    expect(dates.slice(0, 3).map((item) => item.clause)).toEqual([
      { kind: 'dateOn', date: '2026-07-26' },
      { kind: 'dateBefore', date: '2026-07-26' },
      { kind: 'dateAfter', date: '2026-07-26' },
    ]);

    const amounts = suggestFor('1.234,50', context);
    expect(amounts.slice(0, 6).map((item) => item.clause)).toEqual([
      { kind: 'outflow', op: 'eq', amountMinor: 123450n },
      { kind: 'outflow', op: 'gte', amountMinor: 123450n },
      { kind: 'outflow', op: 'lte', amountMinor: 123450n },
      { kind: 'inflow', op: 'eq', amountMinor: 123450n },
      { kind: 'inflow', op: 'gte', amountMinor: 123450n },
      { kind: 'inflow', op: 'lte', amountMinor: 123450n },
    ]);
  });
});

describe('toTransactionFilters', () => {
  test('combines entity, date, amount, status, classification, and text clauses', () => {
    expect(
      toTransactionFilters([
        { kind: 'account', accountId },
        { kind: 'category', categoryId },
        { kind: 'classification', value: 'expense' },
        { kind: 'status', value: 'BOOK' },
        { kind: 'dateAfter', date: '2026-07-01' },
        { kind: 'dateBefore', date: '2026-07-31' },
        { kind: 'outflow', op: 'gte', amountMinor: 1000n },
        { kind: 'text', field: 'payee', value: 'Rex Groceries' },
      ]),
    ).toEqual({
      accountId,
      categoryId,
      classificationKind: 'expense',
      status: 'BOOK',
      fromDate: '2026-07-02',
      toDate: '2026-07-30',
      amountFilters: [{ direction: 'DBIT', op: 'gte', amountMinor: 1000n }],
      textFilters: [{ field: 'payee', value: 'Rex Groceries' }],
    });
  });
});

describe('partial dates in a month-first interface', () => {
  const ctx: FilterQueryContext = { ...context, locale: 'en-US' };

  // The interface language decides the field order, but a lone number is a day: read as a month,
  // "24" is invalid and the On/Before/After suggestions vanished entirely.
  test('reads a bare number as a day of the current month', () => {
    const suggestions = suggestFor('24', ctx);
    expect(suggestions.some((suggestion) => suggestion.clause.kind === 'dateOn')).toBe(true);
    expect(suggestions.find((suggestion) => suggestion.clause.kind === 'dateOn')?.clause).toMatchObject({
      date: '2026-07-24',
    });
  });

  test('reads a trailing separator the same way', () => {
    expect(suggestFor('26/', ctx).some((suggestion) => suggestion.clause.kind === 'dateOn')).toBe(true);
  });

  test('still honours an explicit month-first date', () => {
    expect(suggestFor('7/24/2026', ctx).find((s) => s.clause.kind === 'dateOn')?.clause).toMatchObject({
      date: '2026-07-24',
    });
  });
});
