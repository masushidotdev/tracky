import { ConvexError, v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { absoluteMinorUnits } from '../lib/money';
import { moneyAmountValidator } from '../lib/validators';
import { findFirstMatchingCategoryRule } from './categoryRuleCore';
import { reconcileImportedTransactionWithPlannedExpenses } from './planningReconciliation';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { classificationKindForCategory } from './categoryTaxonomy';
import { createTransferCandidateForTransaction } from './transferCandidates';
import { createConfirmedTransferMatch } from './transferCore';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

const manualClassificationKindValidator = v.union(
  v.literal('expense'),
  v.literal('income'),
  v.literal('transfer'),
  v.literal('internal'),
);
const MAX_TRANSACTION_NOTE_LENGTH = 500;

export function assertBookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError('Booking date must use YYYY-MM-DD format');
  }
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// A booking date the future has not reached is an intent, not a movement: the
// row is written as scheduled and stays out of every total until it comes due.
export function manualStatusForBookingDate(bookingDate: string, asOfDate = todayIsoDate()) {
  return bookingDate > asOfDate ? ('SCHD' as const) : ('BOOK' as const);
}

// The synthetic balance is ours to maintain only on manual accounts, and only
// for money that has actually moved. A linked account's balance is the bank's,
// and a scheduled row has not happened yet: neither may shift a snapshot.
export function manualBalanceApplies(account: Doc<'financialAccounts'>, status: Doc<'transactions'>['status']) {
  return account.provider === 'manual' && status === 'BOOK';
}

export async function getOwnedTransactionAccount(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  accountId: Id<'financialAccounts'>,
  status: Doc<'transactions'>['status'],
) {
  const account = await ctx.db.get('financialAccounts', accountId);
  if (!account || account.userId !== userId) {
    throw new ConvexError('Account not found');
  }

  if (account.provider !== 'manual' && status !== 'SCHD') {
    throw new ConvexError(
      'Only manual accounts accept manual transactions; a linked account only accepts scheduled ones',
    );
  }

  if (account.status !== 'active') {
    throw new ConvexError('Account is not active');
  }

  return account;
}

export async function getOwnedManualAccount(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  accountId: Id<'financialAccounts'>,
) {
  return await getOwnedTransactionAccount(ctx, userId, accountId, 'BOOK');
}

async function getOwnedManualTransaction(ctx: MutationCtx, userId: string, transactionId: Id<'transactions'>) {
  const transaction = await ctx.db.get('transactions', transactionId);
  if (!transaction || transaction.userId !== userId) {
    throw new ConvexError('Transaction not found');
  }

  if (transaction.provider !== 'manual') {
    throw new ConvexError('Only manual transactions can be modified');
  }

  return transaction;
}

// Signed effect of a transaction on its account balance.
export function balanceEffectMinor(direction: 'CRDT' | 'DBIT', amountMinor: bigint) {
  return direction === 'CRDT' ? amountMinor : -amountMinor;
}

// Manual accounts have no provider sync: their balance lives as synthetic
// closingBooked snapshots that these mutations keep in step with every write.
export async function applyManualBalanceDelta(ctx: MutationCtx, account: Doc<'financialAccounts'>, deltaMinor: bigint) {
  if (deltaMinor === 0n) {
    return;
  }

  const snapshots = await ctx.db
    .query('accountBalances')
    .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', account._id))
    .order('desc')
    .take(10);
  const latestMinor = snapshots[0]?.amount.amountMinor ?? 0n;
  const now = Date.now();

  if (!account.providerConnectionId) {
    throw new ConvexError('Manual account is missing its provider connection');
  }

  await ctx.db.insert('accountBalances', {
    userId: account.userId,
    accountId: account._id,
    providerConnectionId: account.providerConnectionId,
    provider: 'manual',
    balanceType: 'closingBooked',
    amount: {
      amountMinor: latestMinor + deltaMinor,
      currency: account.currency,
    },
    referenceDate: new Date(now).toISOString().slice(0, 10),
    fetchedAtMs: now,
  });
}

