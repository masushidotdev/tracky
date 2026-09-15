import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { accountGroupForType, isSpendableAccountType } from '../lib/accountTypes';
import { isLoanFacilityType } from '../lib/validators';
import { latestBookedBalance, preferredBookedBalance } from './balances';
import { buildConnectionHealth } from './connectionHealth';
import { availableBalance, overdraftLimitByAccount } from './overdraft';
import type { MoneyAmount } from './overdraft';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type SidebarAccountRow = {
  kind: 'account';
  id: Id<'financialAccounts'>;
  name: string;
  balance: MoneyAmount;
  status: Doc<'financialAccounts'>['status'];
  syncEnabled: boolean;
  linked: boolean;
};

type SidebarLoanRow = {
  kind: 'loan';
  id: Id<'creditFacilities'>;
  name: string;
  balance: MoneyAmount;
  status: Doc<'creditFacilities'>['status'];
};

type SidebarRow = SidebarAccountRow | SidebarLoanRow;

function sidebarRowsTotal(rows: Array<SidebarRow>) {
  const currencies = new Set(rows.map((row) => row.balance.currency));
  if (currencies.size !== 1) {
    return null;
  }
  return {
    amountMinor: rows.reduce((sum, row) => sum + row.balance.amountMinor, 0n),
    currency: [...currencies][0],
  };
}

function balanceHistoryDate(balance: Doc<'accountBalances'>) {
  return balance.referenceDate ?? new Date(balance.fetchedAtMs).toISOString().slice(0, 10);
}

function bookedBalanceByDate(balances: Array<Doc<'accountBalances'>>) {
  const byDate = new Map<string, Array<Doc<'accountBalances'>>>();

  for (const balance of balances) {
    const date = balanceHistoryDate(balance);
    byDate.set(date, [...(byDate.get(date) ?? []), balance]);
  }

  return [...byDate.entries()]
    .map(([date, dateBalances]) => ({
      date,
      balance: preferredBookedBalance(dateBalances),
    }))
    .filter((item): item is { date: string; balance: Doc<'accountBalances'> } => Boolean(item.balance));
}

function accountStableIdentityKey(account: Doc<'financialAccounts'>) {
  if (account.providerAccountHash) {
    return `hash:${account.providerAccountHash}`;
  }

  if (account.ibanMasked) {
    return `masked:${account.currency}:${account.accountType ?? ''}:${account.ibanMasked}`;
  }

  if (account.providerAccountId) {
    return `uid:${account.provider}:${account.providerAccountId}`;
  }

  // No provider-side identifier at all: the row can only stand for itself. Falling through to a
  // shared key here made every such account look like a copy of every other one.
  return `id:${account._id}`;
}

async function patchSyncStateForAccount(
  ctx: MutationCtx,
  accountId: Id<'financialAccounts'>,
  patch: Partial<Pick<Doc<'accountSyncStates'>, 'status' | 'nextSyncAfterMs' | 'updatedAtMs'>>,
) {
  const syncState = await ctx.db
    .query('accountSyncStates')
    .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
    .unique();

  if (syncState) {
    await ctx.db.patch('accountSyncStates', syncState._id, patch);
  }
}

export const listAccounts = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('active'),
        v.literal('reauthorizationRequired'),
        v.literal('paused'),
        v.literal('error'),
      ),
    ),
    limit: v.optional(v.number()),
    includeIds: v.optional(v.array(v.id('financialAccounts'))),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const includeIds = [...new Set(args.includeIds ?? [])];
    if (includeIds.length > 100) throw new ConvexError('At most 100 accounts can be included explicitly');

    const includedRows = await Promise.all(includeIds.map((accountId) => ctx.db.get('financialAccounts', accountId)));
    const included = includedRows.filter(
      (account): account is Doc<'financialAccounts'> => Boolean(account && account.userId === user.id),
    );
    const includedIds = new Set(included.map((account) => account._id));
    const visible = args.status
      ? await ctx.db
          .query('financialAccounts')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
          .take(200)
      : await ctx.db.query('financialAccounts').withIndex('by_userId', (q) => q.eq('userId', user.id)).take(200);

    return [
      ...included,
      ...visible
        .filter((account) => !account.hidden && !includedIds.has(account._id))
        .slice(0, Math.max(0, limit - included.length)),
    ];
  },
});

export const getAccount = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const accountId = ctx.db.normalizeId('financialAccounts', args.accountId);
    if (!accountId) return null;

    const account = await ctx.db.get('financialAccounts', accountId);
    return account?.userId === user.id ? account : null;
  },
});

