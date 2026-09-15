import { ConvexError, v } from 'convex/values';

import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { savedReportConfigValidator } from '../lib/validators';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const MAX_SAVED_REPORTS = 20;
const MAX_NAME_LENGTH = 60;

type SavedReportConfig = Doc<'savedReports'>['config'];

function normalizeName(name: string) {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`Report name must contain 1 to ${MAX_NAME_LENGTH} characters`);
  }
  return normalized;
}

function validateConfig(config: SavedReportConfig) {
  if (config.datePreset === 'custom' && (!config.dateFrom?.trim() || !config.dateTo?.trim())) {
    throw new ConvexError('Custom date reports require dateFrom and dateTo');
  }
  if (
    config.amountMinMinor !== undefined &&
    config.amountMaxMinor !== undefined &&
    config.amountMinMinor > config.amountMaxMinor
  ) {
    throw new ConvexError('amountMinMinor must be less than or equal to amountMaxMinor');
  }
}

async function getOwnedReport(ctx: MutationCtx, userId: string, savedReportId: Id<'savedReports'>) {
  const report = await ctx.db.get('savedReports', savedReportId);
  if (!report || report.userId !== userId) {
    throw new ConvexError('Saved report not found');
  }
  return report;
}

export const listSavedReports = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return await ctx.db
      .query('savedReports')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(50);
  },
});

export const createSavedReport = mutation({
  args: {
    name: v.string(),
    config: savedReportConfigValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const name = normalizeName(args.name);
    validateConfig(args.config);
    const reports = await ctx.db
      .query('savedReports')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(MAX_SAVED_REPORTS + 1);
    if (reports.length >= MAX_SAVED_REPORTS) {
      throw new ConvexError(`At most ${MAX_SAVED_REPORTS} saved reports are allowed`);
    }

    const sortOrder = Math.max(0, ...reports.map((report) => report.sortOrder)) + 1;
    const now = Date.now();
    return await ctx.db.insert('savedReports', {
      userId: user.id,
      name,
      config: args.config,
      sortOrder,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const updateSavedReport = mutation({
  args: {
    savedReportId: v.id('savedReports'),
    name: v.optional(v.string()),
    config: v.optional(savedReportConfigValidator),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await getOwnedReport(ctx, user.id, args.savedReportId);
    const patch: {
      name?: string;
      config?: SavedReportConfig;
      sortOrder?: number;
      updatedAtMs: number;
    } = { updatedAtMs: Date.now() };

    if (args.name !== undefined) {
      patch.name = normalizeName(args.name);
    }
    if (args.config !== undefined) {
      validateConfig(args.config);
      patch.config = args.config;
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = args.sortOrder;
    }

    await ctx.db.patch('savedReports', args.savedReportId, patch);
    return await ctx.db.get('savedReports', args.savedReportId);
  },
});

export const deleteSavedReport = mutation({
  args: { savedReportId: v.id('savedReports') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await getOwnedReport(ctx, user.id, args.savedReportId);
    await ctx.db.delete('savedReports', args.savedReportId);
    return null;
  },
});