// Inserts a single leg of a manual movement: validates the target account and
// input, writes the transaction row, and keeps the account's synthetic balance
// in step. Callers own classification (category rule matching, transfer
// pairing, ...) and any post-insert side effects (reconciliation, transfer
// candidate detection, plan snapshot invalidation).
export async function insertManualTransactionLeg(
  ctx: MutationCtx,
  args: {
    userId: string;
    accountId: Id<'financialAccounts'>;
    direction: 'CRDT' | 'DBIT';
    amount: MoneyAmount;
    bookingDate: string;
    description: string;
    counterpartyName?: string;
    note?: string;
    categoryId?: Id<'categories'>;
    classificationKind: Doc<'transactions'>['classificationKind'];
    classificationSource: Doc<'transactions'>['classificationSource'];
    transactionPatch?: Record<string, unknown>;
    updateBalance?: boolean;
  },
) {
  assertBookingDate(args.bookingDate);
  const status = manualStatusForBookingDate(args.bookingDate);
  const account = await getOwnedTransactionAccount(ctx, args.userId, args.accountId, status);

  const description = args.description.trim();
  if (!description) {
    throw new ConvexError('Description is required');
  }
  const note = args.note?.trim() || undefined;
  if (note && note.length > MAX_TRANSACTION_NOTE_LENGTH) {
    throw new ConvexError('Transaction note must be at most 500 characters');
  }

  if (args.amount.amountMinor <= 0n) {
    throw new ConvexError('Amount must be greater than zero');
  }

  if (args.amount.currency !== account.currency) {
    throw new ConvexError('Amount currency must match the account currency');
  }

  const now = Date.now();
  const transactionId = await ctx.db.insert('transactions', {
    userId: args.userId,
    accountId: account._id,
    providerConnectionId: account.providerConnectionId!,
    provider: 'manual',
    dedupeKey: `manual|${crypto.randomUUID()}`,
    status,
    direction: args.direction,
    amount: args.amount,
    bookingDate: args.bookingDate,
    transactionDate: args.bookingDate,
    description,
    counterpartyName: args.counterpartyName?.trim() || undefined,
    classificationKind: args.classificationKind,
    classificationSource: args.classificationSource,
    classificationConfidence: 1,
    categoryId: args.categoryId,
    ...args.transactionPatch,
    note,
    importedAtMs: now,
    updatedAtMs: now,
  });

  if (args.updateBalance !== false && manualBalanceApplies(account, status)) {
    await applyManualBalanceDelta(ctx, account, balanceEffectMinor(args.direction, args.amount.amountMinor));
  }

  return { transactionId, account, status };
}

export async function resolveManualClassification(
  ctx: MutationCtx,
  args: {
    userId: string;
    direction: 'CRDT' | 'DBIT';
    categoryId?: Id<'categories'>;
    classificationKind?: 'expense' | 'income' | 'transfer' | 'internal';
  },
) {
  let category: Doc<'categories'> | null = null;
  if (args.categoryId) {
    category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== args.userId) {
      throw new ConvexError('Category not found');
    }
  }

  const fallbackKind = args.direction === 'DBIT' ? ('expense' as const) : ('income' as const);
  // The category kind wins over everything else so the category/classification
  // invariant holds; an explicit kind wins over the direction fallback.
  const classificationKind = category
    ? classificationKindForCategory(category, args.classificationKind ?? fallbackKind)
    : (args.classificationKind ?? fallbackKind);

  return { classificationKind, categoryId: category?._id };
}

export const createManualTransaction = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    direction: v.union(v.literal('CRDT'), v.literal('DBIT')),
    amount: moneyAmountValidator,
    bookingDate: v.string(),
    description: v.string(),
    counterpartyName: v.optional(v.string()),
    note: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
    classificationKind: v.optional(manualClassificationKindValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);

    const description = args.description.trim();
    const counterpartyName = args.counterpartyName?.trim() || undefined;
    const matchingRule =
      !args.categoryId && args.classificationKind === undefined && args.direction === 'DBIT'
        ? findFirstMatchingCategoryRule(
            await ctx.db
              .query('categoryRules')
              .withIndex('by_userId_and_priority', (q) => q.eq('userId', user.id))
              .take(200),
            { description, counterpartyName },
          )
        : null;
    const { classificationKind, categoryId } = await resolveManualClassification(ctx, {
      userId: user.id,
      direction: args.direction,
      categoryId: args.categoryId ?? matchingRule?.categoryId,
      classificationKind: args.classificationKind,
    });

    const { transactionId } = await insertManualTransactionLeg(ctx, {
      userId: user.id,
      accountId: args.accountId,
      direction: args.direction,
      amount: args.amount,
      bookingDate: args.bookingDate,
      description: args.description,
      counterpartyName: args.counterpartyName,
      note: args.note,
      categoryId,
      classificationKind,
      classificationSource: matchingRule ? 'rule' : 'user',
      transactionPatch: matchingRule?.transactionPatch,
    });

    await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId);
    await createTransferCandidateForTransaction(ctx, { userId: user.id, transactionId });
    await invalidatePlanSnapshots(ctx, user.id, [args.bookingDate]);

    return transactionId;
  },
});