export const listSidebarAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const [accounts, activeFacilities] = await Promise.all([
      ctx.db.query('financialAccounts').withIndex('by_userId', (q) => q.eq('userId', user.id)).take(200),
      ctx.db
        .query('creditFacilities')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
        .take(200),
    ]);
    const sidebarAccounts = accounts.filter(
      (account) => !account.hidden && accountGroupForType(account.accountType) !== 'asset',
    );
    const rows = await Promise.all(
      sidebarAccounts.map(async (account) => {
        const balance = await latestBookedBalance(ctx, account._id);
        const row: SidebarAccountRow = {
          kind: 'account',
          id: account._id,
          name: account.alias?.trim() || account.name,
          balance: { amountMinor: balance?.amount.amountMinor ?? 0n, currency: account.currency },
          status: account.status,
          syncEnabled: account.syncEnabled,
          // A manually kept account has no bank behind it, so it carries no connection mark.
          linked: account.provider !== 'manual',
        };
        return { group: accountGroupForType(account.accountType), row };
      }),
    );

    const groups = (['cash', 'credit'] as const).map((group) => {
      const groupRows = rows
        .filter((item) => item.group === group)
        .map((item) => item.row)
        .sort((left, right) => left.name.localeCompare(right.name));
      // Amounts are never summed across currencies: a mixed group shows no total.
      return { group, total: sidebarRowsTotal(groupRows), rows: groupRows };
    });
    // The loan page reads the debt from the amortisation plan, so the sidebar has to read it from
    // the same place: taking the facility's usedAmount instead showed two different figures for the
    // one loan, 13.141,67 here against 18.174,71 there.
    const loanFacilities = activeFacilities.filter((facility) => isLoanFacilityType(facility.facilityType));
    const loanRows: Array<SidebarLoanRow> = (
      await Promise.all(
        loanFacilities.map(async (facility) => {
          const plans = await ctx.db
            .query('creditFacilityInstallmentPlans')
            .withIndex('by_creditFacilityId_and_status', (q) =>
              q.eq('creditFacilityId', facility._id).eq('status', 'active'),
            )
            .take(5);
          const outstanding = plans.find((plan) => plan.userId === user.id)?.outstandingAmount ?? facility.usedAmount;

          return {
            kind: 'loan' as const,
            id: facility._id,
            name: facility.name,
            balance: {
              amountMinor: outstanding.amountMinor > 0n ? -outstanding.amountMinor : 0n,
              currency: outstanding.currency,
            },
            status: facility.status,
          };
        }),
      )
    ).sort((left, right) => left.name.localeCompare(right.name));

    return {
      groups: [...groups, { group: 'loan' as const, total: sidebarRowsTotal(loanRows), rows: loanRows }],
    };
  },
});

export const listEligibleAccountsOutsidePlans = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const [accounts, plans] = await Promise.all([
      ctx.db.query('financialAccounts').withIndex('by_userId', (q) => q.eq('userId', user.id)).take(200),
      ctx.db.query('plans').withIndex('by_userId', (q) => q.eq('userId', user.id)).take(200),
    ]);
    const plannedAccountIds = new Set(plans.flatMap((plan) => plan.accountIds));

    return accounts.filter(
      (account) =>
        !plannedAccountIds.has(account._id) &&
        !account.hidden &&
        account.status === 'active' &&
        account.currency.toUpperCase() === 'EUR' &&
        (isSpendableAccountType(account.accountType) || account.accountType?.toUpperCase() === 'CARD'),
    );
  },
});

export const listConnections = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 50, 100);

    const connections = await ctx.db
      .query('providerConnections')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(limit);

    return connections.map((connection) => ({
      ...connection,
      health: buildConnectionHealth(connection),
    }));
  },
});

export const getAuthRequestStatus = query({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const request = await ctx.db
      .query('providerAuthRequests')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique();

    if (!request || request.userId !== user.id) {
      return null;
    }

    return {
      provider: request.provider,
      status: request.status,
      aspspName: request.aspspName,
      aspspCountry: request.aspspCountry,
      errorCode: request.errorCode,
      errorMessage: request.errorMessage,
      createdAtMs: request.createdAtMs,
      completedAtMs: request.completedAtMs,
    };
  },
});

