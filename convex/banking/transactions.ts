import { stream } from 'convex-helpers/server/stream';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from '../_generated/server';
import schema from '../schema';
import { requireAuthUser } from '../auth';
import { absoluteMinorUnits } from '../lib/money';
import {
  classificationKindValidator,
  classificationSourceValidator,
  transactionDirectionValidator,
  transactionStatusValidator,
} from '../lib/validators';
import { findMatchingSubscription, merchantKeyForTransaction } from './subscriptionDetection';
import { categoryKindForClassification, categorySupportsKind, classificationKindForCategory } from './categoryTaxonomy';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const transactionSortFieldValidator = v.union(v.literal('bookingDate'), v.literal('amount'));
const transactionPageSortFieldValidator = v.union(
  v.literal('bookingDate'),
  v.literal('payee'),
  v.literal('description'),
  v.literal('category'),
  v.literal('classification'),
  v.literal('account'),
  v.literal('note'),
  v.literal('amount'),
);
const sortDirectionValidator = v.union(v.literal('asc'), v.literal('desc'));
const amountComparisonValidator = v.union(v.literal('eq'), v.literal('gte'), v.literal('lte'));
const transactionTextFieldValidator = v.union(
  v.literal('any'),
  v.literal('payee'),
  v.literal('category'),
  v.literal('memo'),
);
const listTransactionsPageFiltersValidator = v.object({
  accountId: v.optional(v.id('financialAccounts')),
  categoryId: v.optional(v.id('categories')),
  classificationKind: v.optional(classificationKindValidator),
  status: v.optional(transactionStatusValidator),
  fromDate: v.optional(v.string()),
  toDate: v.optional(v.string()),
  amountFilters: v.optional(
    v.array(
      v.object({
        direction: transactionDirectionValidator,
        op: amountComparisonValidator,
        amountMinor: v.int64(),
      }),
    ),
  ),
  textFilters: v.optional(
    v.array(
      v.object({
        field: transactionTextFieldValidator,
        value: v.string(),
      }),
    ),
  ),
});
const listTransactionsArgsValidator = {
  paginationOpts: paginationOptsValidator,
  accountId: v.optional(v.id('financialAccounts')),
  classificationKind: v.optional(classificationKindValidator),
  direction: v.optional(transactionDirectionValidator),
  status: v.optional(transactionStatusValidator),
  categoryId: v.optional(v.id('categories')),
  fromDate: v.optional(v.string()),
  toDate: v.optional(v.string()),
  search: v.optional(v.string()),
  sortField: v.optional(transactionSortFieldValidator),
  sortDirection: v.optional(sortDirectionValidator),
};

type ListTransactionsArgs = {
  paginationOpts: PaginationOptions;
  accountId?: Id<'financialAccounts'>;
  classificationKind?: Doc<'transactions'>['classificationKind'];
  direction?: Doc<'transactions'>['direction'];
  status?: Doc<'transactions'>['status'];
  categoryId?: Id<'categories'>;
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortField?: 'bookingDate' | 'amount';
  sortDirection?: 'asc' | 'desc';
};

export type TransactionPageSortField =
  | 'bookingDate'
  | 'payee'
  | 'description'
  | 'category'
  | 'classification'
  | 'account'
  | 'note'
  | 'amount';

type TransactionPageFilters = {
  accountId?: Id<'financialAccounts'>;
  categoryId?: Id<'categories'>;
  classificationKind?: Doc<'transactions'>['classificationKind'];
  status?: Doc<'transactions'>['status'];
  fromDate?: string;
  toDate?: string;
  amountFilters?: Array<{
    direction: Doc<'transactions'>['direction'];
    op: 'eq' | 'gte' | 'lte';
    amountMinor: bigint;
  }>;
  textFilters?: Array<{
    field: 'any' | 'payee' | 'category' | 'memo';
    value: string;
  }>;
};

type ListTransactionsOffsetPageArgs = {
  filters: TransactionPageFilters;
  sort: {
    field: TransactionPageSortField;
    direction: 'asc' | 'desc';
  };
  limit: number;
  offset: number;
};

type TransactionSortLookups = {
  accountsById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>;
  categoriesById: Map<Id<'categories'>, Doc<'categories'>>;
};

type TransactionCreditInstallmentAllocation = {
  paymentCount: number;
  amount: {
    amountMinor: bigint;
    currency: string;
  };
  facilityNames: Array<string>;
  planNames: Array<string>;
};

type TransferPresentation = {
  kind: 'matched' | 'unmatched';
  matchId?: Id<'transferMatches'>;
  moneyBoxId?: Id<'moneyBoxes'>;
  moneyBoxName?: string;
  sourceLabel: string | null;
  destinationLabel: string | null;
  neutralAmount: {
    amountMinor: bigint;
    currency: string;
  };
  amountDelta?: {
    amountMinor: bigint;
    currency: string;
  };
  feeAmount?: {
    amountMinor: bigint;
    currency: string;
  };
  outgoing?: Doc<'transactions'>;
  incoming?: Doc<'transactions'>;
  sortDate: string;
  dateLabel: string;
};

type TransactionWithListPresentation = Doc<'transactions'> & {
  creditInstallmentAllocation?: TransactionCreditInstallmentAllocation;
  transferPresentation?: TransferPresentation;
};

type TransactionPage = PaginationResult<TransactionWithListPresentation>;
type RawTransactionPage = PaginationResult<Doc<'transactions'>>;

type TransferReviewCandidate = {
  transferMatchId?: Id<'transferMatches'>;
  outgoing: Doc<'transactions'>;
  incoming: Doc<'transactions'>;
  amountDelta: {
    amountMinor: bigint;
    currency: string;
  };
  confidence: number;
};

