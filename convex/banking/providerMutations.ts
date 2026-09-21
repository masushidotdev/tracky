import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internal } from '../_generated/api';
import { internalMutation } from '../_generated/server';
import { entitlementsForTier, resolveTier } from '../lib/entitlements';
import { JEV_IMPORT } from '../lib/jevThresholds';
import { absoluteMinorUnits, decimalStringToMinorUnits } from '../lib/money';
import { bankProviderValidator, transactionStatusValidator } from '../lib/validators';
import {
  findMatchingSubscription,
  inferCadenceForTransaction,
  normalizeMerchantKey,
  recurringIntervalConfidence,
} from './subscriptionDetection';
import { ensureDefaultCategoriesForUser, inferCategorySystemKey } from './categoryTaxonomy';
import { findFirstMatchingCategoryRule } from './categoryRuleCore';
import { reconcileImportedTransactionWithPlannedExpenses } from './planningReconciliation';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS, syncFailureBackoffMinutes } from './syncCadence';
import { createTransferCandidateForTransaction, daysBetween } from './transferCandidates';
import { enableBankingCounterpartyName, enableBankingTransactionDescription } from './enableBankingTransactionMapping';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { EnableBankingTransactionForMapping } from './enableBankingTransactionMapping';

type EnableBankingSessionPayload = {
  session_id?: string;
  accounts?: Array<EnableBankingAccountPayload>;
  aspsp?: {
    name?: string;
    country?: string;
  };
  psu_type?: 'personal' | 'business';
  access?: {
    valid_until?: string;
  };
};

type AccountSyncStatus = 'active' | 'paused' | 'rateLimited' | 'reauthorizationRequired' | 'error';

type EnableBankingAccountPayload = {
  uid?: string;
  name?: string;
  details?: string | null;
  currency?: string;
  cash_account_type?: string;
  credit_limit?: string | null;
  usage?: string;
  product?: string | null;
  psu_status?: string | null;
  identification_hash?: string;
  identification_hashes?: Array<string>;
  legal_age?: string | null;
  postal_address?: string | null;
  account_id?: {
    iban?: string;
    identification?: string;
    other?: string | null;
  };
  account_servicer?: {
    name?: string;
  } | null;
  all_account_ids?: Array<{
    identification: string;
    issuer: string | null;
    scheme_name: string;
  }>;
};

type EnableBankingTransactionPayload = EnableBankingTransactionForMapping & {
  entry_reference?: string;
  status?: string;
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  transaction_amount?: {
    currency?: string;
    amount?: string;
  };
  booking_date?: string;
  value_date?: string;
  transaction_date?: string | null;
  creditor_account?: { iban?: string; other?: string | null } | null;
  creditor_agent?: unknown;
  debtor_account?: { iban?: string; other?: string | null } | null;
  debtor_agent?: unknown;
  merchant_category_code?: string | null;
  remittance_information?: Array<string>;
  reference_number?: string | null;
  balance_after_transaction?: unknown;
  reference_number_schema?: string | null;
  debtor_account_additional_identification?: unknown;
  creditor_account_additional_identification?: unknown;
  exchange_rate?: unknown;
  note: string | null;
  transaction_id: string | null;
};

type EnableBankingBalancePayload = {
  name?: string;
  balance_amount?: {
    currency?: string;
    amount?: string;
  };
  balance_type?: string;
  reference_date?: string | null;
};

type NormalizedTransactionStatus = 'BOOK' | 'PDNG' | 'SCHD' | 'HOLD' | 'CNCL' | 'RJCT' | 'OTHR';

const INITIAL_BACKFILL_DAYS = 90;