export const listSyncOverview = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const syncStates = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(limit);

    type OverviewRow = {
      syncState: Doc<'accountSyncStates'> | null;
      account: Doc<'financialAccounts'>;
      connection: Doc<'providerConnections'> | null;
      connectionHealth: ReturnType<typeof buildConnectionHealth> | null;
      latestBalance: Doc<'accountBalances'> | null;
      latestBalances: Array<Doc<'accountBalances'>>;
      // The accounts section is the one place an arranged overdraft belongs: `latestBalance` is
      // the accounting position everywhere in the app, and the credit line is shown beside it
      // rather than folded into it.
      overdraftLimit: MoneyAmount | null;
      availableBalance: MoneyAmount | null;
    };

    const overdraftLimits = await overdraftLimitByAccount(ctx, user.id);
    const overview: Array<OverviewRow> = [];
    for (const syncState of syncStates) {
      const account = await ctx.db.get('financialAccounts', syncState.accountId);
      const connection = await ctx.db.get('providerConnections', syncState.providerConnectionId);

      if (!account || !connection || account.userId !== user.id || connection.userId !== user.id) {
        continue;
      }

      if (account.status === 'paused' && !account.syncEnabled) {
        continue;
      }

      const latestBalances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', account._id))
        .order('desc')
        .take(10);
      const booked = preferredBookedBalance(latestBalances) ?? null;
      const overdraftLimit = overdraftLimits.get(account._id) ?? null;

      overview.push({
        syncState,
        account,
        connection,
        connectionHealth: buildConnectionHealth(connection),
        latestBalance: booked,
        latestBalances,
        overdraftLimit,
        availableBalance:
          booked && overdraftLimit ? availableBalance(booked.amount, overdraftLimit) : null,
      });
    }

    // Manual accounts have no sync state; they still belong in the accounts
    // overview, just without any sync machinery attached.
    const allAccounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);
    for (const account of allAccounts) {
      if (account.provider !== 'manual' || account.status !== 'active') {
        continue;
      }

      const latestBalances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', account._id))
        .order('desc')
        .take(10);

      const booked = preferredBookedBalance(latestBalances) ?? null;
      const overdraftLimit = overdraftLimits.get(account._id) ?? null;

      overview.push({
        syncState: null,
        account,
        connection: null,
        connectionHealth: null,
        latestBalance: booked,
        latestBalances,
        overdraftLimit,
        availableBalance:
          booked && overdraftLimit ? availableBalance(booked.amount, overdraftLimit) : null,
      });
    }

    return overview;
  },
});

export const getBalanceHistory = query({
  args: {
    accountId: v.optional(v.id('financialAccounts')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 180, 500);

    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id) {
        throw new ConvexError('Account not found');
      }

      const balances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', args.accountId!))
        .order('desc')
        .take(limit);

      return bookedBalanceByDate(balances)
        .sort((left, right) => left.date.localeCompare(right.date))
        .map(({ balance, date }) => ({
          date,
          amount: balance.amount,
        }));
    }

    const accounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);
    const hiddenAccountIds = new Set(accounts.filter((account) => account.hidden).map((account) => account._id));
    const balances = await ctx.db
      .query('accountBalances')
      .withIndex('by_userId_and_fetchedAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(limit);
    const balancesByAccountAndDate = new Map<string, { date: string; balances: Array<Doc<'accountBalances'>> }>();

    for (const balance of balances) {
      if (hiddenAccountIds.has(balance.accountId)) {
        continue;
      }
      const date = balanceHistoryDate(balance);
      const key = `${balance.accountId}:${date}`;
      const existing = balancesByAccountAndDate.get(key);
      if (existing) {
        existing.balances.push(balance);
      } else {
        balancesByAccountAndDate.set(key, { date, balances: [balance] });
      }
    }

    const latestCurrency = balances[0]?.amount.currency;
    if (!latestCurrency) {
      return [];
    }

    const totalsByDate = new Map<string, bigint>();
    for (const { balances: dateBalances, date } of balancesByAccountAndDate.values()) {
      const balance = preferredBookedBalance(dateBalances);
      if (!balance || !latestCurrency || balance.amount.currency !== latestCurrency) {
        continue;
      }
      totalsByDate.set(date, (totalsByDate.get(date) ?? 0n) + balance.amount.amountMinor);
    }

    return [...totalsByDate.entries()]
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, amountMinor]) => ({
        date,
        amount: {
          amountMinor,
          currency: latestCurrency,
        },
      }));
  },
});