export function buildUserClassificationPatch(input: {
  classificationKind: Doc<'transactions'>['classificationKind'];
  categoryId?: Id<'categories'>;
  confidence?: number;
  updatedAtMs: number;
}) {
  return {
    classificationKind: input.classificationKind,
    classificationSource: 'user' as const,
    classificationConfidence: input.confidence ?? 1,
    categoryId: input.categoryId,
    updatedAtMs: input.updatedAtMs,
  };
}

async function setClassificationForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    transactionId: Id<'transactions'>;
    classificationKind: Doc<'transactions'>['classificationKind'];
    categoryId?: Id<'categories'>;
    confidence?: number;
  },
) {
  const transaction = await ctx.db.get('transactions', args.transactionId);

  if (!transaction || transaction.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  let categoryId = args.categoryId;
  if (categoryId) {
    const category = await ctx.db.get('categories', categoryId);
    if (!category || category.userId !== args.userId) {
      throw new ConvexError('Category not found');
    }

    // The UI carries the previous categoryId along; drop it when its kind no
    // longer matches the new classification (e.g. groceries on a transfer).
    const requestedCategoryKind = categoryKindForClassification(args.classificationKind);
    if (!requestedCategoryKind || !categorySupportsKind(category, requestedCategoryKind)) {
      categoryId = undefined;
    }
  }

  await ctx.db.patch(
    'transactions',
    transaction._id,
    buildUserClassificationPatch({
      classificationKind: args.classificationKind,
      categoryId,
      confidence: args.confidence,
      updatedAtMs: Date.now(),
    }),
  );
  await invalidatePlanSnapshots(ctx, args.userId, [transaction.bookingDate]);

  return transaction._id;
}

function normalizedSearch(value: string) {
  return value.trim().toLowerCase();
}

function transactionMatchesText(transaction: Doc<'transactions'>, search: string) {
  if (search.length === 0) {
    return true;
  }

  const haystack = [
    transaction.description,
    transaction.counterpartyName ?? '',
    transaction.referenceNumber ?? '',
    transaction.providerEntryReference ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search);
}

function transactionMatchesFilters(
  transaction: Doc<'transactions'>,
  args: {
    accountId?: Id<'financialAccounts'>;
    classificationKind?: Doc<'transactions'>['classificationKind'];
    direction?: Doc<'transactions'>['direction'];
    status?: Doc<'transactions'>['status'];
    categoryId?: Id<'categories'>;
    fromDate?: string;
    toDate?: string;
    search?: string;
  },
) {
  if (args.accountId && transaction.accountId !== args.accountId) {
    return false;
  }

  if (args.classificationKind && transaction.classificationKind !== args.classificationKind) {
    return false;
  }

  if (args.direction && transaction.direction !== args.direction) {
    return false;
  }

  if (args.status && transaction.status !== args.status) {
    return false;
  }

  if (args.categoryId && transaction.categoryId !== args.categoryId) {
    return false;
  }

  if (args.fromDate && transaction.bookingDate < args.fromDate) {
    return false;
  }

  if (args.toDate && transaction.bookingDate > args.toDate) {
    return false;
  }

  return transactionMatchesText(transaction, normalizedSearch(args.search ?? ''));
}

function accountDisplayLabel(account: Doc<'financialAccounts'> | null) {
  if (!account) {
    return null;
  }

  const trimmedAlias = account.alias?.trim();
  if (trimmedAlias) {
    return trimmedAlias;
  }

  return account.name;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function periodEndDate(period: string) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

async function accountLabelForTransaction(ctx: QueryCtx, userId: string, transaction: Doc<'transactions'> | null) {
  if (!transaction) {
    return null;
  }

  const account = await ctx.db.get('financialAccounts', transaction.accountId);
  if (!account || account.userId !== userId) {
    return null;
  }

  return accountDisplayLabel(account);
}

function compareTransactionsForList(
  left: Doc<'transactions'>,
  right: Doc<'transactions'>,
  sortField: 'bookingDate' | 'amount',
  sortDirection: 'asc' | 'desc',
) {
  const directionMultiplier = sortDirection === 'asc' ? 1 : -1;
  let primaryComparison = 0;

  if (sortField === 'amount') {
    primaryComparison =
      left.amount.amountMinor < right.amount.amountMinor
        ? -1
        : left.amount.amountMinor > right.amount.amountMinor
          ? 1
          : 0;
  } else {
    primaryComparison = left.bookingDate.localeCompare(right.bookingDate);
  }

  if (primaryComparison !== 0) {
    return primaryComparison * directionMultiplier;
  }

  const creationComparison = left._creationTime - right._creationTime;
  if (creationComparison !== 0) {
    return creationComparison * directionMultiplier;
  }

  return left._id.localeCompare(right._id) * directionMultiplier;
}

function minMoneyAmount(
  left: Doc<'transactions'>['amount'],
  right: Doc<'transactions'>['amount'],
): Doc<'transactions'>['amount'] {
  return {
    amountMinor: left.amountMinor <= right.amountMinor ? left.amountMinor : right.amountMinor,
    currency: left.currency,
  };
}

function transferDateLabel(outgoing: Doc<'transactions'> | null, incoming: Doc<'transactions'> | null) {
  const dates = [outgoing?.bookingDate, incoming?.bookingDate].filter((date): date is string => Boolean(date));
  const uniqueDates = [...new Set(dates)].sort((left, right) => left.localeCompare(right));

  if (uniqueDates.length === 0) {
    return '';
  }

  if (uniqueDates.length === 1) {
    return uniqueDates[0];
  }

  return `${uniqueDates[0]} - ${uniqueDates[uniqueDates.length - 1]}`;
}

function transferSortDate(
  representative: Doc<'transactions'>,
  outgoing: Doc<'transactions'> | null,
  incoming: Doc<'transactions'> | null,
  sortDirection: 'asc' | 'desc',
) {
  const dates = [outgoing?.bookingDate, incoming?.bookingDate].filter((date): date is string => Boolean(date));
  if (dates.length === 0) {
    return representative.bookingDate;
  }

  return [...dates].sort((left, right) =>
    sortDirection === 'asc' ? left.localeCompare(right) : right.localeCompare(left),
  )[0];
}

async function validateTransactionListFilters(ctx: QueryCtx, userId: string, args: ListTransactionsArgs) {
  if (args.accountId) {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== userId) {
      throw new ConvexError('Account not found');
    }
  }

  if (args.categoryId) {
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== userId) {
      throw new ConvexError('Category not found');
    }
  }
}

