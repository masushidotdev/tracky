import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const CARD_PAYMENTS_GROUP_NAME = 'Card payments';
export const INSTALLMENTS_GROUP_NAME = 'Instalments';

const SORT_ORDER_STEP = 1000;
const MAX_PLAN_ROWS = 500;

function assertBounded<T>(rows: Array<T>, label: string) {
  if (rows.length > MAX_PLAN_ROWS) throw new ConvexError(`Too many ${label} to update in one mutation`);
  return rows;
}

export function isSystemPlanGroupName(name: string) {
  return name === CARD_PAYMENTS_GROUP_NAME || name === INSTALLMENTS_GROUP_NAME;
}

// A generated bucket lives in the system group and is rewritten on every reconciliation pass, so the
// user must not edit it. A bucket they paired to a loan themselves is theirs: it keeps its name,
// group and mappings, and the pairing only lends it the instalment schedule.
export async function isGeneratedInstallmentBucket(ctx: MutationCtx | QueryCtx, bucket: Doc<'planBuckets'>) {
  if (bucket.installmentPlanId === undefined) return false;
  const group = await ctx.db.get('planGroups', bucket.groupId);
  return group?.name === INSTALLMENTS_GROUP_NAME;
}

// A generated row carries nothing of the user's: no assignment, no target, no mapping. When its plan
// stops needing it - typically because the loan was paired to a category of theirs instead - keeping
// an empty duplicate around is the very thing the pairing was meant to avoid, so it goes. Anything
// with money or intent on it is detached instead, never destroyed.
async function deleteIfEmptyGeneratedBucket(ctx: MutationCtx, bucket: Doc<'planBuckets'>) {
  if (bucket.isUnplanned || bucket.moneyBoxId !== undefined) return false;
  const [assignments, mappings, target] = await Promise.all([
    ctx.db
      .query('planAssignments')
      .withIndex('by_bucketId', (q) => q.eq('bucketId', bucket._id))
      .take(1),
    ctx.db
      .query('planBucketCategories')
      .withIndex('by_bucketId', (q) => q.eq('bucketId', bucket._id))
      .take(1),
    ctx.db
      .query('planTargets')
      .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', bucket.planId).eq('bucketId', bucket._id))
      .unique(),
  ]);
  if (assignments.length > 0 || mappings.length > 0 || target) return false;
  await ctx.db.delete('planBuckets', bucket._id);
  return true;
}