export const repairDuplicateAccountIdentities = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    let repairedGroups = 0;
    let pausedAccounts = 0;

    {
      // Grouped across the whole user, not per connection: reconnecting a bank produces a second
      // connection holding copies of the same accounts, and a per-connection pass never sees them
      // side by side.
      const accounts = await ctx.db
        .query('financialAccounts')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(500);
      const accountsByIdentity = new Map<string, Array<Doc<'financialAccounts'>>>();

      // Only a provider reconnection can duplicate an account. Manual accounts are created one by
      // one by the user and carry no provider identity, so they are never candidates for a merge.
      for (const account of accounts.filter((candidate) => candidate.provider === 'enableBanking')) {
        const key = accountStableIdentityKey(account);
        accountsByIdentity.set(key, [...(accountsByIdentity.get(key) ?? []), account]);
      }

      for (const duplicates of accountsByIdentity.values()) {
        if (duplicates.length < 2) {
          continue;
        }

        const sorted = [...duplicates].sort((left, right) => left.createdAtMs - right.createdAtMs);
        const canonical = sorted[0];
        const source = [...sorted]
          .reverse()
          .find((account) => account.status === 'active' && account.syncEnabled) ?? sorted[sorted.length - 1];

        await ctx.db.patch('financialAccounts', canonical._id, {
          // The surviving row takes the newest working connection, or it would keep syncing
          // through the consent the user just replaced.
          providerConnectionId: source.providerConnectionId,
          providerAccountId: source.providerAccountId,
          providerAccountHash: source.providerAccountHash,
          name: source.name,
          officialName: source.officialName,
          institutionName: source.institutionName,
          accountType: source.accountType,
          accountSubtype: source.accountSubtype,
          currency: source.currency,
          ibanMasked: source.ibanMasked,
          status: 'active',
          syncEnabled: true,
          updatedAtMs: now,
        });
        await patchSyncStateForAccount(ctx, canonical._id, {
          status: 'active',
          nextSyncAfterMs: now,
          updatedAtMs: now,
        });

        for (const duplicate of sorted.slice(1)) {
          await ctx.db.patch('financialAccounts', duplicate._id, {
            status: 'paused',
            syncEnabled: false,
            updatedAtMs: now,
          });
          await patchSyncStateForAccount(ctx, duplicate._id, {
            status: 'paused',
            updatedAtMs: now,
          });
          pausedAccounts += 1;
        }

        repairedGroups += 1;
      }
    }

    return { pausedAccounts, repairedGroups };
  },
});

export const listImportJobs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 20, 50);
    const jobs = await ctx.db
      .query('importJobs')
      .withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(limit);

    const rows = [];
    for (const job of jobs) {
      const account = job.accountId ? await ctx.db.get('financialAccounts', job.accountId) : null;
      const connection = job.providerConnectionId ? await ctx.db.get('providerConnections', job.providerConnectionId) : null;

      rows.push({
        job,
        account: account && account.userId === user.id ? account : null,
        connection: connection && connection.userId === user.id ? connection : null,
      });
    }

    return rows;
  },
});

export const setAccountSyncEnabled = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    syncEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const account = await ctx.db.get('financialAccounts', args.accountId);

    if (!account || account.userId !== user.id) {
      throw new ConvexError('Account not found');
    }

    if (account.provider === 'manual') {
      throw new ConvexError('Manual accounts cannot be synced');
    }

    if (!account.providerConnectionId) {
      throw new ConvexError('Provider connection not found');
    }

    const connection = await ctx.db.get('providerConnections', account.providerConnectionId);
    if (!connection || connection.userId !== user.id) {
      throw new ConvexError('Provider connection not found');
    }

    if (args.syncEnabled && buildConnectionHealth(connection).requiresReauthorization) {
      throw new ConvexError('Reconnect this bank before resuming sync');
    }

    const syncState = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
      .unique();

    if (!syncState || syncState.userId !== user.id) {
      throw new ConvexError('Account sync state not found');
    }

    const now = Date.now();
    await ctx.db.patch('financialAccounts', account._id, {
      syncEnabled: args.syncEnabled,
      updatedAtMs: now,
    });

    await ctx.db.patch('accountSyncStates', syncState._id, {
      status: args.syncEnabled ? 'active' : 'paused',
      nextSyncAfterMs: args.syncEnabled ? now : syncState.nextSyncAfterMs,
      lastErrorCode: args.syncEnabled ? undefined : syncState.lastErrorCode,
      lastErrorMessage: args.syncEnabled ? undefined : syncState.lastErrorMessage,
      updatedAtMs: now,
    });

    return account._id;
  },
});

export const setAccountHidden = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const account = await ctx.db.get('financialAccounts', args.accountId);

    if (!account || account.userId !== user.id) {
      throw new ConvexError('Account not found');
    }

    await ctx.db.patch('financialAccounts', account._id, {
      hidden: args.hidden,
      updatedAtMs: Date.now(),
    });

    return account._id;
  },
});

export const setAccountAlias = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    alias: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const account = await ctx.db.get('financialAccounts', args.accountId);

    if (!account || account.userId !== user.id) {
      throw new ConvexError('Account not found');
    }

    await ctx.db.patch('financialAccounts', account._id, {
      alias: args.alias?.trim() || null,
      updatedAtMs: Date.now(),
    });

    return account._id;
  },
});