async function validateTransactionPageFilters(ctx: QueryCtx, userId: string, filters: TransactionPageFilters) {
  await validateTransactionListFilters(ctx, userId, {
    paginationOpts: { numItems: 1, cursor: null },
    accountId: filters.accountId,
    categoryId: filters.categoryId,
  });
}

function transactionCategory(
  transaction: TransactionWithListPresentation,
  categoriesById: TransactionSortLookups['categoriesById'],
) {
  const target = transaction.transferPresentation?.outgoing ?? transaction;
  return target.categoryId ? (categoriesById.get(target.categoryId) ?? null) : null;
}

function transactionAccount(
  transaction: TransactionWithListPresentation,
  accountsById: TransactionSortLookups['accountsById'],
) {
  return accountsById.get(transaction.accountId) ?? null;
}

function signedTransactionAmountMinor(transaction: Doc<'transactions'>) {
  const magnitude = absoluteMinorUnits(transaction.amount.amountMinor);
  return transaction.direction === 'CRDT' ? magnitude : -magnitude;
}

function compareBigInts(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// A transfer's payee cell reads "Transfer: <account>", not the bank's counterparty name - which on a
// self-transfer is the account holder, so sorting by that name scattered the transfers among the
// payees starting with it. Sorting them behind a shared prefix keeps them together on screen, the
// way their common label already does.
const TRANSFER_SORT_PREFIX = '\uFFFF';

function payeeSortKey(transaction: TransactionWithListPresentation) {
  if (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal') {
    return `${TRANSFER_SORT_PREFIX}${transaction.counterpartyName?.trim() ?? ''}`;
  }
  return transaction.counterpartyName?.trim() || null;
}

function compareNullableText(left: string | null, right: string | null, direction: 'asc' | 'desc') {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) * (direction === 'asc' ? 1 : -1);
}

function pageSortDate(
  transaction: TransactionWithListPresentation,
  transferSortDates: Map<Id<'transferMatches'>, string>,
) {
  const matchId = transaction.transferMatchId;
  return (matchId && transferSortDates.get(matchId)) || transaction.bookingDate;
}

function compareTransactionsForOffsetPage(
  left: TransactionWithListPresentation,
  right: TransactionWithListPresentation,
  sort: ListTransactionsOffsetPageArgs['sort'],
  lookups: TransactionSortLookups,
  transferSortDates: Map<Id<'transferMatches'>, string>,
) {
  const directionMultiplier = sort.direction === 'asc' ? 1 : -1;
  let comparison = 0;

  switch (sort.field) {
    case 'amount':
      comparison = compareBigInts(signedTransactionAmountMinor(left), signedTransactionAmountMinor(right));
      comparison *= directionMultiplier;
      break;
    case 'account':
      comparison = compareNullableText(
        accountDisplayLabel(transactionAccount(left, lookups.accountsById)),
        accountDisplayLabel(transactionAccount(right, lookups.accountsById)),
        sort.direction,
      );
      break;
    case 'category':
      comparison = compareNullableText(
        transactionCategory(left, lookups.categoriesById)?.name ?? null,
        transactionCategory(right, lookups.categoriesById)?.name ?? null,
        sort.direction,
      );
      break;
    case 'classification':
      comparison = left.classificationKind.localeCompare(right.classificationKind) * directionMultiplier;
      break;
    case 'description':
      comparison = compareNullableText(left.description || null, right.description || null, sort.direction);
      break;
    case 'note':
      comparison = compareNullableText(left.note?.trim() || null, right.note?.trim() || null, sort.direction);
      break;
    case 'payee':
      comparison = compareNullableText(payeeSortKey(left), payeeSortKey(right), sort.direction);
      break;
    case 'bookingDate':
      comparison =
        pageSortDate(left, transferSortDates).localeCompare(pageSortDate(right, transferSortDates)) *
        directionMultiplier;
      break;
  }

  return comparison || left._id.localeCompare(right._id);
}

function matchesAmountFilter(
  transaction: Doc<'transactions'>,
  filter: NonNullable<TransactionPageFilters['amountFilters']>[number],
) {
  if (transaction.direction !== filter.direction) return false;
  const amountMinor = absoluteMinorUnits(transaction.amount.amountMinor);
  const target = absoluteMinorUnits(filter.amountMinor);
  if (filter.op === 'eq') return amountMinor === target;
  if (filter.op === 'gte') return amountMinor >= target;
  return amountMinor <= target;
}

