import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, mutation } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isSpendableAccountType } from '../lib/accountTypes';
import { FEATURES, resolveTier } from '../lib/entitlements';
import { currentDate, currentPeriod } from './planActivity';
import { underfundedPriority } from './planMath';
import { activePlanForUser, computePlanMonthState } from './planRead';
import { invalidateAllPlanSnapshots, invalidatePlanSnapshotsByPlanId } from './planSnapshotInvalidation';
import {
  CARD_PAYMENTS_GROUP_NAME,
  INSTALLMENTS_GROUP_NAME,
  detachPlanSystemBuckets,
  isGeneratedInstallmentBucket,
  isSystemPlanGroupName,
  loadActiveOwnedInstallmentPlans,
  reconcileInstallmentPlanBuckets,
} from './planSystemBuckets';
import { positiveCeilDivide } from './planningMath';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const SORT_ORDER_STEP = 1000;
const MAX_PLAN_ROWS = 500;
const PLAN_CLEANUP_BATCH_SIZE = 50;

const targetCadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('monthly'),
  v.literal('yearly'),
  v.literal('custom'),
);
const targetBehaviourValidator = v.union(v.literal('setAside'), v.literal('refill'), v.literal('balanceBy'));
const autoAssignStrategyValidator = v.union(
  v.literal('underfunded'),
  v.literal('assignedLastMonth'),
  v.literal('spentLastMonth'),
  v.literal('averageAssigned'),
  v.literal('resetAssigned'),
  v.literal('resetAvailable'),
);

const CURATED_GROUPS = [
  { key: 'cardPayments', name: CARD_PAYMENTS_GROUP_NAME },
  { key: 'installments', name: INSTALLMENTS_GROUP_NAME },
  { key: 'home', name: 'Home & bills' },
  { key: 'everyday', name: 'Everyday' },
  { key: 'transport', name: 'Transport' },
  { key: 'leisure', name: 'Leisure' },
  { key: 'health', name: 'Health' },
  { key: 'savings', name: 'Savings & goals' },
  { key: 'other', name: 'Other' },
] as const;

type CuratedGroupKey = (typeof CURATED_GROUPS)[number]['key'];
type DroppedPlanAccountReason = 'hidden' | 'inactive' | 'currencyMismatch' | 'ineligibleType';

function normalizeName(name: string, label: string) {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 60) {
    throw new ConvexError(`${label} name must be between 2 and 60 characters`);
  }
  return normalized;
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ConvexError('Currency must be a 3-letter code');
  }
  return normalized;
}

function assertPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new ConvexError('Period must use YYYY-MM format');
  }
}

