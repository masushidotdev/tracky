import { ConvexError, v } from 'convex/values';
import { internalQuery } from '../_generated/server';

export const getAuthRequestByState = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('providerAuthRequests')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique();
  },
});

export const listDueSyncStates = internalQuery({
  args: {
    nowMs: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_status_and_nextSyncAfterMs', (q) => q.eq('status', 'active').lte('nextSyncAfterMs', args.nowMs))
      .take(args.limit);

    if (active.length >= args.limit) {
      return active;
    }

    const rateLimited = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_status_and_nextSyncAfterMs', (q) =>
        q.eq('status', 'rateLimited').lte('nextSyncAfterMs', args.nowMs),
      )
      .take(args.limit - active.length);

    if (active.length + rateLimited.length >= args.limit) {
      return [...active, ...rateLimited];
    }

    const errors = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_status_and_nextSyncAfterMs', (q) =>
        q.eq('status', 'error').lte('nextSyncAfterMs', args.nowMs),
      )
      .take(args.limit - active.length - rateLimited.length);

    return [...active, ...rateLimited, ...errors];
  },
});

export const getSyncBundle = internalQuery({
  args: {
    syncStateId: v.id('accountSyncStates'),
  },
  handler: async (ctx, args) => {
    const syncState = await ctx.db.get('accountSyncStates', args.syncStateId);
    if (!syncState) {
      return null;
    }

    const account = await ctx.db.get('financialAccounts', syncState.accountId);
    const connection = await ctx.db.get('providerConnections', syncState.providerConnectionId);

    if (!account || !connection) {
      return null;
    }

    return {
      syncState,
      account,
      connection,
    };
  },
});

export const getManualSyncTarget = internalQuery({
  args: {
    userId: v.string(),
    accountId: v.id('financialAccounts'),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== args.userId) {
      return null;
    }

    const syncState = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
      .unique();

    if (!syncState || syncState.userId !== args.userId) {
      return null;
    }

    if (!account.providerConnectionId) {
      throw new ConvexError('Provider connection not found');
    }

    const connection = await ctx.db.get('providerConnections', account.providerConnectionId);
    if (!connection || connection.userId !== args.userId) {
      return null;
    }

    return {
      account,
      connection,
      syncState,
    };
  },
});

export const listActiveSyncStatesForConnection = internalQuery({
  args: {
    providerConnectionId: v.id('providerConnections'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);
    if (!connection) {
      return [];
    }

    const accounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', args.providerConnectionId))
      .take(limit);
    const syncStates = [];

    for (const account of accounts) {
      if (!account.syncEnabled || account.status !== 'active') {
        continue;
      }

      const syncState = await ctx.db
        .query('accountSyncStates')
        .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
        .unique();

      if (!syncState || syncState.status !== 'active') {
        continue;
      }

      syncStates.push(syncState);
    }

    return syncStates;
  },
});

export const getConnectionForReauthorization = internalQuery({
  args: {
    userId: v.string(),
    providerConnectionId: v.id('providerConnections'),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get('providerConnections', args.providerConnectionId);
    if (!connection || connection.userId !== args.userId || connection.provider !== 'enableBanking') {
      return null;
    }

    return connection;
  },
});