function transactionMatchesPageFilters(
  transaction: Doc<'transactions'>,
  filters: TransactionPageFilters,
  categoriesById: TransactionSortLookups['categoriesById'],
) {
  if (filters.accountId && transaction.accountId !== filters.accountId) return false;
  if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
  if (filters.classificationKind && transaction.classificationKind !== filters.classificationKind) return false;
  if (filters.status && transaction.status !== filters.status) return false;
  if (filters.fromDate && transaction.bookingDate < filters.fromDate) return false;
  if (filters.toDate && transaction.bookingDate > filters.toDate) return false;
  if (filters.amountFilters?.some((filter) => !matchesAmountFilter(transaction, filter))) return false;

  const categoryName = transaction.categoryId ? (categoriesById.get(transaction.categoryId)?.name ?? '') : '';
  return (filters.textFilters ?? []).every((filter) => {
    const needle = normalizedSearch(filter.value);
    if (!needle) return true;
    const payee = transaction.counterpartyName ?? '';
    const memo = transaction.note ?? '';
    if (filter.field === 'payee') return normalizedSearch(payee).includes(needle);
    if (filter.field === 'category') return normalizedSearch(categoryName).includes(needle);
    if (filter.field === 'memo') return normalizedSearch(memo).includes(needle);
    return normalizedSearch([transaction.description, payee, categoryName, memo].join(' ')).includes(needle);
  });
}

async function loadTransactionSortLookups(ctx: QueryCtx, userId: string): Promise<TransactionSortLookups> {
  const [accounts, categories] = await Promise.all([
    ctx.db.query('financialAccounts').withIndex('by_userId', (q) => q.eq('userId', userId)).take(500),
    ctx.db.query('categories').withIndex('by_userId', (q) => q.eq('userId', userId)).take(500),
  ]);
  return {
    accountsById: new Map(accounts.map((account) => [account._id, account])),
    categoriesById: new Map(categories.map((category) => [category._id, category])),
  };
}

export const MAX_TRANSACTION_SCAN = 5000;

async function scanRecentTransactionsForUser(
  ctx: QueryCtx,
  userId: string,
  filters: TransactionPageFilters,
): Promise<{ transactions: Array<Doc<'transactions'>>; scanCapped: boolean }> {
  const { fromDate, toDate } = filters;
  const transactionQuery = filters.accountId
    ? ctx.db
        .query('transactions')
        .withIndex('by_userId_and_accountId_and_bookingDate', (q) => {
          const base = q.eq('userId', userId).eq('accountId', filters.accountId!);
          if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
          if (fromDate) return base.gte('bookingDate', fromDate);
          if (toDate) return base.lte('bookingDate', toDate);
          return base;
        })
        .order('desc')
    : filters.categoryId
      ? ctx.db
          .query('transactions')
          .withIndex('by_userId_and_categoryId_and_bookingDate', (q) => {
            const base = q.eq('userId', userId).eq('categoryId', filters.categoryId);
            if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
            if (fromDate) return base.gte('bookingDate', fromDate);
            if (toDate) return base.lte('bookingDate', toDate);
            return base;
          })
          .order('desc')
      : ctx.db
          .query('transactions')
          .withIndex('by_userId_and_bookingDate', (q) => {
            const base = q.eq('userId', userId);
            if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
            if (fromDate) return base.gte('bookingDate', fromDate);
            if (toDate) return base.lte('bookingDate', toDate);
            return base;
          })
          .order('desc');
  const scanned = await transactionQuery.take(MAX_TRANSACTION_SCAN + 1);
  return {
    transactions: scanned.slice(0, MAX_TRANSACTION_SCAN),
    scanCapped: scanned.length > MAX_TRANSACTION_SCAN,
  };
}

// Cap on index rows scanned per page so highly selective residual filters
// (e.g. search) cannot blow past Convex read limits; when hit, the stream
// paginator returns a partial page with pageStatus 'SplitRequired' and
// usePaginatedQuery transparently splits the page on the client.
const MAX_ROWS_SCANNED_PER_PAGE = 400;

function streamRawTransactionsForUser(
  ctx: QueryCtx,
  userId: string,
  args: ListTransactionsArgs,
  queryOrder: 'asc' | 'desc',
) {
  const streamDb = stream(ctx.db, schema);
  const { fromDate, toDate } = args;

  // Every index below ends with bookingDate, so the date filters always ride
  // along in the index range instead of being applied post-query.
  if (args.accountId) {
    const accountId = args.accountId;
    return streamDb
      .query('transactions')
      .withIndex('by_userId_and_accountId_and_bookingDate', (q) => {
        const base = q.eq('userId', userId).eq('accountId', accountId);
        if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
        if (fromDate) return base.gte('bookingDate', fromDate);
        if (toDate) return base.lte('bookingDate', toDate);
        return base;
      })
      .order(queryOrder);
  } else if (args.classificationKind) {
    const classificationKind = args.classificationKind;
    return streamDb
      .query('transactions')
      .withIndex('by_userId_and_classificationKind_and_bookingDate', (q) => {
        const base = q.eq('userId', userId).eq('classificationKind', classificationKind);
        if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
        if (fromDate) return base.gte('bookingDate', fromDate);
        if (toDate) return base.lte('bookingDate', toDate);
        return base;
      })
      .order(queryOrder);
  } else if (args.direction) {
    const direction = args.direction;
    return streamDb
      .query('transactions')
      .withIndex('by_userId_and_direction_and_bookingDate', (q) => {
        const base = q.eq('userId', userId).eq('direction', direction);
        if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
        if (fromDate) return base.gte('bookingDate', fromDate);
        if (toDate) return base.lte('bookingDate', toDate);
        return base;
      })
      .order(queryOrder);
  } else if (args.status) {
    const status = args.status;
    return streamDb
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) => {
        const base = q.eq('userId', userId).eq('status', status);
        if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
        if (fromDate) return base.gte('bookingDate', fromDate);
        if (toDate) return base.lte('bookingDate', toDate);
        return base;
      })
      .order(queryOrder);
  } else if (args.categoryId) {
    const categoryId = args.categoryId;
    return streamDb
      .query('transactions')
      .withIndex('by_userId_and_categoryId_and_bookingDate', (q) => {
        const base = q.eq('userId', userId).eq('categoryId', categoryId);
        if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
        if (fromDate) return base.gte('bookingDate', fromDate);
        if (toDate) return base.lte('bookingDate', toDate);
        return base;
      })
      .order(queryOrder);
  }

  return streamDb
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) => {
      const base = q.eq('userId', userId);
      if (fromDate && toDate) return base.gte('bookingDate', fromDate).lte('bookingDate', toDate);
      if (fromDate) return base.gte('bookingDate', fromDate);
      if (toDate) return base.lte('bookingDate', toDate);
      return base;
    })
    .order(queryOrder);
}