export async function createCounterpartTransferCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    sourceTransactionId: Id<'transactions'>;
    accountId: Id<'financialAccounts'>;
    amount: MoneyAmount;
    bookingDate: string;
    description: string;
    counterpartyName?: string;
    categoryId?: Id<'categories'>;
  },
) {
  const source = await ctx.db.get('transactions', args.sourceTransactionId);
  if (!source || source.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  if (source.transferMatchId) {
    throw new ConvexError('This transaction is already matched as a transfer');
  }

  if (source.classificationKind === 'internal') {
    throw new ConvexError('Internal transactions cannot be matched as transfers');
  }

  if (args.accountId === source.accountId) {
    throw new ConvexError('Transfers require transactions from different accounts');
  }

  if (args.amount.currency !== source.amount.currency) {
    throw new ConvexError('Transfers across currencies are not supported yet');
  }

  let categoryId: Id<'categories'> | undefined;
  if (args.categoryId) {
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== args.userId || category.kind !== 'transfer') {
      throw new ConvexError('Only transfer categories can be used for the matching leg');
    }
    categoryId = category._id;
  }

  // The new leg always faces the opposite direction of the transaction it matches.
  const direction = source.direction === 'CRDT' ? 'DBIT' : 'CRDT';

  const { transactionId } = await insertManualTransactionLeg(ctx, {
    userId: args.userId,
    accountId: args.accountId,
    direction,
    amount: args.amount,
    bookingDate: args.bookingDate,
    description: args.description,
    counterpartyName: args.counterpartyName,
    categoryId,
    classificationKind: 'transfer',
    classificationSource: 'user',
  });

  const outgoingTransactionId = direction === 'DBIT' ? transactionId : source._id;
  const incomingTransactionId = direction === 'CRDT' ? transactionId : source._id;
  const feeAmountMinor = absoluteMinorUnits(args.amount.amountMinor - source.amount.amountMinor);

  // NOTE: intentionally bypasses createTransferCandidateForTransaction. That
  // hook would look for the closest opposite-direction transaction within
  // +/-7 days and could auto-confirm against an unrelated one before we get
  // a chance to match the leg we just created to `source` below.
  const transferMatchId = await createConfirmedTransferMatch(ctx, {
    userId: args.userId,
    outgoingTransactionId,
    incomingTransactionId,
    feeAmountMinor: feeAmountMinor === 0n ? undefined : feeAmountMinor,
    notes: 'Created as the matching leg from the transactions list.',
    source: 'user',
  });

  return { transactionId, transferMatchId };
}

export const createCounterpartTransfer = mutation({
  args: {
    sourceTransactionId: v.id('transactions'),
    accountId: v.id('financialAccounts'),
    amount: moneyAmountValidator,
    bookingDate: v.string(),
    description: v.string(),
    counterpartyName: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await createCounterpartTransferCore(ctx, { userId: user.id, ...args });
  },
});

export const updateManualTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
    direction: v.union(v.literal('CRDT'), v.literal('DBIT')),
    amount: moneyAmountValidator,
    bookingDate: v.string(),
    description: v.string(),
    counterpartyName: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await getOwnedManualTransaction(ctx, user.id, args.transactionId);

    if (transaction.transferMatchId) {
      throw new ConvexError('Unlink the transfer match before editing this transaction');
    }

    const account = await getOwnedTransactionAccount(ctx, user.id, transaction.accountId, transaction.status);
    const description = args.description.trim();
    if (!description) {
      throw new ConvexError('Description is required');
    }

    assertBookingDate(args.bookingDate);
    if (args.amount.amountMinor <= 0n) {
      throw new ConvexError('Amount must be greater than zero');
    }

    if (args.amount.currency !== account.currency) {
      throw new ConvexError('Amount currency must match the account currency');
    }

    const { classificationKind, categoryId } = await resolveManualClassification(ctx, {
      userId: user.id,
      direction: args.direction,
      categoryId: args.categoryId,
      classificationKind:
        transaction.classificationKind === 'internal' || transaction.classificationKind === 'transfer'
          ? transaction.classificationKind
          : undefined,
    });

    // A row on a linked account can only ever be scheduled; on a manual account
    // the edited date decides, exactly as it does on creation.
    const nextStatus = account.provider === 'manual' ? manualStatusForBookingDate(args.bookingDate) : 'SCHD';
    const previousEffect = manualBalanceApplies(account, transaction.status)
      ? balanceEffectMinor(transaction.direction, transaction.amount.amountMinor)
      : 0n;
    const nextEffect = manualBalanceApplies(account, nextStatus)
      ? balanceEffectMinor(args.direction, args.amount.amountMinor)
      : 0n;

    await ctx.db.patch('transactions', transaction._id, {
      status: nextStatus,
      direction: args.direction,
      amount: args.amount,
      bookingDate: args.bookingDate,
      transactionDate: args.bookingDate,
      description,
      counterpartyName: args.counterpartyName?.trim() || undefined,
      classificationKind,
      classificationSource: 'user',
      classificationConfidence: 1,
      categoryId,
      updatedAtMs: Date.now(),
    });

    await applyManualBalanceDelta(ctx, account, nextEffect - previousEffect);
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate, args.bookingDate]);

    return transaction._id;
  },
});

