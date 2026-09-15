import { ConvexError, v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { moneyAmountValidator } from '../lib/validators';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

// Manual accounts (e.g. a credit card the bank API does not expose) hang off a
// single per-user 'manual' provider connection: transactions and balances both
// require a providerConnectionId, so the connection is created lazily once.
export async function getOrCreateManualConnection(
  ctx: MutationCtx,
  userId: string,
): Promise<Id<'providerConnections'>> {
  const existing = await ctx.db
    .query('providerConnections')
    .withIndex('by_userId_and_provider', (q) => q.eq('userId', userId).eq('provider', 'manual'))
    .first();
  if (existing) {
    return existing._id;
  }

  const now = Date.now();
  return await ctx.db.insert('providerConnections', {
    userId,
    provider: 'manual',
    status: 'active',
    displayName: 'Manual',
    createdAtMs: now,
    updatedAtMs: now,
  });
}

type ManualAccountType = 'CASH' | 'CARD' | 'CACC' | 'SVGS' | 'INVS' | 'ASST';

export async function createManualAccountCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    name: string;
    accountType: ManualAccountType;
    currency: string;
    alias?: string;
  },
) {
  const name = args.name.trim();
  if (!name) {
    throw new ConvexError('Account name is required');
  }

  const currency = args.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ConvexError('Currency must be a 3-letter code');
  }

  const providerConnectionId = await getOrCreateManualConnection(ctx, args.userId);
  const now = Date.now();
  const alias = args.alias?.trim();
  const accountId = await ctx.db.insert('financialAccounts', {
    userId: args.userId,
    providerConnectionId,
    provider: 'manual',
    name,
    alias: alias ? alias : undefined,
    accountType: args.accountType,
    accountSubtype: 'PRIV',
    currency,
    status: 'active',
    syncEnabled: false,
    createdAtMs: now,
    updatedAtMs: now,
  });

  // Opening zero snapshot so balance readers (dashboard/planning/accounts)
  // never see a missing balance for a manual account.
  await ctx.db.insert('accountBalances', {
    userId: args.userId,
    accountId,
    providerConnectionId,
    provider: 'manual',
    balanceType: 'closingBooked',
    amount: { amountMinor: 0n, currency },
    referenceDate: new Date(now).toISOString().slice(0, 10),
    fetchedAtMs: now,
  });

  return accountId;
}

export const createManualAccount = mutation({
  args: {
    name: v.string(),
    accountType: v.union(
      v.literal('CASH'),
      v.literal('CARD'),
      v.literal('CACC'),
      v.literal('SVGS'),
      v.literal('INVS'),
      v.literal('ASST'),
    ),
    currency: v.string(),
    alias: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await createManualAccountCore(ctx, { userId: user.id, ...args });
  },
});

export const setManualAccountBalance = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    amount: moneyAmountValidator,
    referenceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== user.id) {
      throw new ConvexError('Account not found');
    }
    if (account.provider !== 'manual') {
      throw new ConvexError('Only manual accounts accept manual balances');
    }
    if (args.amount.currency !== account.currency) {
      throw new ConvexError('Amount currency must match the account currency');
    }
    if (!account.providerConnectionId) {
      throw new ConvexError('Manual account is missing its provider connection');
    }

    const now = Date.now();
    const referenceDate = args.referenceDate ?? new Date(now).toISOString().slice(0, 10);
    const balanceId = await ctx.db.insert('accountBalances', {
      userId: user.id,
      accountId: account._id,
      providerConnectionId: account.providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: args.amount,
      referenceDate,
      fetchedAtMs: now,
    });
    if (account.accountType?.toUpperCase() === 'CARD') {
      await invalidatePlanSnapshots(ctx, user.id, [referenceDate]);
    }
    return balanceId;
  },
});