// Single logical pagination over an index stream: residual filters (search,
// filter combinations beyond the chosen index) are applied inside the stream
// so pages come back filled without ever calling .paginate() more than once —
// Convex only supports one paginated query per function.
async function paginateRawTransactionsForUser(
  ctx: QueryCtx,
  userId: string,
  args: ListTransactionsArgs,
  queryOrder: 'asc' | 'desc',
  paginationOpts: PaginationOptions,
): Promise<RawTransactionPage> {
  return await streamRawTransactionsForUser(ctx, userId, args, queryOrder)
    .filterWith((transaction) => Promise.resolve(transactionMatchesFilters(transaction, args)))
    .paginate({
      ...paginationOpts,
      maximumRowsRead: paginationOpts.maximumRowsRead ?? MAX_ROWS_SCANNED_PER_PAGE,
    });
}

async function addTransferPresentation(
  ctx: QueryCtx,
  userId: string,
  transaction: Doc<'transactions'>,
  args: ListTransactionsArgs,
  sortField: 'bookingDate' | 'amount',
  sortDirection: 'asc' | 'desc',
  visibleTransactionIds?: Set<Id<'transactions'>>,
): Promise<(Doc<'transactions'> & { transferPresentation?: TransferPresentation }) | null> {
  if (transaction.transferMatchId) {
    const match = await ctx.db.get('transferMatches', transaction.transferMatchId);
    if (match && match.userId === userId && match.status === 'confirmed') {
      const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', match.incomingTransactionId);
      const validOutgoing = outgoing && outgoing.userId === userId ? outgoing : null;
      const validIncoming = incoming && incoming.userId === userId ? incoming : null;
      const matchingSides = [validOutgoing, validIncoming].filter(
        (side): side is Doc<'transactions'> =>
          side !== null &&
          transactionMatchesFilters(side, args) &&
          (!visibleTransactionIds || visibleTransactionIds.has(side._id)),
      );

      if (matchingSides.length > 0) {
        const canonicalSide = [...matchingSides].sort((left, right) =>
          compareTransactionsForList(left, right, sortField, sortDirection),
        )[0];
        if (transaction._id !== canonicalSide._id) {
          return null;
        }
      }

      const neutralAmount =
        validOutgoing && validIncoming
          ? minMoneyAmount(validOutgoing.amount, validIncoming.amount)
          : transaction.amount;
      const sourceLabel = await accountLabelForTransaction(ctx, userId, validOutgoing);
      const destinationLabel = await accountLabelForTransaction(ctx, userId, validIncoming);

      return {
        ...transaction,
        transferPresentation: {
          kind: 'matched',
          matchId: match._id,
          sourceLabel,
          destinationLabel,
          neutralAmount,
          amountDelta: match.amountDelta,
          ...(match.feeAmount ? { feeAmount: match.feeAmount } : {}),
          ...(validOutgoing ? { outgoing: validOutgoing } : {}),
          ...(validIncoming ? { incoming: validIncoming } : {}),
          sortDate: transferSortDate(transaction, validOutgoing, validIncoming, sortDirection),
          dateLabel: transferDateLabel(validOutgoing, validIncoming),
        },
      };
    }
  }

  if (transaction.classificationKind !== 'transfer') {
    return transaction;
  }

  const accountLabel = await accountLabelForTransaction(ctx, userId, transaction);
  const linkedContributions = await ctx.db
    .query('moneyBoxContributions')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .take(1);
  const linkedContribution = linkedContributions.at(0);
  const linkedMoneyBox = linkedContribution ? await ctx.db.get('moneyBoxes', linkedContribution.moneyBoxId) : null;
  const validMoneyBox = linkedMoneyBox && linkedMoneyBox.userId === userId ? linkedMoneyBox : null;
  return {
    ...transaction,
    transferPresentation: {
      kind: 'unmatched',
      sourceLabel: transaction.direction === 'DBIT' ? accountLabel : (validMoneyBox?.name ?? null),
      destinationLabel: transaction.direction === 'CRDT' ? accountLabel : (validMoneyBox?.name ?? null),
      ...(validMoneyBox ? { moneyBoxId: validMoneyBox._id, moneyBoxName: validMoneyBox.name } : {}),
      neutralAmount: transaction.amount,
      ...(transaction.direction === 'DBIT' ? { outgoing: transaction } : { incoming: transaction }),
      sortDate: transaction.bookingDate,
      dateLabel: transaction.bookingDate,
    },
  };
}

