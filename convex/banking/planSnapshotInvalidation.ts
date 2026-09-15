import { ConvexError } from 'convex/values';
import { currentPeriod } from './planActivity';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const MAX_PLAN_ROWS = 500;
const SNAPSHOT_STABILITY_MONTHS = 2;

function addMonths(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

function assertBounded<T>(rows: Array<T>, label: string) {
  if (rows.length > MAX_PLAN_ROWS) throw new ConvexError(`Too many ${label} to read`);
  return rows;
}

export async function invalidatePlanSnapshots(
  ctx: MutationCtx,
  userId: string,
  dates: Iterable<string | undefined>,
) {
  let earliestPeriod: string | undefined;
  for (const date of dates) {
    if (!date) continue;
    const period = date.slice(0, 7);
    if (!earliestPeriod || period < earliestPeriod) earliestPeriod = period;
  }
  if (!earliestPeriod || earliestPeriod > addMonths(currentPeriod(), -SNAPSHOT_STABILITY_MONTHS)) return;

  const plans = assertBounded(
    await ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_ROWS + 1),
    'plans',
  );
  for (const plan of plans) {
    const snapshots = assertBounded(
      await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id).gte('period', earliestPeriod))
        .take(MAX_PLAN_ROWS + 1),
      'plan snapshots',
    );
    // Reads rebuild and cache atomically, so deletion cannot expose a half-recomputed cache.
    await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
  }
}

export async function invalidateAllPlanSnapshots(ctx: MutationCtx, userId: string) {
  const plans = assertBounded(
    await ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_ROWS + 1),
    'plans',
  );
  for (const plan of plans) {
    const snapshots = assertBounded(
      await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id))
        .take(MAX_PLAN_ROWS + 1),
      'plan snapshots',
    );
    await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
  }
}

export async function invalidatePlanSnapshotsByPlanId(ctx: MutationCtx, planId: Id<'plans'>) {
  const snapshots = assertBounded(
    await ctx.db
      .query('planMonthSnapshots')
      .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
      .take(MAX_PLAN_ROWS + 1),
    'plan snapshots',
  );
  await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
  return snapshots.length;
}