export async function assertManualTransactionDeletable(
  ctx: MutationCtx,
  transaction: Doc<'transactions'>,
): Promise<Array<Id<'transferMatches'>>> {
  const [outgoingMatches, incomingMatches] = await Promise.all([
    ctx.db
      .query('transferMatches')
      .withIndex('by_outgoingTransactionId', (q) => q.eq('outgoingTransactionId', transaction._id))
      .take(20),
    ctx.db
      .query('transferMatches')
      .withIndex('by_incomingTransactionId', (q) => q.eq('incomingTransactionId', transaction._id))
      .take(20),
  ]);
  const matches = [...outgoingMatches, ...incomingMatches];
  if (matches.some((match) => match.status === 'confirmed') || transaction.transferMatchId) {
    throw new ConvexError('Unlink the transfer match before deleting this transaction');
  }

  const occurrencePayment = await ctx.db
    .query('plannedExpenseOccurrencePayments')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .first();
  if (occurrencePayment) {
    throw new ConvexError('This transaction is linked to a planned expense payment');
  }

  const installmentPayment = await ctx.db
    .query('creditFacilityInstallmentPayments')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .first();
  if (installmentPayment) {
    throw new ConvexError('This transaction is linked to an installment payment');
  }

  const usageCycle = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .first();
  if (usageCycle) {
    throw new ConvexError('This transaction is linked to a card statement cycle');
  }

  const installmentPlan = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_linkedTransactionId', (q) => q.eq('linkedTransactionId', transaction._id))
    .first();
  if (installmentPlan) {
    throw new ConvexError('This transaction is linked to an installment plan');
  }

  const moneyBoxContribution = await ctx.db
    .query('moneyBoxContributions')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .first();
  if (moneyBoxContribution) {
    throw new ConvexError('This transaction is linked to a money box contribution');
  }

  const plannedExpenses = await Promise.all(
    (['expense', 'income'] as const).map((kind) =>
      ctx.db
        .query('plannedTransactions')
        .withIndex('by_userId_and_kind_and_latestTransactionId', (q) =>
          q.eq('userId', transaction.userId).eq('kind', kind).eq('latestTransactionId', transaction._id),
        )
        .unique(),
    ),
  );
  const plannedExpense = plannedExpenses.find((expense) => expense !== null);
  if (plannedExpense) {
    throw new ConvexError('This transaction is linked to a planned expense');
  }

  if (transaction.subscriptionId) {
    throw new ConvexError('This transaction is linked to a subscription');
  }

  // Unconfirmed candidate/rejected matches are bookkeeping only: cascade them.
  return [...new Set(matches.map((match) => match._id))];
}

export const deleteManualTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await getOwnedManualTransaction(ctx, user.id, args.transactionId);
    const account = await getOwnedTransactionAccount(ctx, user.id, transaction.accountId, transaction.status);
    const staleMatchIds = await assertManualTransactionDeletable(ctx, transaction);

    for (const matchId of staleMatchIds) {
      await ctx.db.delete('transferMatches', matchId);
    }

    await ctx.db.delete('transactions', transaction._id);
    // Only reverse what was actually applied: a scheduled row never moved the balance.
    if (manualBalanceApplies(account, transaction.status)) {
      await applyManualBalanceDelta(
        ctx,
        account,
        -balanceEffectMinor(transaction.direction, transaction.amount.amountMinor),
      );
    }
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);

    return transaction._id;
  },
});