async function addCreditInstallmentAllocation(
  ctx: QueryCtx,
  userId: string,
  transaction: Doc<'transactions'> & { transferPresentation?: TransferPresentation },
): Promise<TransactionWithListPresentation> {
  const payments = await ctx.db
    .query('creditFacilityInstallmentPayments')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .take(50);

  if (payments.length === 0) {
    return transaction;
  }

  const facilityNames = new Set<string>();
  const planNames = new Set<string>();
  let amountMinor = 0n;
  for (const payment of payments) {
    if (payment.userId !== userId) {
      continue;
    }

    amountMinor += payment.amount.amountMinor;
    const facility = await ctx.db.get('creditFacilities', payment.creditFacilityId);
    if (facility && facility.userId === userId) {
      facilityNames.add(facility.name);
    }
    const plan = await ctx.db.get('creditFacilityInstallmentPlans', payment.installmentPlanId);
    if (plan && plan.userId === userId) {
      planNames.add(plan.name);
    }
  }

  return {
    ...transaction,
    creditInstallmentAllocation: {
      paymentCount: payments.length,
      amount: {
        amountMinor,
        currency: transaction.amount.currency,
      },
      facilityNames: [...facilityNames].sort((left, right) => left.localeCompare(right)),
      planNames: [...planNames].sort((left, right) => left.localeCompare(right)),
    },
  };
}

async function enrichTransactionsForList(
  ctx: QueryCtx,
  userId: string,
  transactions: Array<Doc<'transactions'>>,
  args: ListTransactionsArgs,
  sortField: 'bookingDate' | 'amount',
  sortDirection: 'asc' | 'desc',
  visibleTransactionIds?: Set<Id<'transactions'>>,
): Promise<Array<TransactionWithListPresentation>> {
  const enrichedTransactions: Array<TransactionWithListPresentation> = [];

  for (const transaction of transactions) {
    const withTransferPresentation = await addTransferPresentation(
      ctx,
      userId,
      transaction,
      args,
      sortField,
      sortDirection,
      visibleTransactionIds,
    );
    if (!withTransferPresentation) {
      continue;
    }

    enrichedTransactions.push(await addCreditInstallmentAllocation(ctx, userId, withTransferPresentation));
  }

  return enrichedTransactions;
}

async function listTransactionsPageForUser(
  ctx: QueryCtx,
  userId: string,
  args: ListTransactionsArgs,
): Promise<TransactionPage> {
  await validateTransactionListFilters(ctx, userId, args);

  const pageSize = Math.min(Math.max(Math.floor(args.paginationOpts.numItems), 1), 100);
  const sortField = args.sortField ?? 'bookingDate';
  const sortDirection = args.sortDirection ?? 'desc';
  const queryOrder = sortField === 'bookingDate' ? sortDirection : 'desc';

  const rawPage = await paginateRawTransactionsForUser(ctx, userId, args, queryOrder, {
    ...args.paginationOpts,
    numItems: pageSize,
  });

  return {
    ...rawPage,
    page: await enrichTransactionsForList(ctx, userId, rawPage.page, args, sortField, sortDirection),
  };
}

export const listTransactionsForUser = internalQuery({
  args: {
    userId: v.string(),
    ...listTransactionsArgsValidator,
  },
  handler: async (ctx, args) => {
    return await listTransactionsPageForUser(ctx, args.userId, args);
  },
});

export const listTransactions = query({
  args: listTransactionsArgsValidator,
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await listTransactionsPageForUser(ctx, user.id, args);
  },
});

async function listTransactionsOffsetPageForUser(
  ctx: QueryCtx,
  userId: string,
  args: ListTransactionsOffsetPageArgs,
) {
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new ConvexError('Limit must be an integer between 1 and 100');
  }
  if (!Number.isInteger(args.offset) || args.offset < 0) {
    throw new ConvexError('Offset must be a non-negative integer');
  }

  await validateTransactionPageFilters(ctx, userId, args.filters);
  const lookups = await loadTransactionSortLookups(ctx, userId);
  const scanned = await scanRecentTransactionsForUser(ctx, userId, args.filters);
  const matching = scanned.transactions.filter((transaction) =>
    transactionMatchesPageFilters(transaction, args.filters, lookups.categoriesById),
  );
  // A matched transfer collapses into one row whose date cell reads as a range starting at the
  // earlier leg. Sorting the surviving leg by its own bookingDate made the date column look
  // unsorted - a transfer spanning the 27th to the 29th sat among the 29ths while showing the 27th.
  // Both legs therefore sort on the earliest date of the pair, which is the one on screen.
  const transferSortDates = new Map<Id<'transferMatches'>, string>();
  for (const transaction of matching) {
    const matchId = transaction.transferMatchId;
    if (!matchId) continue;
    const current = transferSortDates.get(matchId);
    if (current === undefined || transaction.bookingDate < current) {
      transferSortDates.set(matchId, transaction.bookingDate);
    }
  }
  const matchingTransactions = matching.sort((left, right) =>
    compareTransactionsForOffsetPage(left, right, args.sort, lookups, transferSortDates),
  );
  // Both legs receive transferMatchId only after confirmation; keep the first leg in the requested sort.
  const seenConfirmedTransfers = new Set<Id<'transferMatches'>>();
  const sortedTransactions = matchingTransactions.filter((transaction) => {
    const matchId = transaction.transferMatchId;
    if (!matchId) return true;
    if (seenConfirmedTransfers.has(matchId)) return false;
    seenConfirmedTransfers.add(matchId);
    return true;
  });
  const pageTransactions = sortedTransactions.slice(args.offset, args.offset + args.limit);
  const visibleTransactionIds = new Set(pageTransactions.map((transaction) => transaction._id));
  const enriched = await enrichTransactionsForList(
    ctx,
    userId,
    pageTransactions,
    {
      paginationOpts: { numItems: args.limit, cursor: null },
      accountId: args.filters.accountId,
      categoryId: args.filters.categoryId,
      classificationKind: args.filters.classificationKind,
      status: args.filters.status,
      fromDate: args.filters.fromDate,
      toDate: args.filters.toDate,
    },
    'bookingDate',
    'desc',
    visibleTransactionIds,
  );
  return {
    rows: enriched,
    totalCount: sortedTransactions.length,
    scanCapped: scanned.scanCapped,
  };
}