export async function detachPlanSystemBuckets(
  ctx: MutationCtx,
  input: {
    plan: Doc<'plans'>;
    groups: Array<Doc<'planGroups'>>;
    buckets: Array<Doc<'planBuckets'>>;
    systemGroupId: Id<'planGroups'> | undefined;
    bucketsToDetach: Array<Doc<'planBuckets'>>;
  },
) {
  if (input.bucketsToDetach.length === 0) return 0;

  const now = Date.now();
  // A bucket the user keeps in their own group only loses the link. Relocating it would drag one of
  // their categories out of the group where they filed it, which is the opposite of leaving it alone.
  const bucketsToRelocate = input.bucketsToDetach.filter((bucket) => bucket.groupId === input.systemGroupId);
  for (const bucket of input.bucketsToDetach) {
    if (bucketsToRelocate.includes(bucket)) continue;
    await ctx.db.patch('planBuckets', bucket._id, {
      cardAccountId: undefined,
      installmentPlanId: undefined,
      updatedAtMs: now,
    });
  }
  if (bucketsToRelocate.length === 0) return input.bucketsToDetach.length;

  let fallbackGroup = input.groups.find(
    (candidate) =>
      candidate._id !== input.systemGroupId && candidate.name === 'Other' && !isSystemPlanGroupName(candidate.name),
  );
  fallbackGroup ??= input.groups.find(
    (candidate) => candidate._id !== input.systemGroupId && !isSystemPlanGroupName(candidate.name),
  );
  if (!fallbackGroup) {
    const fallbackGroupId = await ctx.db.insert('planGroups', {
      planId: input.plan._id,
      userId: input.plan.userId,
      name: 'Other',
      sortOrder: Math.max(0, ...input.groups.map((candidate) => candidate.sortOrder)) + SORT_ORDER_STEP,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const created = await ctx.db.get('planGroups', fallbackGroupId);
    if (!created) throw new ConvexError('Fallback group could not be created');
    fallbackGroup = created;
  }

  let sortOrder =
    Math.max(
      0,
      ...input.buckets.filter((bucket) => bucket.groupId === fallbackGroup._id).map((bucket) => bucket.sortOrder),
    ) + SORT_ORDER_STEP;
  for (const bucket of bucketsToRelocate) {
    // Leaving a system perimeter must never erase assignments, targets, mappings, or history. The
    // former system row becomes a regular bucket; only an explicit delete action may destroy it.
    await ctx.db.patch('planBuckets', bucket._id, {
      groupId: fallbackGroup._id,
      sortOrder,
      cardAccountId: undefined,
      installmentPlanId: undefined,
      updatedAtMs: now,
    });
    sortOrder += SORT_ORDER_STEP;
  }
  return input.bucketsToDetach.length;
}

export async function loadActiveOwnedInstallmentPlans(ctx: MutationCtx, userId: string) {
  const plans = assertBounded(
    await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
      .take(MAX_PLAN_ROWS + 1),
    'active installment plans',
  );
  const facilities = await Promise.all(plans.map((plan) => ctx.db.get('creditFacilities', plan.creditFacilityId)));
  return plans
    .filter((plan, index) => facilities[index]?.userId === userId && plan.userId === userId)
    .sort((left, right) => left.name.localeCompare(right.name) || left._id.localeCompare(right._id));
}

export async function reconcileInstallmentPlanBuckets(
  ctx: MutationCtx,
  plan: Doc<'plans'>,
  activeInstallmentPlans: Array<Doc<'creditFacilityInstallmentPlans'>>,
) {
  const [groups, buckets] = await Promise.all([
    ctx.db
      .query('planGroups')
      .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
    ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
  ]);
  const boundedGroups = assertBounded(groups, 'plan groups');
  const boundedBuckets = assertBounded(buckets, 'plan buckets');
  const eligiblePlans = activeInstallmentPlans.filter(
    (installmentPlan) =>
      installmentPlan.userId === plan.userId &&
      plan.currency === 'EUR' &&
      installmentPlan.monthlyPaymentAmount.currency === plan.currency,
  );

  // A loan paired to one of the user's own categories adopts that row instead of generating a second
  // one beside it: the debt was already budgeted somewhere, and two rows for one instalment ask to be
  // funded twice.
  const bucketById = new Map(boundedBuckets.map((bucket) => [bucket._id, bucket]));
  const facilities = await Promise.all(
    eligiblePlans.map((installmentPlan) => ctx.db.get('creditFacilities', installmentPlan.creditFacilityId)),
  );
  const adoptedBucketIdByPlanId = new Map<Id<'creditFacilityInstallmentPlans'>, Id<'planBuckets'>>();
  const adoptedBucketIds = new Set<Id<'planBuckets'>>();
  eligiblePlans.forEach((installmentPlan, index) => {
    const pairedBucketId = facilities[index]?.pairedPlanBucketId;
    if (!pairedBucketId || adoptedBucketIds.has(pairedBucketId)) return;
    const bucket = bucketById.get(pairedBucketId);
    // Pairing is validated against the user, not against a plan, so the bucket may belong to another
    // plan entirely. A card payment row and the Unplanned row are refused outright: a second schedule
    // would fight over the target they already derive.
    if (!bucket || bucket.cardAccountId !== undefined || bucket.isUnplanned) return;
    adoptedBucketIdByPlanId.set(installmentPlan._id, pairedBucketId);
    adoptedBucketIds.add(pairedBucketId);
  });

  const existingInstallmentBuckets = boundedBuckets.filter(
    (bucket) => bucket.installmentPlanId !== undefined && !adoptedBucketIds.has(bucket._id),
  );
  const generatedPlans = eligiblePlans.filter((installmentPlan) => !adoptedBucketIdByPlanId.has(installmentPlan._id));
  // The group is found by name, and only failing that by the rows inside it - a renamed system group
  // is still recognisable because it holds nothing but instalment rows. Inferring it from the first
  // linked bucket alone would let a released pairing rename the user's own group.
  let group =
    boundedGroups.find((candidate) => candidate.name === INSTALLMENTS_GROUP_NAME) ??
    boundedGroups.find(
      (candidate) =>
        existingInstallmentBuckets.some((bucket) => bucket.groupId === candidate._id) &&
        boundedBuckets.every((bucket) => bucket.groupId !== candidate._id || bucket.installmentPlanId !== undefined),
    );
  let createdGroup = false;
  let changed = false;
  const now = Date.now();

  // Nothing generated and no group already there: creating an empty Instalments group would put a
  // heading in the Plan with nothing under it.
  if (!group && generatedPlans.length === 0) {
    // No system group to move anything into, so any leftover link is simply cleared where it sits.
    const released = await detachPlanSystemBuckets(ctx, {
      plan,
      groups: boundedGroups,
      buckets: boundedBuckets,
      systemGroupId: undefined,
      bucketsToDetach: existingInstallmentBuckets,
    });
    const adopted = await adoptPairedBuckets();
    return {
      changed: released > 0 || adopted > 0,
      createdGroup,
      createdBuckets: 0,
      detachedBuckets: released,
      adoptedBuckets: adopted,
    };
  }

  if (!group) {
    // Existing plans predate this system group. Make room immediately after Card payments so index
    // ordering is deterministic instead of relying on equal sort-order creation timestamps.
    await Promise.all(
      boundedGroups
        .filter((candidate) => candidate.sortOrder >= SORT_ORDER_STEP)
        .map((candidate) =>
          ctx.db.patch('planGroups', candidate._id, {
            sortOrder: candidate.sortOrder + SORT_ORDER_STEP,
            updatedAtMs: now,
          }),
        ),
    );
    const groupId = await ctx.db.insert('planGroups', {
      planId: plan._id,
      userId: plan.userId,
      name: INSTALLMENTS_GROUP_NAME,
      sortOrder: SORT_ORDER_STEP,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const created = await ctx.db.get('planGroups', groupId);
    if (!created) throw new ConvexError('Instalments group could not be created');
    group = created;
    createdGroup = true;
    changed = true;
  } else if (group.name !== INSTALLMENTS_GROUP_NAME || group.sortOrder !== SORT_ORDER_STEP || group.hidden) {
    await ctx.db.patch('planGroups', group._id, {
      name: INSTALLMENTS_GROUP_NAME,
      sortOrder: SORT_ORDER_STEP,
      hidden: false,
      updatedAtMs: now,
    });
    changed = true;
  }

  const desiredPlanIds = new Set(generatedPlans.map((installmentPlan) => installmentPlan._id));
  const bucketByInstallmentPlanId = new Map<Id<'creditFacilityInstallmentPlans'>, Doc<'planBuckets'>>();
  const bucketsToDetach: Array<Doc<'planBuckets'>> = [];
  for (const bucket of existingInstallmentBuckets) {
    const installmentPlanId = bucket.installmentPlanId;
    if (
      !installmentPlanId ||
      !desiredPlanIds.has(installmentPlanId) ||
      bucketByInstallmentPlanId.has(installmentPlanId) ||
      // Outside the system group it can only be a pairing that was released: let it go back to being
      // an ordinary category instead of dragging it in here and renaming it after the loan.
      bucket.groupId !== group._id
    ) {
      bucketsToDetach.push(bucket);
    } else {
      bucketByInstallmentPlanId.set(installmentPlanId, bucket);
    }
  }
  const survivingDetachments: Array<Doc<'planBuckets'>> = [];
  let deletedBuckets = 0;
  for (const bucket of bucketsToDetach) {
    if (bucket.groupId === group._id && (await deleteIfEmptyGeneratedBucket(ctx, bucket))) {
      deletedBuckets += 1;
      continue;
    }
    survivingDetachments.push(bucket);
  }
  const detachedBuckets = await detachPlanSystemBuckets(ctx, {
    plan,
    groups: boundedGroups,
    buckets: boundedBuckets,
    systemGroupId: group._id,
    bucketsToDetach: survivingDetachments,
  });
  changed ||= detachedBuckets > 0 || deletedBuckets > 0;

  let createdBuckets = 0;
  for (const [index, installmentPlan] of generatedPlans.entries()) {
    const name = installmentPlan.name.trim() || 'Instalment';
    const sortOrder = (index + 1) * SORT_ORDER_STEP;
    const existing = bucketByInstallmentPlanId.get(installmentPlan._id);
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
          installmentPlanId: installmentPlan._id,
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
      installmentPlanId: installmentPlan._id,
      createdAtMs: now,
      updatedAtMs: now,
    });
    createdBuckets += 1;
    changed = true;
  }

  const adoptedBuckets = await adoptPairedBuckets();
  changed ||= adoptedBuckets > 0;

  return { changed, createdGroup, createdBuckets, detachedBuckets, adoptedBuckets };

  // Stamps the schedule onto the row the user chose and nothing else: name, group, order and
  // mappings stay theirs, so unpairing later gives the category back exactly as it was.
  async function adoptPairedBuckets() {
    let adopted = 0;
    for (const [installmentPlanId, bucketId] of adoptedBucketIdByPlanId) {
      const bucket = bucketById.get(bucketId);
      if (!bucket || (bucket.installmentPlanId === installmentPlanId && !bucket.hidden)) continue;
      await ctx.db.patch('planBuckets', bucketId, {
        installmentPlanId,
        hidden: false,
        updatedAtMs: Date.now(),
      });
      adopted += 1;
    }
    return adopted;
  }
}

export async function reconcileInstallmentPlanBucketsForUser(ctx: MutationCtx, userId: string) {
  const [plans, activeInstallmentPlans] = await Promise.all([
    ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_ROWS + 1),
    loadActiveOwnedInstallmentPlans(ctx, userId),
  ]);
  const boundedPlans = assertBounded(plans, 'plans');
  const results = [];
  for (const plan of boundedPlans) {
    results.push(await reconcileInstallmentPlanBuckets(ctx, plan, activeInstallmentPlans));
  }
  return {
    changed: results.some((result) => result.changed),
    createdGroups: results.reduce((total, result) => total + Number(result.createdGroup), 0),
    createdBuckets: results.reduce((total, result) => total + result.createdBuckets, 0),
    detachedBuckets: results.reduce((total, result) => total + result.detachedBuckets, 0),
    adoptedBuckets: results.reduce((total, result) => total + result.adoptedBuckets, 0),
  };
}