function addMonths(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new ConvexError(`${label} must use YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new ConvexError(`${label} must be a valid date`);
}

function assertTargetDefinition(args: {
  cadence: 'weekly' | 'monthly' | 'yearly' | 'custom';
  behaviour: 'setAside' | 'refill' | 'balanceBy';
  amountMinor: bigint;
  dueDate?: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  repeats: boolean;
  repeatIntervalCount?: number;
  repeatIntervalUnit?: 'month' | 'year';
}) {
  if (args.amountMinor <= 0n) throw new ConvexError('Target amount must be greater than zero');
  if (args.dueDate) assertIsoDate(args.dueDate, 'Target due date');
  if (args.behaviour === 'balanceBy' && (args.cadence !== 'custom' || args.repeats)) {
    throw new ConvexError('Balance-by targets must use custom cadence and cannot repeat');
  }
  if ((args.cadence === 'yearly' || args.cadence === 'custom') && !args.dueDate) {
    throw new ConvexError('Yearly and custom targets require a due date');
  }
  if (args.cadence === 'weekly') {
    if (!Number.isInteger(args.dayOfWeek) || args.dayOfWeek! < 0 || args.dayOfWeek! > 6) {
      throw new ConvexError('Weekly targets require a weekday from 0 to 6');
    }
    if (!args.repeats) throw new ConvexError('Weekly targets must repeat');
  } else if (args.dayOfWeek !== undefined) {
    throw new ConvexError('Only weekly targets can set a weekday');
  }
  if (args.cadence === 'monthly') {
    if (
      args.dayOfMonth !== undefined &&
      (!Number.isInteger(args.dayOfMonth) || args.dayOfMonth < 1 || args.dayOfMonth > 31)
    ) {
      throw new ConvexError('Monthly target day must be between 1 and 31');
    }
    if (!args.repeats) throw new ConvexError('Monthly targets must repeat');
  } else if (args.dayOfMonth !== undefined) {
    throw new ConvexError('Only monthly targets can set a day of month');
  }
  if (args.cadence === 'yearly' && !args.repeats) throw new ConvexError('Yearly targets must repeat');
  const hasRepeatIntervalCount = args.repeatIntervalCount !== undefined;
  const hasRepeatIntervalUnit = args.repeatIntervalUnit !== undefined;
  if (hasRepeatIntervalCount !== hasRepeatIntervalUnit) {
    throw new ConvexError('Custom target repeat interval requires both a count and a unit');
  }
  if (hasRepeatIntervalCount) {
    if (
      args.cadence !== 'custom' ||
      !args.repeats ||
      !Number.isInteger(args.repeatIntervalCount) ||
      args.repeatIntervalCount! <= 0
    ) {
      throw new ConvexError('Custom target repeat interval requires a positive integer on a repeating custom target');
    }
  }
}

function assertBounded<T>(rows: Array<T>, label: string) {
  if (rows.length > MAX_PLAN_ROWS) {
    throw new ConvexError(`Too many ${label} to update in one mutation`);
  }
  return rows;
}

function groupKeyForCategory(category: Doc<'categories'>): CuratedGroupKey {
  switch (category.systemKey) {
    case 'expense:housing':
    case 'expense:utilities':
    case 'expense:insurance':
    case 'expense:subscriptions':
      return 'home';
    case 'expense:groceries':
    case 'expense:dining':
    case 'expense:shopping':
    case 'category:gift':
    case 'category:services':
      return 'everyday';
    case 'expense:transport':
    case 'expense:cash':
      return 'transport';
    case 'expense:travel':
    case 'expense:entertainment':
    case 'expense:education':
    case 'expense:child_allowance':
      return 'leisure';
    case 'expense:healthcare':
      return 'health';
    case 'category:savings':
    case 'category:donations':
    case 'category:remittances':
      return 'savings';
    default:
      return 'other';
  }
}

/**
 * The second plan onwards is a Pro feature, and the check lives here rather than only in the UI:
 * a hidden button is a suggestion, a thrown mutation is the rule.
 */
async function assertCanCreateAnotherPlan(ctx: MutationCtx, userId: string, existingPlans: number) {
  if (existingPlans === 0) return;
  const settings = await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
  if (!FEATURES['plan.multiplePlans'][resolveTier(settings)]) {
    throw new ConvexError('Multiple plans require the Pro tier');
  }
}

async function requireOwnedPlan(ctx: MutationCtx, userId: string, planId: Id<'plans'>) {
  const plan = await ctx.db.get('plans', planId);
  if (!plan || plan.userId !== userId) throw new ConvexError('Plan not found');
  return plan;
}

async function requireOwnedGroup(ctx: MutationCtx, userId: string, groupId: Id<'planGroups'>) {
  const group = await ctx.db.get('planGroups', groupId);
  if (!group || group.userId !== userId) throw new ConvexError('Plan group not found');
  return group;
}

async function requireOwnedBucket(ctx: MutationCtx, userId: string, bucketId: Id<'planBuckets'>) {
  const bucket = await ctx.db.get('planBuckets', bucketId);
  if (!bucket || bucket.userId !== userId) throw new ConvexError('Plan bucket not found');
  return bucket;
}

async function requireOwnedCategory(ctx: MutationCtx, userId: string, categoryId: Id<'categories'>) {
  const category = await ctx.db.get('categories', categoryId);
  if (!category || category.userId !== userId) throw new ConvexError('Category not found');
  return category;
}

async function planGroups(ctx: MutationCtx, planId: Id<'plans'>) {
  return assertBounded(
    await ctx.db
      .query('planGroups')
      .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
      .take(MAX_PLAN_ROWS + 1),
    'plan groups',
  );
}

async function planBuckets(ctx: MutationCtx, planId: Id<'plans'>) {
  return assertBounded(
    await ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
      .take(MAX_PLAN_ROWS + 1),
    'plan buckets',
  );
}

async function assertMutableGroup(ctx: MutationCtx, group: Doc<'planGroups'>) {
  if (group.name === CARD_PAYMENTS_GROUP_NAME) throw new ConvexError('The Card payments group cannot be changed');
  if (group.name === INSTALLMENTS_GROUP_NAME) throw new ConvexError('The Instalments group cannot be changed');
  const buckets = assertBounded(
    await ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', group.planId).eq('groupId', group._id))
      .take(MAX_PLAN_ROWS + 1),
    'plan buckets',
  );
  if (buckets.some((bucket) => bucket.cardAccountId)) {
    throw new ConvexError('The Card payments group cannot be changed');
  }
  if (buckets.some((bucket) => bucket.installmentPlanId)) {
    throw new ConvexError('The Instalments group cannot be changed');
  }
}

async function unplannedBucket(ctx: MutationCtx, planId: Id<'plans'>) {
  const bucket = (await planBuckets(ctx, planId)).find((candidate) => candidate.isUnplanned);
  if (!bucket) throw new ConvexError('Unplanned bucket not found');
  return bucket;
}

function cardPaymentBucketName(account: Doc<'financialAccounts'>) {
  return account.alias?.trim() || account.name.trim();
}

export async function reconcileCardPaymentBuckets(
  ctx: MutationCtx,
  plan: Doc<'plans'>,
  eligibleAccounts: Array<Doc<'financialAccounts'>>,
) {
  const cardAccounts = eligibleAccounts.filter((account) => account.accountType?.toUpperCase() === 'CARD');
  const [groups, buckets] = await Promise.all([planGroups(ctx, plan._id), planBuckets(ctx, plan._id)]);
  const existingCardBuckets = buckets.filter((bucket) => bucket.cardAccountId !== undefined);
  let group =
    existingCardBuckets.length > 0
      ? groups.find((candidate) => candidate._id === existingCardBuckets[0].groupId)
      : groups.find((candidate) => candidate.name === CARD_PAYMENTS_GROUP_NAME);
  let createdGroup = false;
  let changed = false;
  const now = Date.now();

  if (!group) {
    const groupId = await ctx.db.insert('planGroups', {
      planId: plan._id,
      userId: plan.userId,
      name: CARD_PAYMENTS_GROUP_NAME,
      sortOrder: 0,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const created = await ctx.db.get('planGroups', groupId);
    if (!created) throw new ConvexError('Card payments group could not be created');
    group = created;
    createdGroup = true;
    changed = true;
  } else if (group.name !== CARD_PAYMENTS_GROUP_NAME || group.sortOrder !== 0 || group.hidden) {
    await ctx.db.patch('planGroups', group._id, {
      name: CARD_PAYMENTS_GROUP_NAME,
      sortOrder: 0,
      hidden: false,
      updatedAtMs: now,
    });
    changed = true;
  }

  const desiredAccountIds = new Set(cardAccounts.map((account) => account._id));
  const bucketByAccountId = new Map<Id<'financialAccounts'>, Doc<'planBuckets'>>();
  const bucketsToDetach: Array<Doc<'planBuckets'>> = [];
  for (const bucket of existingCardBuckets) {
    const accountId = bucket.cardAccountId;
    if (!accountId || !desiredAccountIds.has(accountId) || bucketByAccountId.has(accountId)) {
      bucketsToDetach.push(bucket);
    } else {
      bucketByAccountId.set(accountId, bucket);
    }
  }
  if (bucketsToDetach.length > 0) {
    await detachPlanSystemBuckets(ctx, {
      plan,
      groups,
      buckets,
      systemGroupId: group._id,
      bucketsToDetach,
    });
    changed = true;
  }

  let createdBuckets = 0;
  for (const [index, account] of cardAccounts.entries()) {
    const name = cardPaymentBucketName(account);
    const sortOrder = (index + 1) * SORT_ORDER_STEP;
    const existing = bucketByAccountId.get(account._id);
    if (existing) {
      if (
        existing.groupId !== group._id ||
        existing.name !== name ||
        existing.sortOrder !== sortOrder ||
        existing.hidden ||
        existing.isUnplanned
      ) {
        await ctx.db.patch('planBuckets', existing._id, {
          groupId: group._id,
          name,
          sortOrder,
          hidden: false,
          isUnplanned: false,
          cardAccountId: account._id,
          updatedAtMs: now,
        });
        changed = true;
      }
      continue;
    }

    await ctx.db.insert('planBuckets', {
      planId: plan._id,
      userId: plan.userId,
      groupId: group._id,
      name,
      sortOrder,
      hidden: false,
      isUnplanned: false,
      cardAccountId: account._id,
      createdAtMs: now,
      updatedAtMs: now,
    });
    createdBuckets += 1;
    changed = true;
  }

  return { changed, createdGroup, createdBuckets, detachedBuckets: bucketsToDetach.length };
}

async function schedulePlanSnapshots(ctx: MutationCtx, plan: Doc<'plans'>, fromPeriod: string) {
  if (fromPeriod > currentPeriod()) return;
  await ctx.scheduler.runAfter(0, internal.banking.planRead.recomputePlanSnapshots, {
    planId: plan._id,
    fromPeriod: fromPeriod < plan.startPeriod ? plan.startPeriod : fromPeriod,
  });
}

export async function ensurePlanBucketForCategory(ctx: MutationCtx, userId: string, category: Doc<'categories'>) {
  if (category.userId !== userId || !category.budgetEligible) return null;
  const plan = await activePlanForUser(ctx, userId);
  if (!plan) return null;

  const existingMapping = await ctx.db
    .query('planBucketCategories')
    .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', plan._id).eq('categoryId', category._id))
    .unique();
  if (existingMapping) return existingMapping.bucketId;

  const groups = await planGroups(ctx, plan._id);
  const groupKey = groupKeyForCategory(category);
  const groupName = CURATED_GROUPS.find((definition) => definition.key === groupKey)?.name;
  let group = groups.find((candidate) => candidate.name === groupName);
  group ??= groups.find((candidate) => candidate.name === 'Other');
  if (!group) {
    const now = Date.now();
    const groupId = await ctx.db.insert('planGroups', {
      planId: plan._id,
      userId,
      name: 'Other',
      sortOrder: Math.max(0, ...groups.map((candidate) => candidate.sortOrder)) + SORT_ORDER_STEP,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const createdGroup = await ctx.db.get('planGroups', groupId);
    if (!createdGroup) throw new ConvexError('Fallback group could not be created');
    group = createdGroup;
  }

  const buckets = assertBounded(
    await ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id).eq('groupId', group._id))
      .take(MAX_PLAN_ROWS + 1),
    'plan buckets',
  );
  const now = Date.now();
  const bucketId = await ctx.db.insert('planBuckets', {
    planId: plan._id,
    userId,
    groupId: group._id,
    name: category.name,
    sortOrder: Math.max(0, ...buckets.map((bucket) => bucket.sortOrder)) + SORT_ORDER_STEP,
    hidden: false,
    isUnplanned: false,
    createdAtMs: now,
    updatedAtMs: now,
  });
  await ctx.db.insert('planBucketCategories', {
    planId: plan._id,
    userId,
    bucketId,
    categoryId: category._id,
    createdAtMs: now,
    updatedAtMs: now,
  });
  await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
  return bucketId;
}

async function assertUniqueCategoryName(ctx: MutationCtx, userId: string, name: string) {
  const categories = assertBounded(
    await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_ROWS + 1),
    'categories',
  );
  const normalizedName = name.toLocaleLowerCase();
  if (categories.some((category) => category.name.trim().toLocaleLowerCase() === normalizedName)) {
    throw new ConvexError('A category with this name already exists');
  }
}

async function upsertAssignment(
  ctx: MutationCtx,
  args: {
    plan: Doc<'plans'>;
    bucket: Doc<'planBuckets'>;
    period: string;
    amountMinor: bigint;
  },
) {
  const existing = await ctx.db
    .query('planAssignments')
    .withIndex('by_planId_and_period_and_bucketId', (q) =>
      q.eq('planId', args.plan._id).eq('period', args.period).eq('bucketId', args.bucket._id),
    )
    .unique();

  if (args.amountMinor === 0n) {
    if (existing) await ctx.db.delete('planAssignments', existing._id);
    return null;
  }

  const now = Date.now();
  if (existing) {
    await ctx.db.patch('planAssignments', existing._id, {
      assignedMinor: args.amountMinor,
      currency: args.plan.currency,
      updatedAtMs: now,
    });
    return existing._id;
  }

  return await ctx.db.insert('planAssignments', {
    planId: args.plan._id,
    userId: args.plan.userId,
    bucketId: args.bucket._id,
    period: args.period,
    assignedMinor: args.amountMinor,
    currency: args.plan.currency,
    createdAtMs: now,
    updatedAtMs: now,
  });
}

export async function setAssignedForUser(
  ctx: MutationCtx,
  args: {
    userId: string;
    planId: Id<'plans'>;
    bucketId: Id<'planBuckets'>;
    period: string;
    amountMinor: bigint;
    scheduleSnapshots?: boolean;
  },
) {
  assertPeriod(args.period);
  const plan = await requireOwnedPlan(ctx, args.userId, args.planId);
  const bucket = await requireOwnedBucket(ctx, args.userId, args.bucketId);
  if (bucket.planId !== plan._id) throw new ConvexError('Plan bucket not found');
  const assignmentId = await upsertAssignment(ctx, {
    plan,
    bucket,
    period: args.period,
    amountMinor: args.amountMinor,
  });
  if (args.scheduleSnapshots !== false) await schedulePlanSnapshots(ctx, plan, args.period);
  return assignmentId;
}

export async function setTargetForUser(
  ctx: MutationCtx,
  args: {
    userId: string;
    bucketId: Id<'planBuckets'>;
    cadence: 'weekly' | 'monthly' | 'yearly' | 'custom';
    behaviour: 'setAside' | 'refill' | 'balanceBy';
    amountMinor: bigint;
    dueDate?: string;
    dayOfMonth?: number;
    dayOfWeek?: number;
    repeats: boolean;
    repeatIntervalCount?: number;
    repeatIntervalUnit?: 'month' | 'year';
  },
) {
  const bucket = await requireOwnedBucket(ctx, args.userId, args.bucketId);
  const plan = await requireOwnedPlan(ctx, args.userId, bucket.planId);
  if (bucket.isUnplanned) throw new ConvexError('The Unplanned bucket cannot have a target');
  assertTargetDefinition(args);
  const existing = await ctx.db
    .query('planTargets')
    .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', plan._id).eq('bucketId', bucket._id))
    .unique();
  const target = {
    cadence: args.cadence,
    behaviour: args.behaviour,
    amountMinor: args.amountMinor,
    currency: plan.currency,
    dueDate: args.dueDate,
    dayOfMonth: args.dayOfMonth,
    dayOfWeek: args.dayOfWeek,
    repeats: args.repeats,
    repeatIntervalCount: args.repeatIntervalCount,
    repeatIntervalUnit: args.repeatIntervalUnit,
  };
  if (existing) {
    await ctx.db.patch('planTargets', existing._id, target);
    return existing._id;
  }
  return await ctx.db.insert('planTargets', {
    planId: plan._id,
    userId: args.userId,
    bucketId: bucket._id,
    ...target,
    snoozedPeriods: [],
  });
}

/**
 * New members must be visible, active accounts of the plan currency that money is spent from.
 * Existing inactive members stay frozen in place until the user removes them; hidden accounts do
 * not. The caller gets the accounts it can keep plus a reason for each one left out.
 */
export async function resolveEligiblePlanAccounts(
  ctx: MutationCtx,
  args: {
    userId: string;
    currency: string;
    accountIds: Array<Id<'financialAccounts'>>;
    existingAccountIds?: Array<Id<'financialAccounts'>>;
  },
) {
  if (args.accountIds.length > 100) throw new ConvexError('A plan can include at most 100 accounts');
  const existingAccountIds = new Set(args.existingAccountIds ?? []);
  const eligibleAccounts: Array<Doc<'financialAccounts'>> = [];
  const droppedAccounts: Array<{ accountId: Id<'financialAccounts'>; reason: DroppedPlanAccountReason }> = [];
  for (const accountId of [...new Set(args.accountIds)]) {
    const account = await ctx.db.get('financialAccounts', accountId);
    if (!account || account.userId !== args.userId) throw new ConvexError('Account not found');
    let reason: DroppedPlanAccountReason | null = null;
    if (account.hidden) reason = 'hidden';
    else if (account.status !== 'active' && !existingAccountIds.has(account._id)) reason = 'inactive';
    else if (account.currency.toUpperCase() !== args.currency) reason = 'currencyMismatch';
    else if (!isSpendableAccountType(account.accountType) && account.accountType?.toUpperCase() !== 'CARD') {
      reason = 'ineligibleType';
    }
    if (reason) {
      droppedAccounts.push({ accountId, reason });
      continue;
    }

    eligibleAccounts.push(account);
  }

  return { eligibleAccounts, droppedAccounts };
}

export async function addEligiblePlanAccount(
  ctx: MutationCtx,
  args: {
    userId: string;
    plan: Doc<'plans'>;
    accountId: Id<'financialAccounts'>;
  },
) {
  if (args.plan.userId !== args.userId) throw new ConvexError('Plan not found');
  if (args.plan.accountIds.includes(args.accountId)) return false;
  if (args.plan.accountIds.length >= 100) throw new ConvexError('A plan can include at most 100 accounts');

  const { eligibleAccounts } = await resolveEligiblePlanAccounts(ctx, {
    userId: args.userId,
    currency: args.plan.currency,
    accountIds: [args.accountId],
  });
  if (eligibleAccounts.length === 0) return false;
  const account = eligibleAccounts[0];

  await ctx.db.patch('plans', args.plan._id, {
    accountIds: [...args.plan.accountIds, account._id],
    updatedAtMs: Date.now(),
  });
  return true;
}

export const createPlan = mutation({
  args: {
    name: v.string(),
    currency: v.string(),
    accountIds: v.array(v.id('financialAccounts')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const name = normalizeName(args.name, 'Plan');
    const currency = normalizeCurrency(args.currency);
    const existing = await ctx.db
      .query('plans')
      .withIndex('by_userId_and_name', (q) => q.eq('userId', user.id).eq('name', name))
      .unique();
    if (existing) {
      return { planId: existing._id, keptAccountIds: existing.accountIds, droppedAccounts: [] };
    }

    const { eligibleAccounts, droppedAccounts } = await resolveEligiblePlanAccounts(ctx, {
      userId: user.id,
      currency,
      accountIds: args.accountIds,
    });

    const existingPlans = assertBounded(
      await ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(MAX_PLAN_ROWS + 1),
      'plans',
    );
    await assertCanCreateAnotherPlan(ctx, user.id, existingPlans.length);
    const categories = assertBounded(
      await ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(MAX_PLAN_ROWS + 1),
      'categories',
    );
    const eligibleCategories = categories.filter((category) => category.budgetEligible);
    const startPeriod = currentPeriod();
    const startDate = currentDate();
    const now = Date.now();
    const planId = await ctx.db.insert('plans', {
      userId: user.id,
      name,
      currency,
      startPeriod,
      startDate,
      accountIds: eligibleAccounts.map((account) => account._id),
      isDefault: existingPlans.length === 0,
      sortOrder: (existingPlans.length + 1) * SORT_ORDER_STEP,
      createdAtMs: now,
      updatedAtMs: now,
    });

    const groupIds = new Map<CuratedGroupKey, Id<'planGroups'>>();
    for (const [index, definition] of CURATED_GROUPS.entries()) {
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId: user.id,
        name: definition.name,
        sortOrder: index * SORT_ORDER_STEP,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      groupIds.set(definition.key, groupId);
    }

    const bucketCounts = new Map<CuratedGroupKey, number>();
    for (const category of eligibleCategories) {
      const groupKey = groupKeyForCategory(category);
      const groupId = groupIds.get(groupKey);
      if (!groupId) throw new ConvexError('Plan group bootstrap failed');
      const nextBucketIndex = (bucketCounts.get(groupKey) ?? 0) + 1;
      bucketCounts.set(groupKey, nextBucketIndex);
      const bucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId: user.id,
        groupId,
        name: category.name,
        sortOrder: nextBucketIndex * SORT_ORDER_STEP,
        hidden: false,
        isUnplanned: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('planBucketCategories', {
        planId,
        userId: user.id,
        bucketId,
        categoryId: category._id,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    const fallbackGroupId = groupIds.get('other');
    if (!fallbackGroupId) throw new ConvexError('Plan fallback group bootstrap failed');
    await ctx.db.insert('planBuckets', {
      planId,
      userId: user.id,
      groupId: fallbackGroupId,
      name: 'Unplanned',
      sortOrder: ((bucketCounts.get('other') ?? 0) + 1) * SORT_ORDER_STEP,
      hidden: false,
      isUnplanned: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const createdPlan = await ctx.db.get('plans', planId);
    if (!createdPlan) throw new ConvexError('Plan bootstrap failed');
    await reconcileCardPaymentBuckets(ctx, createdPlan, eligibleAccounts);
    const activeInstallmentPlans = await loadActiveOwnedInstallmentPlans(ctx, user.id);
    await reconcileInstallmentPlanBuckets(ctx, createdPlan, activeInstallmentPlans);

    return {
      planId,
      keptAccountIds: eligibleAccounts.map((account) => account._id),
      droppedAccounts,
    };
  },
});

export const restartPlanFromToday = mutation({
  // A plan's real origin is usually the day it was created, not the day the user gets round to
  // fixing it, so the date can be named. Today stays the default.
  args: { planId: v.id('plans'), startDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    if (args.startDate !== undefined && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(args.startDate)) {
      throw new ConvexError('Start date must use YYYY-MM-DD format');
    }
    if (args.startDate !== undefined && args.startDate > currentDate()) {
      throw new ConvexError('A plan cannot start in the future');
    }
    const startDate = args.startDate ?? currentDate();
    const startPeriod = startDate.slice(0, 7);
    const deletedSnapshots = await invalidatePlanSnapshotsByPlanId(ctx, plan._id);
    await ctx.db.patch('plans', plan._id, {
      startDate,
      startPeriod,
      updatedAtMs: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.migrations.rebuildPlanSnapshotsAfterLogicChange, {
      planId: plan._id,
    });
    return { planId: plan._id, startDate, startPeriod, deletedSnapshots };
  },
});

export const updatePlanAccounts = mutation({
  args: { planId: v.id('plans'), accountIds: v.array(v.id('financialAccounts')) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const { eligibleAccounts, droppedAccounts } = await resolveEligiblePlanAccounts(ctx, {
      userId: user.id,
      currency: plan.currency,
      accountIds: args.accountIds,
      existingAccountIds: plan.accountIds,
    });
    if (eligibleAccounts.length === 0) throw new ConvexError('A plan needs at least one account');

    const accountIds = eligibleAccounts.map((account) => account._id);
    const unchanged =
      accountIds.length === plan.accountIds.length && new Set(plan.accountIds).size === new Set(accountIds).size
        ? accountIds.every((accountId) => plan.accountIds.includes(accountId))
        : false;
    if (!unchanged) await ctx.db.patch('plans', plan._id, { accountIds, updatedAtMs: Date.now() });
    const cardReconciliation = await reconcileCardPaymentBuckets(ctx, plan, eligibleAccounts);
    const activeInstallmentPlans = await loadActiveOwnedInstallmentPlans(ctx, user.id);
    const installmentReconciliation = await reconcileInstallmentPlanBuckets(ctx, plan, activeInstallmentPlans);
    if (!unchanged || cardReconciliation.changed || installmentReconciliation.changed) {
      // From the plan's first month, not the current one: the perimeter feeds liquidity and activity
      // for every month the plan has ever covered, so a partial recompute would leave the past wrong.
      await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
    }
    return { planId: plan._id, accountIds, droppedAccounts };
  },
});

export const renamePlan = mutation({
  args: { planId: v.id('plans'), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const name = normalizeName(args.name, 'Plan');
    const duplicate = await ctx.db
      .query('plans')
      .withIndex('by_userId_and_name', (q) => q.eq('userId', user.id).eq('name', name))
      .unique();
    if (duplicate && duplicate._id !== plan._id) throw new ConvexError('A plan with this name already exists');
    await ctx.db.patch('plans', plan._id, { name, updatedAtMs: Date.now() });
    return plan._id;
  },
});

export const cleanupDeletedPlan = internalMutation({
  args: { userId: v.string(), planId: v.id('plans') },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get('plans', args.planId);
    if (!plan || plan.userId !== args.userId) return null;

    const [groups, buckets, mappings, assignments, targets, snapshots] = await Promise.all([
      ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', args.planId))
        .take(PLAN_CLEANUP_BATCH_SIZE),
    ]);

    await Promise.all([
      ...mappings.map((mapping) => ctx.db.delete('planBucketCategories', mapping._id)),
      ...assignments.map((assignment) => ctx.db.delete('planAssignments', assignment._id)),
      ...targets.map((target) => ctx.db.delete('planTargets', target._id)),
      ...snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)),
      ...buckets.map((bucket) => ctx.db.delete('planBuckets', bucket._id)),
      ...groups.map((group) => ctx.db.delete('planGroups', group._id)),
    ]);

    if (groups.length + buckets.length + mappings.length + assignments.length + targets.length + snapshots.length > 0) {
      await ctx.scheduler.runAfter(0, internal.banking.plan.cleanupDeletedPlan, args);
      return null;
    }

    await ctx.db.delete('plans', plan._id);
    return plan._id;
  },
});

export const deletePlan = mutation({
  args: { planId: v.id('plans') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    if (plan.isDefault) {
      const plans = assertBounded(
        await ctx.db
          .query('plans')
          .withIndex('by_userId', (q) => q.eq('userId', user.id))
          .take(MAX_PLAN_ROWS + 1),
        'plans',
      );
      const replacement = plans.find((candidate) => candidate._id !== plan._id);
      if (replacement) await ctx.db.patch('plans', replacement._id, { isDefault: true, updatedAtMs: Date.now() });
    }
    await ctx.scheduler.runAfter(0, internal.banking.plan.cleanupDeletedPlan, {
      userId: user.id,
      planId: plan._id,
    });
    return plan._id;
  },
});

export const setActivePlan = mutation({
  args: { planId: v.id('plans') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const plans = assertBounded(
      await ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(MAX_PLAN_ROWS + 1),
      'plans',
    );
    const now = Date.now();
    await Promise.all(
      plans
        .filter((candidate) => candidate.isDefault !== (candidate._id === plan._id))
        .map((candidate) =>
          ctx.db.patch('plans', candidate._id, { isDefault: candidate._id === plan._id, updatedAtMs: now }),
        ),
    );
    return plan._id;
  },
});

export const createGroup = mutation({
  args: { planId: v.id('plans'), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const groups = await planGroups(ctx, plan._id);
    const name = normalizeName(args.name, 'Group');
    if (isSystemPlanGroupName(name)) throw new ConvexError('A protected system group with this name already exists');
    const now = Date.now();
    return await ctx.db.insert('planGroups', {
      planId: plan._id,
      userId: user.id,
      name,
      sortOrder: (groups.length + 1) * SORT_ORDER_STEP,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const renameGroup = mutation({
  args: { groupId: v.id('planGroups'), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const group = await requireOwnedGroup(ctx, user.id, args.groupId);
    await requireOwnedPlan(ctx, user.id, group.planId);
    await assertMutableGroup(ctx, group);
    const name = normalizeName(args.name, 'Group');
    if (isSystemPlanGroupName(name)) throw new ConvexError('A protected system group with this name already exists');
    await ctx.db.patch('planGroups', group._id, {
      name,
      updatedAtMs: Date.now(),
    });
    return group._id;
  },
});

export const deleteGroup = mutation({
  args: { groupId: v.id('planGroups') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const group = await requireOwnedGroup(ctx, user.id, args.groupId);
    const plan = await requireOwnedPlan(ctx, user.id, group.planId);
    await assertMutableGroup(ctx, group);
    const groups = await planGroups(ctx, plan._id);
    let fallback = groups.find((candidate) => candidate._id !== group._id && candidate.name === 'Other');
    fallback ??= groups.find((candidate) => candidate._id !== group._id && !isSystemPlanGroupName(candidate.name));
    if (!fallback) {
      const now = Date.now();
      const fallbackId = await ctx.db.insert('planGroups', {
        planId: plan._id,
        userId: user.id,
        name: 'Other',
        sortOrder: SORT_ORDER_STEP,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const createdFallback = await ctx.db.get('planGroups', fallbackId);
      if (!createdFallback) throw new ConvexError('Fallback group could not be created');
      fallback = createdFallback;
    }

    const [movingBuckets, fallbackBuckets] = await Promise.all([
      ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id).eq('groupId', group._id))
        .take(MAX_PLAN_ROWS + 1),
      ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id).eq('groupId', fallback._id))
        .take(MAX_PLAN_ROWS + 1),
    ]);
    assertBounded(movingBuckets, 'plan buckets');
    assertBounded(fallbackBuckets, 'fallback buckets');
    const now = Date.now();
    await Promise.all(
      movingBuckets.map((bucket, index) =>
        ctx.db.patch('planBuckets', bucket._id, {
          groupId: fallback._id,
          sortOrder: (fallbackBuckets.length + index + 1) * SORT_ORDER_STEP,
          updatedAtMs: now,
        }),
      ),
    );
    await ctx.db.delete('planGroups', group._id);
    await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
    return group._id;
  },
});

export const createBucket = mutation({
  args: {
    planId: v.id('plans'),
    groupId: v.id('planGroups'),
    name: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const group = await requireOwnedGroup(ctx, user.id, args.groupId);
    if (group.planId !== plan._id) throw new ConvexError('Plan group not found');
    await assertMutableGroup(ctx, group);
    if ((args.name === undefined) === (args.categoryId === undefined)) {
      throw new ConvexError('Provide either a bucket name or an existing category');
    }

    const now = Date.now();
    let category: Doc<'categories'>;
    if (args.categoryId) {
      category = await requireOwnedCategory(ctx, user.id, args.categoryId);
    } else {
      const name = normalizeName(args.name!, 'Bucket');
      await assertUniqueCategoryName(ctx, user.id, name);
      const categoryId = await ctx.db.insert('categories', {
        userId: user.id,
        name,
        kind: 'expense',
        applicableKinds: ['expense'],
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const createdCategory = await ctx.db.get('categories', categoryId);
      if (!createdCategory) throw new ConvexError('Category creation failed');
      category = createdCategory;
    }

    const groupBuckets = assertBounded(
      await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id).eq('groupId', group._id))
        .take(MAX_PLAN_ROWS + 1),
      'plan buckets',
    );
    const bucketId = await ctx.db.insert('planBuckets', {
      planId: plan._id,
      userId: user.id,
      groupId: group._id,
      name: category.name,
      sortOrder: (groupBuckets.length + 1) * SORT_ORDER_STEP,
      hidden: false,
      isUnplanned: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const existingMapping = await ctx.db
      .query('planBucketCategories')
      .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', plan._id).eq('categoryId', category._id))
      .unique();
    if (existingMapping) {
      await ctx.db.patch('planBucketCategories', existingMapping._id, { bucketId, updatedAtMs: now });
    } else {
      await ctx.db.insert('planBucketCategories', {
        planId: plan._id,
        userId: user.id,
        bucketId,
        categoryId: category._id,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
    return bucketId;
  },
});

export const renameBucket = mutation({
  args: { bucketId: v.id('planBuckets'), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    await requireOwnedPlan(ctx, user.id, bucket.planId);
    if (bucket.cardAccountId) throw new ConvexError('Card payment buckets cannot be renamed');
    // Only the generated rows are off limits: the reconciliation rewrites their name on every pass, so
    // a rename would not survive. A category the user paired to a loan keeps the name they gave it.
    if (await isGeneratedInstallmentBucket(ctx, bucket)) {
      throw new ConvexError('Instalment buckets cannot be renamed');
    }
    await ctx.db.patch('planBuckets', bucket._id, {
      name: normalizeName(args.name, 'Bucket'),
      updatedAtMs: Date.now(),
    });
    return bucket._id;
  },
});

export const hideBucket = mutation({
  args: { bucketId: v.id('planBuckets'), hidden: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    await requireOwnedPlan(ctx, user.id, bucket.planId);
    if (bucket.isUnplanned && args.hidden) throw new ConvexError('The Unplanned bucket cannot be hidden');
    if (bucket.cardAccountId && args.hidden) throw new ConvexError('Card payment buckets cannot be hidden');
    if (args.hidden && (await isGeneratedInstallmentBucket(ctx, bucket))) {
      throw new ConvexError('Instalment buckets cannot be hidden');
    }
    await ctx.db.patch('planBuckets', bucket._id, { hidden: args.hidden, updatedAtMs: Date.now() });
    return bucket._id;
  },
});

export const setBucketMoneyBox = mutation({
  args: {
    bucketId: v.id('planBuckets'),
    moneyBoxId: v.optional(v.id('moneyBoxes')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    const plan = await requireOwnedPlan(ctx, user.id, bucket.planId);
    if (bucket.isUnplanned || bucket.cardAccountId || bucket.installmentPlanId) {
      throw new ConvexError('Only ordinary plan buckets can link a money box');
    }

    if (args.moneyBoxId) {
      const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
      if (!moneyBox || moneyBox.userId !== user.id) throw new ConvexError('Money box not found');
      const duplicate = (await planBuckets(ctx, plan._id)).find(
        (candidate) => candidate._id !== bucket._id && candidate.moneyBoxId === moneyBox._id,
      );
      if (duplicate) throw new ConvexError('This money box is already linked to another bucket');
    }

    if (bucket.moneyBoxId === args.moneyBoxId) return bucket._id;
    await ctx.db.patch('planBuckets', bucket._id, {
      moneyBoxId: args.moneyBoxId,
      updatedAtMs: Date.now(),
    });
    // `savedAmount` is a present-day stock with no safe historical effective date, matching the
    // structural money-box mutations: discard every cached month and let reads rebuild cleanly.
    await invalidateAllPlanSnapshots(ctx, user.id);
    return bucket._id;
  },
});

export const deleteBucket = mutation({
  args: { bucketId: v.id('planBuckets') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    const plan = await requireOwnedPlan(ctx, user.id, bucket.planId);
    if (bucket.isUnplanned) throw new ConvexError('The Unplanned bucket cannot be deleted');
    if (bucket.cardAccountId) throw new ConvexError('Card payment buckets cannot be deleted');
    if (bucket.installmentPlanId) {
      throw new ConvexError(
        (await isGeneratedInstallmentBucket(ctx, bucket))
          ? 'Instalment buckets cannot be deleted'
          : 'Unpair the loan from this category before deleting it',
      );
    }
    const fallback = await unplannedBucket(ctx, plan._id);
    const [mappings, assignments, target] = await Promise.all([
      ctx.db
        .query('planBucketCategories')
        .withIndex('by_bucketId', (q) => q.eq('bucketId', bucket._id))
        .take(MAX_PLAN_ROWS + 1),
      ctx.db
        .query('planAssignments')
        .withIndex('by_bucketId', (q) => q.eq('bucketId', bucket._id))
        .take(MAX_PLAN_ROWS + 1),
      ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', plan._id).eq('bucketId', bucket._id))
        .unique(),
    ]);
    assertBounded(mappings, 'bucket categories');
    assertBounded(assignments, 'bucket assignments');
    const now = Date.now();
    await Promise.all([
      ...mappings.map((mapping) =>
        ctx.db.patch('planBucketCategories', mapping._id, { bucketId: fallback._id, updatedAtMs: now }),
      ),
      ...assignments.map((assignment) => ctx.db.delete('planAssignments', assignment._id)),
      ...(target ? [ctx.db.delete('planTargets', target._id)] : []),
    ]);
    await ctx.db.delete('planBuckets', bucket._id);
    await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
    return bucket._id;
  },
});

export const mapCategoriesToBucket = mutation({
  args: { bucketId: v.id('planBuckets'), categoryIds: v.array(v.id('categories')) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    const plan = await requireOwnedPlan(ctx, user.id, bucket.planId);
    if (bucket.cardAccountId) throw new ConvexError('Card payment buckets cannot map categories');
    // An adopted category keeps catching its own transactions; only the generated rows, whose activity
    // is the instalment itself, have nothing to map.
    if (await isGeneratedInstallmentBucket(ctx, bucket)) {
      throw new ConvexError('Instalment buckets cannot map categories');
    }
    const categoryIds = [...new Set(args.categoryIds)];
    if (categoryIds.length > MAX_PLAN_ROWS) throw new ConvexError('Too many categories to map');
    await Promise.all(categoryIds.map((categoryId) => requireOwnedCategory(ctx, user.id, categoryId)));
    const existingForBucket = assertBounded(
      await ctx.db
        .query('planBucketCategories')
        .withIndex('by_bucketId', (q) => q.eq('bucketId', bucket._id))
        .take(MAX_PLAN_ROWS + 1),
      'bucket categories',
    );
    const desired = new Set(categoryIds);
    const fallback = await unplannedBucket(ctx, plan._id);
    const now = Date.now();

    if (!bucket.isUnplanned) {
      await Promise.all(
        existingForBucket
          .filter((mapping) => !desired.has(mapping.categoryId))
          .map((mapping) =>
            ctx.db.patch('planBucketCategories', mapping._id, { bucketId: fallback._id, updatedAtMs: now }),
          ),
      );
    }

    for (const categoryId of categoryIds) {
      const existing = await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', plan._id).eq('categoryId', categoryId))
        .unique();
      if (existing) {
        if (existing.bucketId !== bucket._id) {
          await ctx.db.patch('planBucketCategories', existing._id, { bucketId: bucket._id, updatedAtMs: now });
        }
      } else {
        await ctx.db.insert('planBucketCategories', {
          planId: plan._id,
          userId: user.id,
          bucketId: bucket._id,
          categoryId,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
    }
    await schedulePlanSnapshots(ctx, plan, plan.startPeriod);
    return bucket._id;
  },
});

export const reorderPlan = mutation({
  args: {
    groups: v.optional(v.array(v.object({ id: v.id('planGroups'), sortOrder: v.number() }))),
    buckets: v.optional(
      v.array(v.object({ id: v.id('planBuckets'), groupId: v.id('planGroups'), sortOrder: v.number() })),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const groupMoves = args.groups ?? [];
    const bucketMoves = args.buckets ?? [];
    if (groupMoves.length + bucketMoves.length > MAX_PLAN_ROWS) throw new ConvexError('Too many rows to reorder');
    if (new Set(groupMoves.map((move) => move.id)).size !== groupMoves.length) {
      throw new ConvexError('Duplicate plan group in reorder');
    }
    if (new Set(bucketMoves.map((move) => move.id)).size !== bucketMoves.length) {
      throw new ConvexError('Duplicate plan bucket in reorder');
    }

    const groups = await Promise.all(groupMoves.map((move) => requireOwnedGroup(ctx, user.id, move.id)));
    const buckets = await Promise.all(bucketMoves.map((move) => requireOwnedBucket(ctx, user.id, move.id)));
    const targetGroups = await Promise.all(bucketMoves.map((move) => requireOwnedGroup(ctx, user.id, move.groupId)));
    const planId = groups[0]?.planId ?? buckets[0]?.planId;
    if (!planId) return null;
    await requireOwnedPlan(ctx, user.id, planId);
    if (
      groups.some((group) => group.planId !== planId) ||
      buckets.some((bucket) => bucket.planId !== planId) ||
      targetGroups.some((group) => group.planId !== planId)
    ) {
      throw new ConvexError('All reordered rows must belong to the same plan');
    }

    const generatedBuckets = await Promise.all(buckets.map((bucket) => isGeneratedInstallmentBucket(ctx, bucket)));
    for (const [index, bucket] of buckets.entries()) {
      const targetGroup = targetGroups[index];
      const isGenerated = bucket.cardAccountId !== undefined || generatedBuckets[index];
      if (isGenerated && bucketMoves[index].groupId !== bucket.groupId) {
        throw new ConvexError('System buckets cannot move groups');
      }
      if (!bucket.cardAccountId && targetGroup.name === CARD_PAYMENTS_GROUP_NAME) {
        throw new ConvexError('Only card payment buckets can use the Card payments group');
      }
      if (!bucket.installmentPlanId && targetGroup.name === INSTALLMENTS_GROUP_NAME) {
        throw new ConvexError('Only instalment buckets can use the Instalments group');
      }
    }

    const groupById = new Map(groups.map((group) => [group._id, group]));
    const now = Date.now();
    const orderedGroups = [...groupMoves].sort((left, right) => {
      const systemOrder = (name: string | undefined) =>
        name === CARD_PAYMENTS_GROUP_NAME ? 0 : name === INSTALLMENTS_GROUP_NAME ? 1 : 2;
      const leftSystemOrder = systemOrder(groupById.get(left.id)?.name);
      const rightSystemOrder = systemOrder(groupById.get(right.id)?.name);
      if (leftSystemOrder !== rightSystemOrder) return leftSystemOrder - rightSystemOrder;
      return left.sortOrder - right.sortOrder;
    });
    await Promise.all(
      orderedGroups.map((move, index) =>
        ctx.db.patch('planGroups', move.id, { sortOrder: index * SORT_ORDER_STEP, updatedAtMs: now }),
      ),
    );

    const movesByGroup = new Map<Id<'planGroups'>, typeof bucketMoves>();
    for (const move of bucketMoves) {
      const moves = movesByGroup.get(move.groupId) ?? [];
      moves.push(move);
      movesByGroup.set(move.groupId, moves);
    }
    await Promise.all(
      [...movesByGroup.entries()].flatMap(([groupId, moves]) =>
        moves
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((move, index) =>
            ctx.db.patch('planBuckets', move.id, {
              groupId,
              sortOrder: (index + 1) * SORT_ORDER_STEP,
              updatedAtMs: now,
            }),
          ),
      ),
    );
    return planId;
  },
});

export const setTarget = mutation({
  args: {
    bucketId: v.id('planBuckets'),
    cadence: targetCadenceValidator,
    behaviour: targetBehaviourValidator,
    amountMinor: v.int64(),
    dueDate: v.optional(v.string()),
    dayOfMonth: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    repeats: v.boolean(),
    repeatIntervalCount: v.optional(v.number()),
    repeatIntervalUnit: v.optional(v.union(v.literal('month'), v.literal('year'))),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await setTargetForUser(ctx, { userId: user.id, ...args });
  },
});

export const clearTarget = mutation({
  args: { bucketId: v.id('planBuckets') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    const plan = await requireOwnedPlan(ctx, user.id, bucket.planId);
    const target = await ctx.db
      .query('planTargets')
      .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', plan._id).eq('bucketId', bucket._id))
      .unique();
    if (target) await ctx.db.delete('planTargets', target._id);
    return target?._id ?? null;
  },
});

export const snoozeTarget = mutation({
  args: { bucketId: v.id('planBuckets'), period: v.string(), snoozed: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertPeriod(args.period);
    const bucket = await requireOwnedBucket(ctx, user.id, args.bucketId);
    const plan = await requireOwnedPlan(ctx, user.id, bucket.planId);
    const target = await ctx.db
      .query('planTargets')
      .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', plan._id).eq('bucketId', bucket._id))
      .unique();
    if (!target) throw new ConvexError('Target not found');
    const snoozedPeriods = new Set(target.snoozedPeriods);
    if (args.snoozed) snoozedPeriods.add(args.period);
    else snoozedPeriods.delete(args.period);
    await ctx.db.patch('planTargets', target._id, { snoozedPeriods: [...snoozedPeriods].sort() });
    return target._id;
  },
});

export const setExpectedIncome = mutation({
  args: { planId: v.id('plans'), expectedIncomeMinor: v.optional(v.int64()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    if (args.expectedIncomeMinor !== undefined && args.expectedIncomeMinor < 0n) {
      throw new ConvexError('Expected income cannot be negative');
    }
    await ctx.db.patch('plans', plan._id, {
      expectedIncomeMinor: args.expectedIncomeMinor,
      updatedAtMs: Date.now(),
    });
    return plan._id;
  },
});

export const setOverdraftTargetDate = mutation({
  args: { planId: v.id('plans'), targetDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    if (args.targetDate !== undefined) {
      assertIsoDate(args.targetDate, 'Overdraft target date');
      if (args.targetDate < currentDate()) {
        throw new ConvexError('Overdraft target date cannot be in the past');
      }
    }
    await ctx.db.patch('plans', plan._id, {
      overdraftTargetDate: args.targetDate,
      updatedAtMs: Date.now(),
    });
    return plan._id;
  },
});

export const setAssigned = mutation({
  args: {
    planId: v.id('plans'),
    bucketId: v.id('planBuckets'),
    period: v.string(),
    amountMinor: v.int64(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await setAssignedForUser(ctx, { userId: user.id, ...args });
  },
});

export const autoAssign = mutation({
  args: {
    planId: v.id('plans'),
    period: v.string(),
    strategy: autoAssignStrategyValidator,
    bucketIds: v.optional(v.array(v.id('planBuckets'))),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertPeriod(args.period);
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const current = await computePlanMonthState(ctx, plan, args.period);
    const bucketById = new Map(current.rows.buckets.map((bucket) => [bucket._id, bucket]));
    const stateByBucket = new Map(current.bucketStates.map((state) => [state.bucketId, state]));
    const requestedIds = args.bucketIds ? [...new Set(args.bucketIds)] : null;
    if (requestedIds && requestedIds.length !== args.bucketIds!.length) {
      throw new ConvexError('Duplicate bucket in Auto-Assign selection');
    }
    if (requestedIds && requestedIds.length > MAX_PLAN_ROWS) throw new ConvexError('Too many buckets selected');
    if (requestedIds) {
      for (const bucketId of requestedIds) {
        const bucket = bucketById.get(bucketId);
        // Card payment buckets stay selectable: unlike Unplanned they hold real money and their
        // underfunded amount is the card debt, so Auto-Assign is exactly how the user funds them.
        if (!bucket || bucket.isUnplanned) throw new ConvexError('Plan bucket not found');
      }
    }
    const selectedIds = requestedIds ? new Set(requestedIds) : null;
    const buckets = current.rows.buckets.filter(
      (bucket) => !bucket.isUnplanned && (selectedIds ? selectedIds.has(bucket._id) : !bucket.hidden),
    );
    const previousPeriod = addMonths(args.period, -1);
    const historicalByBucket = new Map<Id<'planBuckets'>, bigint>();

    if (args.strategy === 'assignedLastMonth' && previousPeriod >= plan.startPeriod) {
      const assignments = assertBounded(
        await ctx.db
          .query('planAssignments')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id).eq('period', previousPeriod))
          .take(MAX_PLAN_ROWS + 1),
        'previous assignments',
      );
      for (const assignment of assignments) historicalByBucket.set(assignment.bucketId, assignment.assignedMinor);
    }

    if (args.strategy === 'spentLastMonth' && previousPeriod >= plan.startPeriod) {
      const previous = await computePlanMonthState(ctx, plan, previousPeriod);
      for (const state of previous.bucketStates) {
        historicalByBucket.set(state.bucketId, state.activityMinor < 0n ? -state.activityMinor : 0n);
      }
    }

    if (args.strategy === 'averageAssigned') {
      const firstPeriod =
        addMonths(args.period, -12) > plan.startPeriod ? addMonths(args.period, -12) : plan.startPeriod;
      const periods: Array<string> = [];
      for (let period = firstPeriod; period < args.period; period = addMonths(period, 1)) periods.push(period);
      const assignmentsByPeriod = await Promise.all(
        periods.map(async (period) =>
          assertBounded(
            await ctx.db
              .query('planAssignments')
              .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id).eq('period', period))
              .take(MAX_PLAN_ROWS + 1),
            `assignments for ${period}`,
          ),
        ),
      );
      const totals = new Map<Id<'planBuckets'>, bigint>();
      for (const assignments of assignmentsByPeriod) {
        for (const assignment of assignments) {
          totals.set(assignment.bucketId, (totals.get(assignment.bucketId) ?? 0n) + assignment.assignedMinor);
        }
      }
      for (const bucket of buckets) {
        historicalByBucket.set(
          bucket._id,
          periods.length > 0 ? positiveCeilDivide(totals.get(bucket._id) ?? 0n, BigInt(periods.length)) : 0n,
        );
      }
    }

    const previewRows = buckets
      .map((bucket, index) => {
        const state = stateByBucket.get(bucket._id);
        if (!state) throw new ConvexError('Plan bucket computation failed');
        let amountMinor = 0n;
        if (args.strategy === 'underfunded') {
          const overspendingMinor = state.availableEndMinor < 0n ? -state.availableEndMinor : 0n;
          amountMinor = overspendingMinor > state.underfundedMinor ? overspendingMinor : state.underfundedMinor;
        } else if (
          args.strategy === 'assignedLastMonth' ||
          args.strategy === 'spentLastMonth' ||
          args.strategy === 'averageAssigned'
        ) {
          amountMinor = historicalByBucket.get(bucket._id) ?? 0n;
        } else if (args.strategy === 'resetAssigned') {
          amountMinor = -state.assignedMinor;
        } else {
          amountMinor = -state.availableEndMinor;
        }
        return {
          bucketId: bucket._id,
          name: bucket.name,
          currentAssignedMinor: state.assignedMinor,
          amountMinor,
          resultingAssignedMinor: state.assignedMinor + amountMinor,
          priority: underfundedPriority({
            period: args.period,
            availableMinor: state.availableEndMinor,
            dueDate: state.dueDate,
            target: state.target,
          }),
          dueDate: state.dueDate ?? state.target?.dueDate,
          index,
        };
      })
      .filter((row) => row.amountMinor !== 0n)
      .sort((left, right) => {
        if (args.strategy !== 'underfunded') return left.index - right.index;
        return (
          left.priority - right.priority ||
          (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31') ||
          left.index - right.index
        );
      });
    const totalAssignedMinor = previewRows.reduce((total, row) => total + row.amountMinor, 0n);

    if (!args.dryRun) {
      for (const row of previewRows) {
        const bucket = bucketById.get(row.bucketId);
        if (!bucket) throw new ConvexError('Plan bucket not found');
        await upsertAssignment(ctx, {
          plan,
          bucket,
          period: args.period,
          amountMinor: row.resultingAssignedMinor,
        });
      }
      await schedulePlanSnapshots(ctx, plan, args.period);
    }

    return {
      strategy: args.strategy,
      period: args.period,
      rows: previewRows.map(({ dueDate, index, ...row }) => row),
      totalAssignedMinor,
      resultingReadyToAssignMinor: current.month.readyToAssignMinor - totalAssignedMinor,
      applied: !args.dryRun,
    };
  },
});

export const moveMoney = mutation({
  args: {
    planId: v.id('plans'),
    period: v.string(),
    fromBucketId: v.id('planBuckets'),
    toBucketId: v.id('planBuckets'),
    amountMinor: v.int64(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertPeriod(args.period);
    if (args.amountMinor <= 0n) throw new ConvexError('Move amount must be greater than zero');
    if (args.fromBucketId === args.toBucketId) throw new ConvexError('Choose two different buckets');
    const plan = await requireOwnedPlan(ctx, user.id, args.planId);
    const [fromBucket, toBucket] = await Promise.all([
      requireOwnedBucket(ctx, user.id, args.fromBucketId),
      requireOwnedBucket(ctx, user.id, args.toBucketId),
    ]);
    if (fromBucket.planId !== plan._id || toBucket.planId !== plan._id) {
      throw new ConvexError('Plan bucket not found');
    }

    const [fromAssignment, toAssignment] = await Promise.all([
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period_and_bucketId', (q) =>
          q.eq('planId', plan._id).eq('period', args.period).eq('bucketId', fromBucket._id),
        )
        .unique(),
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period_and_bucketId', (q) =>
          q.eq('planId', plan._id).eq('period', args.period).eq('bucketId', toBucket._id),
        )
        .unique(),
    ]);
    const fromId = await upsertAssignment(ctx, {
      plan,
      bucket: fromBucket,
      period: args.period,
      amountMinor: (fromAssignment?.assignedMinor ?? 0n) - args.amountMinor,
    });
    const toId = await upsertAssignment(ctx, {
      plan,
      bucket: toBucket,
      period: args.period,
      amountMinor: (toAssignment?.assignedMinor ?? 0n) + args.amountMinor,
    });
    await schedulePlanSnapshots(ctx, plan, args.period);
    return { fromAssignmentId: fromId, toAssignmentId: toId };
  },
});

export const archiveCategory = mutation({
  args: { categoryId: v.id('categories'), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const category = await requireOwnedCategory(ctx, user.id, args.categoryId);
    await ctx.db.patch('categories', category._id, { archived: args.archived, updatedAtMs: Date.now() });
    return category._id;
  },
});