export const listTransactionsOffsetPageForUserQuery = internalQuery({
  args: {
    userId: v.string(),
    filters: listTransactionsPageFiltersValidator,
    sort: v.object({ field: transactionPageSortFieldValidator, direction: sortDirectionValidator }),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => await listTransactionsOffsetPageForUser(ctx, args.userId, args),
});

export const listTransactionsPage = query({
  args: {
    filters: listTransactionsPageFiltersValidator,
    sort: v.object({ field: transactionPageSortFieldValidator, direction: sortDirectionValidator }),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await listTransactionsOffsetPageForUser(ctx, user.id, args);
  },
});

export const listRecentTransactions = query({
  args: {
    accountId: v.optional(v.id('financialAccounts')),
    classificationKind: v.optional(classificationKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 50, 100);

    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id) {
        throw new ConvexError('Account not found');
      }

      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
          q.eq('userId', user.id).eq('accountId', args.accountId!),
        )
        .order('desc')
        .take(limit);
    }

    if (args.classificationKind) {
      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_classificationKind_and_bookingDate', (q) =>
          q.eq('userId', user.id).eq('classificationKind', args.classificationKind!),
        )
        .order('desc')
        .take(limit);
    }

    return await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(limit);
  },
});

export const getSpendingByCategory = query({
  args: {
    accountId: v.optional(v.id('financialAccounts')),
    period: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const period = args.period ?? currentPeriod();
    const limit = Math.min(args.limit ?? 8, 12);
    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id) {
        throw new ConvexError('Account not found');
      }
    }
    const transactions = args.accountId
      ? await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
            q
              .eq('userId', user.id)
              .eq('accountId', args.accountId!)
              .gte('bookingDate', `${period}-01`)
              .lt('bookingDate', periodEndDate(period)),
          )
          .take(1000)
      : await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_bookingDate', (q) =>
            q.eq('userId', user.id).gte('bookingDate', `${period}-01`).lt('bookingDate', periodEndDate(period)),
          )
          .take(1000);

    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);
    const categoryById = new Map(categories.map((category) => [category._id, category]));
    const totalsByCategory = new Map<
      string,
      {
        categoryId: Id<'categories'> | null;
        categoryName: string | null;
        categorySystemKey: string | null;
        amountMinor: bigint;
        currency: string;
      }
    >();

    for (const transaction of transactions) {
      if (
        transaction.direction !== 'DBIT' ||
        // Scheduled rows are intent, not spending: counting them would show the
        // user money they have not spent yet.
        transaction.status === 'SCHD' ||
        transaction.classificationKind === 'transfer' ||
        transaction.classificationKind === 'internal'
      ) {
        continue;
      }

      const category = transaction.categoryId ? (categoryById.get(transaction.categoryId) ?? null) : null;
      const key = `${transaction.categoryId ?? 'uncategorized'}:${transaction.amount.currency}`;
      const existing = totalsByCategory.get(key);
      const amountMinor = absoluteMinorUnits(transaction.amount.amountMinor);

      if (existing) {
        existing.amountMinor += amountMinor;
        continue;
      }

      totalsByCategory.set(key, {
        categoryId: transaction.categoryId ?? null,
        categoryName: category?.name ?? null,
        categorySystemKey: category?.systemKey ?? null,
        amountMinor,
        currency: transaction.amount.currency,
      });
    }

    return [...totalsByCategory.values()]
      .sort((left, right) => (left.amountMinor > right.amountMinor ? -1 : left.amountMinor < right.amountMinor ? 1 : 0))
      .slice(0, limit)
      .map((item) => ({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        categorySystemKey: item.categorySystemKey,
        amount: {
          amountMinor: item.amountMinor,
          currency: item.currency,
        },
      }));
  },
});

export const findTransferCandidates = query({
  args: {
    transactionId: v.id('transactions'),
    daysWindow: v.optional(v.number()),
    toleranceMinor: v.optional(v.int64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    const daysWindow = Math.min(args.daysWindow ?? 7, 31);
    const limit = Math.min(args.limit ?? 20, 50);
    const toleranceMinor = args.toleranceMinor ?? 300n;
    const centerDate = new Date(`${transaction.bookingDate}T00:00:00.000Z`);
    const fromDate = new Date(centerDate);
    fromDate.setUTCDate(centerDate.getUTCDate() - daysWindow);
    const toDate = new Date(centerDate);
    toDate.setUTCDate(centerDate.getUTCDate() + daysWindow);

    const candidates = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) =>
        q
          .eq('userId', user.id)
          .gte('bookingDate', fromDate.toISOString().slice(0, 10))
          .lte('bookingDate', toDate.toISOString().slice(0, 10)),
      )
      .take(200);

    return candidates
      .filter((candidate) => {
        if (candidate._id === transaction._id) {
          return false;
        }

        if (candidate.accountId === transaction.accountId) {
          return false;
        }

        if (candidate.amount.currency !== transaction.amount.currency) {
          return false;
        }

        if (candidate.direction === transaction.direction) {
          return false;
        }

        return absoluteMinorUnits(candidate.amount.amountMinor - transaction.amount.amountMinor) <= toleranceMinor;
      })
      .slice(0, limit);
  },
});