async function assertImportJobTarget(
  ctx: MutationCtx,
  args: {
    userId: string;
    providerConnectionId?: Id<'providerConnections'>;
    accountId?: Id<'financialAccounts'>;
  },
) {
  if (args.providerConnectionId) {
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);
    if (!connection || connection.userId !== args.userId) {
      throw new ConvexError('Import job provider connection mismatch');
    }
  }

  if (args.accountId) {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== args.userId) {
      throw new ConvexError('Import job account mismatch');
    }

    if (args.providerConnectionId && account.providerConnectionId !== args.providerConnectionId) {
      throw new ConvexError('Import job account does not belong to provider connection');
    }
  }
}
function nowIsoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function maskIdentifier(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const compact = value.replace(/\s+/g, '');
  if (compact.length <= 8) {
    return '***';
  }

  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

function accountIdentityHash(account: EnableBankingAccountPayload) {
  return firstNonEmpty(account.identification_hash, account.identification_hashes?.[0]) ?? undefined;
}

function accountMaskedIdentifier(account: EnableBankingAccountPayload) {
  return maskIdentifier(account.account_id?.iban ?? account.account_id?.identification);
}

function accountMaskedIdentityKey(maskedIdentifier: string | undefined, currency: string) {
  return maskedIdentifier ? `${currency}:${maskedIdentifier}` : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}

function bankTransactionCodeText(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const code = 'code' in value ? String((value as { code?: unknown }).code ?? '') : '';
  const subCode = 'sub_code' in value ? String((value as { sub_code?: unknown }).sub_code ?? '') : '';
  const description = 'description' in value ? String((value as { description?: unknown }).description ?? '') : '';
  return [code, subCode, description].filter(Boolean).join(' ') || null;
}

function dedupeKey(transaction: EnableBankingTransactionPayload, amountMinor: bigint, currency: string) {
  const stableId = transaction.transaction_id ?? transaction.entry_reference;
  if (stableId) {
    return stableId;
  }

  return [
    transaction.booking_date ?? '',
    transaction.value_date ?? '',
    transaction.transaction_date ?? '',
    transaction.credit_debit_indicator ?? '',
    amountMinor.toString(),
    currency,
    transaction.remittance_information?.join(' / ') ?? '',
  ].join('|');
}

function normalizeTransactionStatus(
  status: string | undefined,
  fallback: NormalizedTransactionStatus,
): NormalizedTransactionStatus {
  if (
    status === 'BOOK' ||
    status === 'PDNG' ||
    status === 'SCHD' ||
    status === 'HOLD' ||
    status === 'CNCL' ||
    status === 'RJCT'
  ) {
    return status;
  }

  return status === undefined ? fallback : 'OTHR';
}

function normalizeBalance(balance: EnableBankingBalancePayload, fallbackCurrency: string) {
  const currency = balance.balance_amount?.currency ?? fallbackCurrency;
  const amount = balance.balance_amount?.amount;
  if (!amount) {
    return null;
  }

  try {
    return {
      balanceType: balance.balance_type ?? balance.name ?? 'unknown',
      balanceName: typeof balance.name === 'string' && balance.name.trim().length > 0 ? balance.name : undefined,
      amount: {
        amountMinor: decimalStringToMinorUnits(amount, currency),
        currency,
      },
      referenceDate: typeof balance.reference_date === 'string' ? balance.reference_date : undefined,
    };
  } catch {
    return null;
  }
}

function inferImportedTransactionClassification(args: {
  userId: string;
  direction: 'CRDT' | 'DBIT';
  bookingDate: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  counterpartyName: string | null | undefined;
  merchantCategoryCode: string | null | undefined;
  remittanceInformation: Array<string> | undefined;
  bankTransactionCode: string | null | undefined;
  categoryIdsBySystemKey: Map<string, Id<'categories'>>;
  // Read once by the caller and reused for every row. Querying 200 transactions per imported
  // transaction blew the 16 MB read limit on a backfill and aborted the whole sync.
  priorTransactions: Array<Doc<'transactions'>>;
}) {
  const inferredCategorySystemKey = inferCategorySystemKey({
    direction: args.direction,
    description: args.description,
    counterpartyName: args.counterpartyName,
    merchantCategoryCode: args.merchantCategoryCode,
    remittanceInformation: args.remittanceInformation,
    bankTransactionCode: args.bankTransactionCode,
  });
  const categoryId = args.categoryIdsBySystemKey.get(inferredCategorySystemKey);

  if (args.direction !== 'DBIT') {
    return {
      classificationKind: 'income' as const,
      classificationSource: 'system' as const,
      classificationConfidence: 0.65,
      categoryId,
    };
  }

  const merchantKey = normalizeMerchantKey(args.counterpartyName ?? args.description);
  if (merchantKey.length < 4) {
    // Short merchant keys carry no signal: without a rental path (no prior can
    // match a <4 key) they stay `uncategorized` residue for jev triage instead
    // of a blind expense fallback.
    return {
      classificationKind: 'uncategorized' as const,
      classificationSource: 'system' as const,
      classificationConfidence: 0.45,
      categoryId: undefined,
    };
  }

  for (const prior of args.priorTransactions) {
    if (prior.bookingDate >= args.bookingDate) {
      continue;
    }

    if (prior.direction !== 'DBIT' || prior.amount.currency !== args.currency) {
      continue;
    }

    const priorMerchantKey = normalizeMerchantKey(prior.counterpartyName ?? prior.description);
    if (priorMerchantKey !== merchantKey) {
      continue;
    }

    const amountTolerance = args.amountMinor / 20n > 100n ? args.amountMinor / 20n : 100n;
    if (absoluteMinorUnits(prior.amount.amountMinor - args.amountMinor) > amountTolerance) {
      continue;
    }

    const inferredInterval = recurringIntervalConfidence(daysBetween(prior.bookingDate, args.bookingDate));
    if (inferredInterval) {
      return {
        classificationKind: 'subscription' as const,
        classificationSource: 'system' as const,
        classificationConfidence: inferredInterval.confidence,
        categoryId,
      };
    }
  }

  // UC1: the weakest heuristic bucket (generic "other" category, low
  // confidence) stays `uncategorized` residue for jev triage instead of a
  // blind expense fallback — unless a same-merchant prior exists, in which
  // case the subscription path below still gets its chance. Confident
  // mappings keep their kind.
  const sameMerchantPrior = args.priorTransactions.some(
    (prior) =>
      prior.direction === 'DBIT' &&
      prior.amount.currency === args.currency &&
      normalizeMerchantKey(prior.counterpartyName ?? prior.description) === merchantKey,
  );
  if (inferredCategorySystemKey === 'expense:other' && !sameMerchantPrior) {
    return {
      classificationKind: 'uncategorized' as const,
      classificationSource: 'system' as const,
      classificationConfidence: 0.45,
      categoryId: undefined,
    };
  }
  return {
    classificationKind: 'expense' as const,
    classificationSource: 'system' as const,
    classificationConfidence: inferredCategorySystemKey === 'expense:other' ? 0.45 : 0.65,
    categoryId,
  };
}

async function linkImportedTransactionToExistingSubscription(
  ctx: MutationCtx,
  args: {
    userId: string;
    transactionId: Id<'transactions'>;
  },
) {
  const transaction = await ctx.db.get('transactions', args.transactionId);
  if (!transaction || transaction.userId !== args.userId) {
    return false;
  }

  // A scheduled charge has not been taken yet: it must not move the
  // subscription's amount, cadence, or next due date.
  if (transaction.status === 'SCHD') {
    return false;
  }

  const subscription = await findMatchingSubscription(ctx, transaction);
  if (!subscription) {
    return false;
  }

  const { cadence } = await inferCadenceForTransaction(ctx, transaction, {
    interval: subscription.interval,
    intervalCount: subscription.intervalCount,
  });
  const now = Date.now();

  await ctx.db.patch('transactions', transaction._id, {
    classificationKind: 'subscription',
    classificationSource: 'system',
    classificationConfidence: cadence.confidence,
    categoryId: transaction.categoryId ?? subscription.categoryId,
    subscriptionId: subscription._id,
    updatedAtMs: now,
  });
  await ctx.db.patch('subscriptions', subscription._id, {
    amount: transaction.amount,
    interval: cadence.interval,
    intervalCount: cadence.intervalCount,
    latestTransactionId: transaction._id,
    nextDueDate: cadence.nextDueDate,
    updatedAtMs: now,
  });

  // UC3: classify the charge series (rincari, zombie, cluster) once linked.
  // Advisory only: the verdict lands on the transaction note, never auto-edits.
  await ctx.scheduler.runAfter(0, internal.banking.subscriptionSentinel.classifySeries, {
    userId: args.userId,
    transactionId: transaction._id,
  });

  return true;
}

export const createAuthRequest = internalMutation({
  args: {
    userId: v.string(),
    provider: bankProviderValidator,
    state: v.string(),
    redirectUrl: v.string(),
    aspspName: v.string(),
    aspspCountry: v.string(),
    psuType: v.union(v.literal('personal'), v.literal('business')),
    providerConnectionId: v.optional(v.id('providerConnections')),
    expiresAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('providerAuthRequests', {
      userId: args.userId,
      provider: args.provider,
      state: args.state,
      status: 'created',
      redirectUrl: args.redirectUrl,
      aspspName: args.aspspName,
      aspspCountry: args.aspspCountry,
      psuType: args.psuType,
      providerConnectionId: args.providerConnectionId,
      createdAtMs: now,
      expiresAtMs: args.expiresAtMs,
    });
  },
});

export const startImportJob = internalMutation({
  args: {
    userId: v.string(),
    provider: bankProviderValidator,
    providerConnectionId: v.optional(v.id('providerConnections')),
    accountId: v.optional(v.id('financialAccounts')),
    kind: v.union(v.literal('connectionCallback'), v.literal('accountBackfill'), v.literal('accountRefresh')),
    trigger: v.optional(
      v.union(v.literal('callback'), v.literal('initialCallback'), v.literal('cron'), v.literal('manual')),
    ),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    transactionStatus: v.optional(transactionStatusValidator),
  },
  handler: async (ctx, args) => {
    await assertImportJobTarget(ctx, args);

    const now = Date.now();
    return await ctx.db.insert('importJobs', {
      userId: args.userId,
      provider: args.provider,
      providerConnectionId: args.providerConnectionId,
      accountId: args.accountId,
      kind: args.kind,
      trigger: args.trigger,
      status: 'running',
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      transactionStatus: args.transactionStatus,
      balancesSeen: 0,
      balancesImported: 0,
      transactionsSeen: 0,
      transactionsImported: 0,
      transactionPagesFetched: 0,
      startedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const completeImportJob = internalMutation({
  args: {
    importJobId: v.id('importJobs'),
    providerConnectionId: v.optional(v.id('providerConnections')),
    accountId: v.optional(v.id('financialAccounts')),
    balancesSeen: v.optional(v.number()),
    balancesImported: v.optional(v.number()),
    transactionsSeen: v.optional(v.number()),
    transactionsImported: v.optional(v.number()),
    transactionPagesFetched: v.optional(v.number()),
    continuationKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('importJobs', args.importJobId);
    if (!job) {
      throw new ConvexError('Import job not found');
    }

    await assertImportJobTarget(ctx, {
      userId: job.userId,
      providerConnectionId: args.providerConnectionId ?? job.providerConnectionId,
      accountId: args.accountId ?? job.accountId,
    });

    const now = Date.now();
    await ctx.db.patch('importJobs', job._id, {
      providerConnectionId: args.providerConnectionId ?? job.providerConnectionId,
      accountId: args.accountId ?? job.accountId,
      status: 'succeeded',
      balancesSeen: args.balancesSeen ?? job.balancesSeen,
      balancesImported: args.balancesImported ?? job.balancesImported,
      transactionsSeen: args.transactionsSeen ?? job.transactionsSeen,
      transactionsImported: args.transactionsImported ?? job.transactionsImported,
      transactionPagesFetched: args.transactionPagesFetched ?? job.transactionPagesFetched,
      continuationKey: args.continuationKey,
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAtMs: undefined,
      completedAtMs: now,
      updatedAtMs: now,
    });

    return job._id;
  },
});

export const failImportJob = internalMutation({
  args: {
    importJobId: v.id('importJobs'),
    status: v.union(v.literal('failed'), v.literal('rateLimited')),
    errorCode: v.string(),
    errorMessage: v.string(),
    nextRetryAtMs: v.optional(v.number()),
    continuationKey: v.optional(v.string()),
    balancesSeen: v.optional(v.number()),
    balancesImported: v.optional(v.number()),
    transactionsSeen: v.optional(v.number()),
    transactionsImported: v.optional(v.number()),
    transactionPagesFetched: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('importJobs', args.importJobId);
    if (!job) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch('importJobs', job._id, {
      status: args.status,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      nextRetryAtMs: args.nextRetryAtMs,
      continuationKey: args.continuationKey,
      balancesSeen: args.balancesSeen ?? job.balancesSeen,
      balancesImported: args.balancesImported ?? job.balancesImported,
      transactionsSeen: args.transactionsSeen ?? job.transactionsSeen,
      transactionsImported: args.transactionsImported ?? job.transactionsImported,
      transactionPagesFetched: args.transactionPagesFetched ?? job.transactionPagesFetched,
      completedAtMs: now,
      updatedAtMs: now,
    });

    return job._id;
  },
});

export const markAuthRequestRedirected = internalMutation({
  args: {
    authRequestId: v.id('providerAuthRequests'),
    authorizationId: v.optional(v.string()),
    providerUserHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('providerAuthRequests', args.authRequestId, {
      status: 'redirected',
      authorizationId: args.authorizationId,
      providerUserHash: args.providerUserHash,
    });
  },
});

export const failAuthRequest = internalMutation({
  args: {
    state: v.string(),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query('providerAuthRequests')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique();

    if (!request) {
      return null;
    }

    // A losing callback racing a completed one must not flip the request
    // back to failed: completion already produced its connection and syncs.
    if (request.status === 'completed') {
      return request._id;
    }

    await ctx.db.patch('providerAuthRequests', request._id, {
      status: 'failed',
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      completedAtMs: Date.now(),
    });

    return request._id;
  },
});

// How long a callback claim may stay `processing` before another callback is
// allowed to take over: bounds recovery when a claimant crashes mid-exchange.
export const CALLBACK_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export const claimAuthRequestForCallback = internalMutation({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query('providerAuthRequests')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique();

    if (!request) {
      return { outcome: 'missing' } as const;
    }

    if (request.status === 'completed') {
      return { outcome: 'completed' } as const;
    }

    // Mutations run transactionally, so concurrent callbacks serialize here:
    // exactly one becomes the claimant, the rest observe `processing`.
    const now = Date.now();
    const claimFresh =
      request.status !== 'processing' ||
      now - (request.processingStartedAtMs ?? 0) >= CALLBACK_CLAIM_TIMEOUT_MS;
    if (!claimFresh) {
      return { outcome: 'processing' } as const;
    }

    await ctx.db.patch('providerAuthRequests', request._id, {
      status: 'processing',
      processingStartedAtMs: now,
      errorCode: undefined,
      errorMessage: undefined,
    });

    return {
      outcome: 'claimed',
      userId: request.userId,
      providerConnectionId: request.providerConnectionId,
      expiresAtMs: request.expiresAtMs,
    } as const;
  },
});

export const completeEnableBankingSession = internalMutation({
  args: {
    state: v.string(),
    session: v.any(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query('providerAuthRequests')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique();

    if (!request) {
      throw new ConvexError('Provider auth request not found');
    }

    // Defense in depth: exchangeCallback already returns early on completed
    // requests, so reaching here means a direct or raced call. Refusing keeps
    // a replay from inserting a second connection and re-scheduling syncs.
    if (request.status === 'completed') {
      throw new ConvexError('Provider auth request already completed');
    }

    const session = args.session as EnableBankingSessionPayload;

    if (!session.session_id) {
      throw new ConvexError('Enable Banking session id missing');
    }

    const now = Date.now();
    const connectionId =
      request.providerConnectionId ??
      (await ctx.db.insert('providerConnections', {
        userId: request.userId,
        provider: 'enableBanking',
        status: 'active',
        displayName: session.aspsp?.name ?? request.aspspName,
        sessionId: session.session_id,
        aspspName: session.aspsp?.name ?? request.aspspName,
        aspspCountry: session.aspsp?.country ?? request.aspspCountry,
        psuType: session.psu_type ?? request.psuType,
        accessValidUntil: session.access?.valid_until,
        providerUserHash: request.providerUserHash,
        nextSyncAfterMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      }));

    if (request.providerConnectionId) {
      const connection = await ctx.db.get('providerConnections', request.providerConnectionId);
      if (!connection || connection.userId !== request.userId || connection.provider !== 'enableBanking') {
        throw new ConvexError('Provider connection not found for reauthorization');
      }

      await ctx.db.patch('providerConnections', connection._id, {
        status: 'active',
        displayName: session.aspsp?.name ?? request.aspspName,
        sessionId: session.session_id,
        aspspName: session.aspsp?.name ?? request.aspspName,
        aspspCountry: session.aspsp?.country ?? request.aspspCountry,
        psuType: session.psu_type ?? request.psuType,
        accessValidUntil: session.access?.valid_until,
        providerUserHash: request.providerUserHash,
        nextSyncAfterMs: now,
        statusDetail: undefined,
        updatedAtMs: now,
      });
    }

    const existingAccounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', connectionId))
      .take(200);
    // Identity matching looks across the whole user, not just this connection: reconnecting a bank
    // creates a new connection whose account list is empty, so a connection-scoped lookup found
    // nothing and inserted a second copy of accounts the user already had. The deactivation sweep
    // below deliberately keeps using `existingAccounts`, or it would pause other connections.
    const userAccounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', request.userId))
      .take(500);
    const identityCandidates = userAccounts.filter((account) => account.provider === 'enableBanking');
    const existingAccountByProviderId = new Map(
      identityCandidates.map((account) => [account.providerAccountId, account]),
    );
    const existingAccountByProviderHash = new Map<string, (typeof identityCandidates)[number]>();
    const existingAccountByMaskedIdentity = new Map<string, (typeof identityCandidates)[number]>();
    for (const existingAccount of [...identityCandidates].sort((left, right) => left.createdAtMs - right.createdAtMs)) {
      if (
        existingAccount.providerAccountHash &&
        !existingAccountByProviderHash.has(existingAccount.providerAccountHash)
      ) {
        existingAccountByProviderHash.set(existingAccount.providerAccountHash, existingAccount);
      }

      const maskedIdentityKey = accountMaskedIdentityKey(existingAccount.ibanMasked, existingAccount.currency);
      if (maskedIdentityKey && !existingAccountByMaskedIdentity.has(maskedIdentityKey)) {
        existingAccountByMaskedIdentity.set(maskedIdentityKey, existingAccount);
      }
    }
    const activeAccountIds = new Set<Id<'financialAccounts'>>();

    for (const account of session.accounts ?? []) {
      if (!account.uid) {
        continue;
      }

      const providerAccountHash = accountIdentityHash(account);
      const ibanMasked = accountMaskedIdentifier(account);
      const currency = account.currency ?? 'EUR';
      const maskedIdentityKey = accountMaskedIdentityKey(ibanMasked, currency);
      const accountPatch = {
        // Adopting an account from an older connection re-points it here, so the fresh consent
        // keeps it syncing and its history stays on one row instead of being split across copies.
        providerConnectionId: connectionId,
        providerAccountId: account.uid,
        providerAccountHash,
        name: account.name ?? account.account_servicer?.name ?? 'Bank account',
        officialName: account.details,
        institutionName: account.account_servicer?.name ?? session.aspsp?.name,
        accountType: account.cash_account_type,
        accountSubtype: account.usage ?? account.product,
        currency,
        ibanMasked,
        status: 'active' as const,
        syncEnabled: true,
        updatedAtMs: now,
      };
      const existingAccount =
        (providerAccountHash ? existingAccountByProviderHash.get(providerAccountHash) : undefined) ??
        existingAccountByProviderId.get(account.uid) ??
        (maskedIdentityKey ? existingAccountByMaskedIdentity.get(maskedIdentityKey) : undefined);
      const accountId =
        existingAccount?._id ??
        (await ctx.db.insert('financialAccounts', {
          userId: request.userId,
          provider: 'enableBanking',
          createdAtMs: now,
          ...accountPatch,
        }));

      if (existingAccount) {
        await ctx.db.patch('financialAccounts', existingAccount._id, accountPatch);
        existingAccountByProviderId.set(account.uid, { ...existingAccount, ...accountPatch });
        if (providerAccountHash) {
          existingAccountByProviderHash.set(providerAccountHash, { ...existingAccount, ...accountPatch });
        }
        if (maskedIdentityKey) {
          existingAccountByMaskedIdentity.set(maskedIdentityKey, { ...existingAccount, ...accountPatch });
        }
      }

      activeAccountIds.add(accountId);

      const existingSyncState = await ctx.db
        .query('accountSyncStates')
        .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
        .unique();
      const syncStatePatch = {
        status: 'active' as AccountSyncStatus,
        nextSyncAfterMs: now,
        consecutiveFailures: 0,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        updatedAtMs: now,
      };

      if (existingSyncState) {
        await ctx.db.patch('accountSyncStates', existingSyncState._id, syncStatePatch);
      } else {
        await ctx.db.insert('accountSyncStates', {
          userId: request.userId,
          providerConnectionId: connectionId,
          accountId,
          provider: 'enableBanking',
          backfillFromDate: nowIsoDate(-INITIAL_BACKFILL_DAYS),
          syncCadenceHours: DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS,
          ...syncStatePatch,
        });
      }
    }

    if (request.providerConnectionId) {
      for (const existingAccount of existingAccounts) {
        if (activeAccountIds.has(existingAccount._id)) {
          continue;
        }

        await ctx.db.patch('financialAccounts', existingAccount._id, {
          status: 'paused',
          syncEnabled: false,
          updatedAtMs: now,
        });

        const syncState = await ctx.db
          .query('accountSyncStates')
          .withIndex('by_accountId', (q) => q.eq('accountId', existingAccount._id))
          .unique();
        if (syncState) {
          await ctx.db.patch('accountSyncStates', syncState._id, {
            status: 'paused',
            updatedAtMs: now,
          });
        }
      }
    }

    await ctx.db.patch('providerAuthRequests', request._id, {
      status: 'completed',
      completedAtMs: now,
    });

    return connectionId;
  },
});

export const upsertAccountBalances = internalMutation({
  args: {
    accountId: v.id('financialAccounts'),
    providerConnectionId: v.id('providerConnections'),
    provider: bankProviderValidator,
    balances: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);

    if (!account || !connection || account.userId !== connection.userId) {
      throw new ConvexError('Balance sync target not found');
    }

    if (account.providerConnectionId !== connection._id) {
      throw new ConvexError('Balance sync target does not match provider connection');
    }

    if (account.provider !== args.provider || connection.provider !== args.provider) {
      throw new ConvexError('Balance sync provider mismatch');
    }

    const now = Date.now();
    const balanceDates: Array<string> = [];
    let inserted = 0;

    for (const rawBalance of args.balances as Array<EnableBankingBalancePayload>) {
      const balance = normalizeBalance(rawBalance, account.currency);
      if (!balance) {
        continue;
      }

      await ctx.db.insert('accountBalances', {
        userId: account.userId,
        accountId: account._id,
        providerConnectionId: connection._id,
        provider: args.provider,
        balanceType: balance.balanceType,
        ...(balance.balanceName ? { balanceName: balance.balanceName } : {}),
        amount: balance.amount,
        ...(balance.referenceDate ? { referenceDate: balance.referenceDate } : {}),
        fetchedAtMs: now,
      });
      balanceDates.push(balance.referenceDate ?? new Date(now).toISOString().slice(0, 10));
      inserted += 1;
    }
    if (inserted > 0 && account.accountType?.toUpperCase() === 'CARD') {
      await invalidatePlanSnapshots(ctx, account.userId, balanceDates);
    }

    return {
      inserted,
      seen: args.balances.length,
    };
  },
});

export const upsertTransactions = internalMutation({
  args: {
    accountId: v.id('financialAccounts'),
    providerConnectionId: v.id('providerConnections'),
    syncStateId: v.id('accountSyncStates'),
    provider: bankProviderValidator,
    transactionStatus: transactionStatusValidator,
    transactions: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);
    const syncState = await ctx.db.get('accountSyncStates', args.syncStateId);

    if (!account || !connection || !syncState) {
      throw new ConvexError('Sync target not found');
    }

    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    let imported = 0;
    let latestBookedDate = syncState.lastBookedDate;
    const affectedDates: Array<string | undefined> = [];
    const triageTransactionIds: Array<Id<'transactions'>> = [];
    const categoryIdsBySystemKey = await ensureDefaultCategoriesForUser(ctx, account.userId);
    // One read for the whole batch. Rows imported below are appended so a recurrence can still be
    // spotted against a transaction that arrived in this same sync.
    const priorTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', account.userId))
      .order('desc')
      .take(200);
    const categoryRules = await ctx.db
      .query('categoryRules')
      .withIndex('by_userId_and_priority', (q) => q.eq('userId', account.userId))
      .take(200);

    for (const rawTransaction of args.transactions as Array<EnableBankingTransactionPayload>) {
      const rawAmount = rawTransaction.transaction_amount;
      const currency = rawAmount?.currency ?? account.currency;
      const amountMinor = absoluteMinorUnits(decimalStringToMinorUnits(rawAmount?.amount ?? '0', currency));
      const transactionDedupeKey = dedupeKey(rawTransaction, amountMinor, currency);
      const bookingDate =
        rawTransaction.booking_date ?? rawTransaction.value_date ?? rawTransaction.transaction_date ?? nowIsoDate();
      const normalizedStatus = normalizeTransactionStatus(rawTransaction.status, args.transactionStatus);
      const direction = rawTransaction.credit_debit_indicator ?? 'DBIT';
      const description = enableBankingTransactionDescription(rawTransaction);
      const counterparty = enableBankingCounterpartyName(rawTransaction);

      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q.eq('accountId', args.accountId).eq('dedupeKey', transactionDedupeKey),
        )
        .unique();

      const patch = {
        providerTransactionId: rawTransaction.transaction_id,
        providerEntryReference: rawTransaction.entry_reference,
        status: normalizedStatus,
        direction,
        amount: {
          amountMinor,
          currency,
        },
        bookingDate,
        valueDate: rawTransaction.value_date,
        transactionDate: rawTransaction.transaction_date ?? rawTransaction.booking_date,
        description,
        counterpartyName: counterparty,
        merchantCategoryCode: rawTransaction.merchant_category_code,
        remittanceInformation: rawTransaction.remittance_information,
        referenceNumber: rawTransaction.reference_number,
        providerMetadata: {
          bankTransactionCode: rawTransaction.bank_transaction_code,
        },
        updatedAtMs: now,
      };

      if (existing) {
        affectedDates.push(existing.bookingDate, bookingDate);
        await ctx.db.patch('transactions', existing._id, patch);
        await linkImportedTransactionToExistingSubscription(ctx, {
          userId: account.userId,
          transactionId: existing._id,
        });
        await reconcileImportedTransactionWithPlannedExpenses(ctx, existing._id);
      } else {
        const inferredClassification = inferImportedTransactionClassification({
          userId: account.userId,
          direction,
          bookingDate,
          amountMinor,
          currency,
          description,
          counterpartyName: counterparty,
          merchantCategoryCode: rawTransaction.merchant_category_code,
          remittanceInformation: rawTransaction.remittance_information,
          bankTransactionCode: bankTransactionCodeText(rawTransaction.bank_transaction_code),
          categoryIdsBySystemKey,
          priorTransactions,
        });
        const matchingRule =
          direction === 'DBIT'
            ? findFirstMatchingCategoryRule(categoryRules, {
                description,
                counterpartyName: counterparty,
              })
            : null;
        const classification = matchingRule
          ? {
              ...inferredClassification,
              classificationKind: 'expense' as const,
              classificationSource: 'rule' as const,
              classificationConfidence: 1,
              categoryId: matchingRule.categoryId,
              ...matchingRule.transactionPatch,
            }
          : inferredClassification;

        const transactionId = await ctx.db.insert('transactions', {
          userId: account.userId,
          accountId: account._id,
          providerConnectionId: connection._id,
          provider: args.provider,
          dedupeKey: transactionDedupeKey,
          ...classification,
          importedAtMs: now,
          ...patch,
        });
        affectedDates.push(bookingDate);
        // UC1: uncategorized residue (weak heuristic, no rule) is triageable.
        // Scheduling happens after the batch via requestRowTriage (see below).
        if (classification.classificationKind === 'uncategorized' && !matchingRule) {
          triageTransactionIds.push(transactionId);
        }
        const insertedTransaction = await ctx.db.get('transactions', transactionId);
        if (insertedTransaction) priorTransactions.push(insertedTransaction);
        await linkImportedTransactionToExistingSubscription(ctx, {
          userId: account.userId,
          transactionId,
        });
        await createTransferCandidateForTransaction(ctx, {
          userId: account.userId,
          transactionId,
        });
        await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId);
        imported += 1;
      }

      if (
        normalizedStatus === 'BOOK' &&
        bookingDate <= today &&
        (!latestBookedDate || bookingDate > latestBookedDate)
      ) {
        latestBookedDate = bookingDate;
      }
    }

    await invalidatePlanSnapshots(ctx, account.userId, affectedDates);
    // UC1: schedule jev triage for the uncategorized residue, bounded per
    // batch (Q5) and per tier-day (Q2) via requestRowTriage.
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', account.userId))
      .unique();
    const dailyBudget = entitlementsForTier(resolveTier(settings)).limits.jevDecisionsDaily;
    let triageQueued = 0;
    for (const transactionId of triageTransactionIds.slice(0, JEV_IMPORT.maxRowsPerBatch)) {
      const result = await ctx.runMutation(internal.banking.importTriage.requestRowTriage, {
        userId: account.userId,
        transactionId,
        today,
        dailyBudget,
      });
      if (result.queued) triageQueued += 1;
    }
    const nextSyncAfterMs = now + syncState.syncCadenceHours * 60 * 60 * 1000;
    await ctx.db.patch('accountSyncStates', syncState._id, {
      status: 'active',
      lastBookedDate: latestBookedDate,
      nextSyncAfterMs,
      consecutiveFailures: 0,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAtMs: now,
    });

    await ctx.db.patch('providerConnections', connection._id, {
      lastSyncedAtMs: now,
      nextSyncAfterMs,
      updatedAtMs: now,
    });

    return {
      imported,
      seen: args.transactions.length,
      latestBookedDate: latestBookedDate ?? null,
      triageQueued,
    };
  },
});

export const backfillMissingEnableBankingCounterparties = internalMutation({
  args: {
    accountId: v.id('financialAccounts'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.provider !== 'enableBanking') {
      throw new ConvexError('Enable Banking account not found');
    }

    const result = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
        q.eq('userId', account.userId).eq('accountId', account._id),
      )
      .paginate(args.paginationOpts);
    let updated = 0;

    for (const transaction of result.page) {
      if (transaction.provider !== 'enableBanking' || transaction.counterpartyName?.trim()) continue;
      const bankTransactionCode = transaction.providerMetadata?.bankTransactionCode;
      const counterpartyName = enableBankingCounterpartyName({
        credit_debit_indicator: transaction.direction,
        remittance_information: transaction.remittanceInformation,
        bank_transaction_code: bankTransactionCode,
      });
      if (!counterpartyName) continue;

      await ctx.db.patch('transactions', transaction._id, {
        counterpartyName,
        updatedAtMs: Date.now(),
      });
      updated += 1;
    }

    return {
      scanned: result.page.length,
      updated,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const markConnectionReauthorizationRequired = internalMutation({
  args: {
    providerConnectionId: v.id('providerConnections'),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);
    if (!connection) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch('providerConnections', connection._id, {
      status: 'reauthorizationRequired',
      statusDetail: args.errorMessage,
      updatedAtMs: now,
    });

    const accounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', connection._id))
      .take(200);

    for (const account of accounts) {
      await ctx.db.patch('financialAccounts', account._id, {
        status: 'reauthorizationRequired',
        syncEnabled: false,
        updatedAtMs: now,
      });

      const syncState = await ctx.db
        .query('accountSyncStates')
        .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
        .unique();

      if (!syncState) {
        continue;
      }

      await ctx.db.patch('accountSyncStates', syncState._id, {
        status: 'reauthorizationRequired',
        lastErrorCode: args.errorCode,
        lastErrorMessage: args.errorMessage,
        updatedAtMs: now,
      });
    }

    return connection._id;
  },
});

export const markSyncRateLimited = internalMutation({
  args: {
    syncStateId: v.id('accountSyncStates'),
    errorCode: v.string(),
    errorMessage: v.string(),
    retryAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    const syncState = await ctx.db.get('accountSyncStates', args.syncStateId);
    if (!syncState) {
      return null;
    }

    await ctx.db.patch('accountSyncStates', syncState._id, {
      status: 'rateLimited',
      nextSyncAfterMs: args.retryAfterMs,
      consecutiveFailures: syncState.consecutiveFailures + 1,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      updatedAtMs: Date.now(),
    });

    return syncState._id;
  },
});

export const markSyncFailed = internalMutation({
  args: {
    syncStateId: v.id('accountSyncStates'),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const syncState = await ctx.db.get('accountSyncStates', args.syncStateId);
    if (!syncState) {
      return null;
    }

    const now = Date.now();
    const consecutiveFailures = syncState.consecutiveFailures + 1;
    const nextSyncAfterMs = now + syncFailureBackoffMinutes(consecutiveFailures) * 60 * 1000;

    await ctx.db.patch('accountSyncStates', syncState._id, {
      status: 'error',
      nextSyncAfterMs,
      consecutiveFailures,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      updatedAtMs: now,
    });

    return syncState._id;
  },
});

// Ops-only: re-scan a window after a sync bug.
export const rewindSyncCursor = internalMutation({
  args: {
    accountId: v.id('financialAccounts'),
    fromDate: v.string(),
  },
  handler: async (ctx, args) => {
    const syncState = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_accountId', (q) => q.eq('accountId', args.accountId))
      .unique();

    if (!syncState) {
      throw new ConvexError('Account sync state not found');
    }

    await ctx.db.patch('accountSyncStates', syncState._id, {
      backfillFromDate:
        args.fromDate < syncState.backfillFromDate ? args.fromDate : syncState.backfillFromDate,
      lastBookedDate: args.fromDate,
      status: 'active',
      nextSyncAfterMs: 0,
      consecutiveFailures: 0,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAtMs: Date.now(),
    });

    return syncState._id;
  },
});
