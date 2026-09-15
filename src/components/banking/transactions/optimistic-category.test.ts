import { describe, expect, test } from 'vitest';

import { optimisticallyAssignTransactionCategory } from './optimistic-category';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { TransactionRow } from './columns';

function transaction(overrides: Partial<Doc<'transactions'>> = {}): Doc<'transactions'> {
  return {
    _id: 'transaction_1' as Id<'transactions'>,
    _creationTime: 1,
    userId: 'user_1',
    accountId: 'account_1' as Id<'financialAccounts'>,
    providerConnectionId: 'connection_1' as Id<'providerConnections'>,
    provider: 'mock',
    dedupeKey: 'transaction_1',
    status: 'BOOK',
    direction: 'DBIT',
    amount: { amountMinor: 100n, currency: 'EUR' },
    bookingDate: '2026-07-31',
    description: 'Purchase',
    classificationKind: 'uncategorized',
    classificationSource: 'system',
    importedAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

const category = {
  _id: 'category_1' as Id<'categories'>,
  _creationTime: 1,
  userId: 'user_1',
  name: 'Groceries',
  kind: 'expense',
  budgetEligible: true,
  createdAtMs: 1,
  updatedAtMs: 1,
} satisfies Doc<'categories'>;

describe('optimisticallyAssignTransactionCategory', () => {
  test('updates the visible row immediately', () => {
    const row = transaction();
    const updated = optimisticallyAssignTransactionCategory(row, row._id, category._id, category, 2);

    expect(updated).toMatchObject({
      categoryId: category._id,
      classificationKind: 'expense',
      classificationSource: 'user',
      classificationConfidence: 1,
      updatedAtMs: 2,
    });
  });

  test('updates the outgoing side used by the category picker on a matched transfer', () => {
    const outgoing = transaction({ _id: 'outgoing' as Id<'transactions'>, classificationKind: 'expense' });
    const incoming = transaction({
      _id: 'incoming' as Id<'transactions'>,
      direction: 'CRDT',
      classificationKind: 'transfer',
    });
    const row: Omit<TransactionRow, 'account' | 'category'> = {
      ...incoming,
      transferPresentation: {
        kind: 'matched',
        sourceLabel: 'Checking',
        destinationLabel: 'Savings',
        neutralAmount: outgoing.amount,
        outgoing,
        incoming,
        sortDate: incoming.bookingDate,
        dateLabel: incoming.bookingDate,
      },
    };

    const updated = optimisticallyAssignTransactionCategory(row, outgoing._id, category._id, category, 2);
    expect(updated.transferPresentation?.outgoing).toMatchObject({
      categoryId: category._id,
      classificationKind: 'expense',
      updatedAtMs: 2,
    });
  });
});