export const listReviewSuggestions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 20, 50);
    const subscriptionCandidateTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_classificationKind_and_bookingDate', (q) =>
        q.eq('userId', user.id).eq('classificationKind', 'subscription'),
      )
      .order('desc')
      .take(100);
    const subscriptionCandidates: Array<Doc<'transactions'>> = [];
    const seenSubscriptionMerchantKeys = new Set<string>();

    for (const transaction of subscriptionCandidateTransactions) {
      if (subscriptionCandidates.length >= limit) {
        break;
      }

      if (transaction.classificationSource !== 'system' || transaction.subscriptionId) {
        continue;
      }

      if (await findMatchingSubscription(ctx, transaction)) {
        continue;
      }

      const merchantKey = merchantKeyForTransaction(transaction);
      if (merchantKey.length < 4 || seenSubscriptionMerchantKeys.has(merchantKey)) {
        continue;
      }

      seenSubscriptionMerchantKeys.add(merchantKey);
      subscriptionCandidates.push(transaction);
    }

    const recentTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(150);

    const transferCandidates: Array<TransferReviewCandidate> = [];
    const existingTransferPairs = new Set<string>();
    const persistedTransferCandidates = await ctx.db
      .query('transferMatches')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'candidate'))
      .take(limit);
    const rejectedTransferCandidates = await ctx.db
      .query('transferMatches')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'rejected'))
      .take(200);

    for (const match of rejectedTransferCandidates) {
      existingTransferPairs.add(`${match.outgoingTransactionId}:${match.incomingTransactionId}`);
    }

    for (const match of persistedTransferCandidates) {
      const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', match.incomingTransactionId);

      if (!outgoing || !incoming || outgoing.userId !== user.id || incoming.userId !== user.id) {
        continue;
      }

      const pairKey = `${outgoing._id}:${incoming._id}`;
      existingTransferPairs.add(pairKey);
      transferCandidates.push({
        transferMatchId: match._id,
        outgoing,
        incoming,
        amountDelta: match.amountDelta,
        confidence: match.confidence ?? 0.7,
      });
    }

    for (const transaction of recentTransactions) {
      if (transferCandidates.length >= limit) {
        break;
      }

      if (transaction.classificationKind === 'transfer' || transaction.transferMatchId) {
        continue;
      }

      const centerDate = new Date(`${transaction.bookingDate}T00:00:00.000Z`);
      for (const candidate of recentTransactions) {
        if (transaction._id === candidate._id || transaction.accountId === candidate.accountId) {
          continue;
        }

        if (candidate.classificationKind === 'transfer' || candidate.transferMatchId) {
          continue;
        }

        if (
          candidate.direction === transaction.direction ||
          candidate.amount.currency !== transaction.amount.currency
        ) {
          continue;
        }

        const candidateDate = new Date(`${candidate.bookingDate}T00:00:00.000Z`);
        const dayDelta = Math.abs(centerDate.getTime() - candidateDate.getTime()) / (24 * 60 * 60 * 1000);
        if (dayDelta > 7) {
          continue;
        }

        const amountDelta = absoluteMinorUnits(candidate.amount.amountMinor - transaction.amount.amountMinor);
        if (amountDelta > 300n) {
          continue;
        }

        const outgoing = transaction.direction === 'DBIT' ? transaction : candidate;
        const incoming = transaction.direction === 'CRDT' ? transaction : candidate;
        const pairKey = `${outgoing._id}:${incoming._id}`;
        if (existingTransferPairs.has(pairKey)) {
          continue;
        }

        existingTransferPairs.add(pairKey);
        transferCandidates.push({
          outgoing,
          incoming,
          amountDelta: {
            amountMinor: amountDelta,
            currency: transaction.amount.currency,
          },
          confidence: amountDelta === 0n ? 0.86 : 0.72,
        });
        break;
      }
    }

    return {
      subscriptionCandidates,
      transferCandidates,
    };
  },
});

export const setClassification = mutation({
  args: {
    transactionId: v.id('transactions'),
    classificationKind: classificationKindValidator,
    categoryId: v.optional(v.id('categories')),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await setClassificationForUserCore(ctx, {
      userId: user.id,
      ...args,
    });
  },
});

export const setClassificationForUser = internalMutation({
  args: {
    userId: v.string(),
    transactionId: v.id('transactions'),
    classificationKind: classificationKindValidator,
    categoryId: v.optional(v.id('categories')),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await setClassificationForUserCore(ctx, args);
  },
});

export const setCategory = mutation({
  args: {
    transactionId: v.id('transactions'),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    let category: Doc<'categories'> | null = null;
    if (args.categoryId) {
      category = await ctx.db.get('categories', args.categoryId);
      if (!category || category.userId !== user.id) {
        throw new ConvexError('Category not found');
      }
    }

    const classificationKind = category
      ? classificationKindForCategory(category, transaction.classificationKind)
      : transaction.classificationKind === 'uncategorized' && transaction.direction === 'DBIT'
        ? 'expense'
        : transaction.classificationKind;
    await ctx.db.patch('transactions', transaction._id, {
      categoryId: args.categoryId,
      classificationKind,
      classificationSource: 'user',
      classificationConfidence: 1,
      updatedAtMs: Date.now(),
    });
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);

    return transaction._id;
  },
});

export const rejectSubscriptionSuggestion = mutation({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    if (transaction.classificationKind !== 'subscription' || transaction.classificationSource !== 'system') {
      throw new ConvexError('Transaction is not a system subscription suggestion');
    }

    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: 'expense',
      classificationSource: 'user',
      classificationConfidence: 1,
      updatedAtMs: Date.now(),
    });
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);

    return transaction._id;
  },
});

export const resetSystemClassification = mutation({
  args: {
    transactionId: v.id('transactions'),
    classificationKind: classificationKindValidator,
    classificationSource: classificationSourceValidator,
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: args.classificationKind,
      classificationSource: args.classificationSource,
      classificationConfidence: args.confidence,
      updatedAtMs: Date.now(),
    });
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);

    return transaction._id;
  },
});
