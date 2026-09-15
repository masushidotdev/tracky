/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './migrations.ts', './banking/*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-01T00:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'en-US',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

async function seedAccount(t: TestHarness, userId: string, balanceMinor = 100_000n) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'manual',
      status: 'active',
      displayName: 'Manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'manual',
      name: 'Checking',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor: balanceMinor, currency: 'EUR' },
      fetchedAtMs: now,
    });
    return { accountId, providerConnectionId };
  });
}

async function seedCategory(t: TestHarness, userId: string, name = 'Groceries') {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('categories', {
      userId,
      name,
      kind: 'expense',
      applicableKinds: ['expense'],
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedInstallmentPlan(
  t: TestHarness,
  userId: string,
  accountId: Id<'financialAccounts'>,
  input: { name?: string; monthlyPaymentMinor?: bigint; nextPaymentDate?: string } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: input.name ?? 'Acme Credit',
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 60_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const installmentPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: facilityId,
      name: input.name ?? 'Acme Credit',
      principalAmount: { amountMinor: 100_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 60_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: input.monthlyPaymentMinor ?? 5_453n, currency: 'EUR' },
      installmentCount: 12,
      remainingInstallments: 6,
      startDate: '2026-06-10',
      nextPaymentDate: input.nextPaymentDate ?? '2026-07-10',
      endDate: '2026-12-10',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { facilityId, installmentPlanId };
  });
}

async function createPlan(t: TestHarness, userId: string, accountId: Id<'financialAccounts'>) {
  const asUser = t.withIdentity({ subject: userId });
  const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
    name: 'Main plan',
    currency: 'EUR',
    accountIds: [accountId],
  });
  await t.run((ctx) => ctx.db.patch('plans', planId, { startDate: '2026-07-01' }));
  return { asUser, planId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('installment buckets in the Plan', () => {
  test('uses the scheduled instalment fallback without a target and accepts a protected-bucket target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_bucket_user';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccount(t, userId);
    const { installmentPlanId } = await seedInstallmentPlan(t, userId, accountId);
    const { asUser, planId } = await createPlan(t, userId, accountId);

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const group = month.groups.find((candidate) => candidate.name === 'Instalments');
    const bucket = group?.buckets.find((candidate) => candidate.installmentPlanId === installmentPlanId);

    expect(month.groups.slice(0, 2).map((candidate) => candidate.name)).toEqual(['Card payments', 'Instalments']);
    expect(bucket).toMatchObject({
      name: 'Acme Credit',
      installmentPlanId,
      cardAccountId: null,
      categoryIds: [],
      neededMinor: 5_453n,
      underfundedMinor: 5_453n,
      dueDate: '2026-07-10',
      target: null,
    });
    const afterEnd = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2027-01' });
    expect(
      afterEnd.groups
        .flatMap((candidate) => candidate.buckets)
        .find((candidate) => candidate.installmentPlanId === installmentPlanId)?.neededMinor,
    ).toBe(0n);

    await expect(
      asUser.mutation(api.banking.plan.renameGroup, { groupId: group!.groupId, name: 'Loans' }),
    ).rejects.toThrow('The Instalments group cannot be changed');
    await expect(
      asUser.mutation(api.banking.plan.renameBucket, { bucketId: bucket!.bucketId, name: 'Loan' }),
    ).rejects.toThrow('Instalment buckets cannot be renamed');
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket!.bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 3_000n,
      repeats: true,
    });
    const targetedMonth = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      targetedMonth.groups
        .flatMap((candidate) => candidate.buckets)
        .find((candidate) => candidate.installmentPlanId === installmentPlanId),
    ).toMatchObject({
      dueDate: '2026-07-10',
      neededMinor: 3_000n,
      underfundedMinor: 3_000n,
      target: { cadence: 'monthly', behaviour: 'setAside', amountMinor: 3_000n },
    });
    await expect(
      asUser.mutation(api.banking.plan.mapCategoriesToBucket, {
        bucketId: bucket!.bucketId,
        categoryIds: [],
      }),
    ).rejects.toThrow('Instalment buckets cannot map categories');
    await expect(asUser.mutation(api.banking.plan.deleteBucket, { bucketId: bucket!.bucketId })).rejects.toThrow(
      'Instalment buckets cannot be deleted',
    );
  });

  test('a loan paired to the user own category adopts that row instead of adding a second one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_pairing_user';
    await seedAuthKitUser(t, userId);
    const { accountId, providerConnectionId } = await seedAccount(t, userId);
    // Still to fall due at the frozen clock: updating the loan rolls a past instalment forward, and
    // this test is about the pairing, not about that.
    const { facilityId, installmentPlanId } = await seedInstallmentPlan(t, userId, accountId, {
      name: 'Mutuo',
      nextPaymentDate: '2026-07-25',
    });
    const { asUser, planId } = await createPlan(t, userId, accountId);
    const categoryId = await seedCategory(t, userId, 'Mortgage');
    const transactionId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: 'mortgage_july',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 68_442n, currency: 'EUR' },
        bookingDate: '2026-07-01',
        description: 'Mortgage instalment',
        classificationKind: 'expense',
        classificationSource: 'user',
        categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const groupId = await asUser.mutation(api.banking.plan.createGroup, { planId, name: 'Home & bills' });
    const bucketId = await asUser.mutation(api.banking.plan.createBucket, { planId, groupId, name: 'Home loan' });
    await asUser.mutation(api.banking.plan.mapCategoriesToBucket, { bucketId, categoryIds: [categoryId] });

    await asUser.mutation(api.banking.loans.reclassifyFacilityAsLoan, {
      creditFacilityId: facilityId,
      loanType: 'mortgage',
    });
    await asUser.mutation(api.banking.loans.updateLoanTerms, {
      creditFacilityId: facilityId,
      pairedPlanBucketId: bucketId,
    });

    const paired = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const instalments = paired.groups.find((candidate) => candidate.name === 'Instalments');
    // The generated row is gone: the loan now lives in the category the user chose, still called what
    // they called it, still in their group, still catching its own transactions.
    expect(instalments?.buckets.filter((candidate) => candidate.installmentPlanId === installmentPlanId)).toEqual([]);
    // The empty generated row is removed rather than parked in another group, where it would be the
    // duplicate the pairing exists to avoid.
    expect(
      paired.groups.flatMap((candidate) => candidate.buckets).filter((candidate) => candidate.name === 'Mutuo'),
    ).toEqual([]);
    const adopted = paired.groups
      .find((candidate) => candidate.groupId === groupId)
      ?.buckets.find((candidate) => candidate.bucketId === bucketId);
    expect(adopted).toMatchObject({
      name: 'Home loan',
      installmentPlanId,
      categoryIds: [categoryId],
      neededMinor: 5_453n,
      dueDate: '2026-07-25',
    });

    // The mortgage debit still belongs to the category that caught it: the row totals it and the
    // drill-down lists it, instead of the pairing quietly emptying both.
    expect(adopted?.activityMinor).toBe(-68_442n);
    const activity = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId,
      period: '2026-07',
    });
    expect(activity.rows).toMatchObject([{ _id: transactionId, direction: 'DBIT' }]);

    // Being paired must not turn their category into a system row they can no longer touch.
    await asUser.mutation(api.banking.plan.renameBucket, { bucketId, name: 'Mortgage payment' });
    await asUser.mutation(api.banking.plan.mapCategoriesToBucket, { bucketId, categoryIds: [categoryId] });
    await expect(asUser.mutation(api.banking.plan.deleteBucket, { bucketId })).rejects.toThrow(
      'Unpair the loan from this category before deleting it',
    );

    await asUser.mutation(api.banking.loans.updateLoanTerms, {
      creditFacilityId: facilityId,
      pairedPlanBucketId: null,
    });
    const released = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      released.groups
        .find((candidate) => candidate.groupId === groupId)
        ?.buckets.find((candidate) => candidate.bucketId === bucketId),
    ).toMatchObject({ name: 'Mortgage payment', installmentPlanId: null, categoryIds: [categoryId] });
    expect(
      released.groups
        .find((candidate) => candidate.name === 'Instalments')
        ?.buckets.find((candidate) => candidate.installmentPlanId === installmentPlanId)?.name,
    ).toBe('Mutuo');
  });

  test('moves a linked repayment exclusively into installment activity and keeps reconciliation closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_activity_user';
    await seedAuthKitUser(t, userId);
    const { accountId, providerConnectionId } = await seedAccount(t, userId, 94_547n);
    const categoryId = await seedCategory(t, userId);
    const { facilityId, installmentPlanId } = await seedInstallmentPlan(t, userId, accountId);
    const { asUser, planId } = await createPlan(t, userId, accountId);
    const transactionId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: 'findomestic_july',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 5_453n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Acme instalment',
        classificationKind: 'internal',
        classificationSource: 'system',
        categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId,
        creditFacilityId: facilityId,
        installmentPlanId,
        amount: { amountMinor: 5_453n, currency: 'EUR' },
        paymentDate: '2026-07-10',
        scheduledDueDate: '2026-07-10',
        source: 'transaction',
        transactionId: id,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return id;
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const installmentBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.installmentPlanId === installmentPlanId)!;
    const categoryBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.categoryIds.includes(categoryId))!;
    const details = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId: installmentBucket.bucketId,
      period: '2026-07',
    });

    expect(installmentBucket.activityMinor).toBe(-5_453n);
    expect(categoryBucket.activityMinor).toBe(0n);
    expect(month.breakdown.internalMinor).toBe(0n);
    expect(month.breakdown.transferNetMinor).toBe(0n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
    expect(details.rows).toMatchObject([{ _id: transactionId, direction: 'DBIT' }]);
  });

  test('gives every plan settled by one aggregated debit its own activity and its own share', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_installments_batch_user';
    await seedAuthKitUser(t, userId);
    const { accountId, providerConnectionId } = await seedAccount(t, userId);
    // One "RIMBORSO PRESTITO" of 153,70 settling three plans of the same facility at once.
    const plans = [
      await seedInstallmentPlan(t, userId, accountId, { name: 'Wise A', monthlyPaymentMinor: 6_183n }),
      await seedInstallmentPlan(t, userId, accountId, { name: 'TransferWise', monthlyPaymentMinor: 3_091n }),
      await seedInstallmentPlan(t, userId, accountId, { name: 'Wise B', monthlyPaymentMinor: 6_096n }),
    ];
    const { asUser, planId } = await createPlan(t, userId, accountId);
    const transactionId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: 'premium_line_july',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 15_370n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'RIMBORSO PRESTITO ESTRATTO 06/2026',
        classificationKind: 'internal',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
      for (const [index, plan] of plans.entries()) {
        await ctx.db.insert('creditFacilityInstallmentPayments', {
          userId,
          creditFacilityId: plan.facilityId,
          installmentPlanId: plan.installmentPlanId,
          amount: { amountMinor: [6_183n, 3_091n, 6_096n][index], currency: 'EUR' },
          paymentDate: '2026-07-10',
          scheduledDueDate: '2026-07-10',
          source: 'transaction',
          transactionId: id,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
      return id;
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const expectedShares = new Map([
      [plans[0].installmentPlanId, -6_183n],
      [plans[1].installmentPlanId, -3_091n],
      [plans[2].installmentPlanId, -6_096n],
    ]);
    for (const [installmentPlanId, activityMinor] of expectedShares) {
      const bucket = month.groups
        .flatMap((group) => group.buckets)
        .find((candidate) => candidate.installmentPlanId === installmentPlanId)!;
      expect(bucket.activityMinor).toBe(activityMinor);
      const details = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
        planId,
        bucketId: bucket.bucketId,
        period: '2026-07',
      });
      // Every bucket lists the debit, and each shows what it owns of it — not the whole 153,70.
      expect(details.rows).toMatchObject([
        { _id: transactionId, amount: { amountMinor: -activityMinor, currency: 'EUR' } },
      ]);
    }
    expect(month.breakdown.internalMinor).toBe(0n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
  });

  test('detaches a concluded installment bucket without deleting its data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_detach_user';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccount(t, userId);
    const { installmentPlanId } = await seedInstallmentPlan(t, userId, accountId);
    const { asUser, planId } = await createPlan(t, userId, accountId);
    const fixture = await t.run(async (ctx) => {
      const bucket = (
        await ctx.db
          .query('planBuckets')
          .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
          .take(100)
      ).find((candidate) => candidate.installmentPlanId === installmentPlanId)!;
      const now = Date.now();
      const assignmentId = await ctx.db.insert('planAssignments', {
        planId,
        userId,
        bucketId: bucket._id,
        period: '2026-07',
        assignedMinor: 5_453n,
        currency: 'EUR',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const targetId = await ctx.db.insert('planTargets', {
        planId,
        userId,
        bucketId: bucket._id,
        cadence: 'monthly',
        behaviour: 'setAside',
        amountMinor: 5_453n,
        currency: 'EUR',
        repeats: true,
        snoozedPeriods: [],
      });
      await ctx.db.patch('creditFacilityInstallmentPlans', installmentPlanId, {
        status: 'paid',
        remainingInstallments: 0,
        nextPaymentDate: undefined,
        updatedAtMs: now,
      });
      return { bucketId: bucket._id, assignmentId, targetId };
    });

    await asUser.mutation(api.banking.plan.updatePlanAccounts, { planId, accountIds: [accountId] });
    const detached = await t.run(async (ctx) => {
      const bucket = await ctx.db.get('planBuckets', fixture.bucketId);
      const group = bucket ? await ctx.db.get('planGroups', bucket.groupId) : null;
      return {
        bucket,
        group,
        assignment: await ctx.db.get('planAssignments', fixture.assignmentId),
        target: await ctx.db.get('planTargets', fixture.targetId),
      };
    });

    expect(detached.bucket?._id).toBe(fixture.bucketId);
    expect(detached.bucket).not.toHaveProperty('installmentPlanId');
    expect(detached.group?.name).not.toBe('Instalments');
    expect(detached.assignment).not.toBeNull();
    expect(detached.target).not.toBeNull();
  });

  test('backfills active installment buckets idempotently and schedules the existing snapshot rebuild', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_migration_user';
    const { accountId } = await seedAccount(t, userId);
    const { installmentPlanId } = await seedInstallmentPlan(t, userId, accountId, {
      nextPaymentDate: '2026-09-10',
    });
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Legacy plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [accountId],
        isDefault: true,
        sortOrder: 1000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Other',
        sortOrder: 1000,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Unplanned',
        sortOrder: 1000,
        hidden: false,
        isUnplanned: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const snapshotId = await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-07',
        entries: [],
        computedAtMs: now,
      });
      return { planId, snapshotId };
    });

    const first = await t.action(internal.migrations.backfillPlanInstallmentBuckets, { batchSize: 1 });
    const second = await t.action(internal.migrations.backfillPlanInstallmentBuckets, { batchSize: 1 });
    const rows = await t.run(async (ctx) => ({
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', fixture.planId))
        .take(10),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', fixture.planId))
        .take(10),
    }));

    expect(first).toEqual({
      processed: 1,
      changed: 1,
      createdGroups: 1,
      createdBuckets: 1,
      detachedBuckets: 0,
      snapshotRebuildScheduled: true,
    });
    expect(second).toEqual({
      processed: 1,
      changed: 0,
      createdGroups: 0,
      createdBuckets: 0,
      detachedBuckets: 0,
      snapshotRebuildScheduled: false,
    });
    expect(rows.groups.filter((group) => group.name === 'Instalments')).toHaveLength(1);
    expect(rows.buckets.filter((bucket) => bucket.installmentPlanId === installmentPlanId)).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get('planMonthSnapshots', fixture.snapshotId))).toBeNull();
  });

  test('Auto-Assign funds a due system bucket before a category without a due date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'installment_auto_assign_user';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccount(t, userId);
    const categoryId = await seedCategory(t, userId, 'Flexible spending');
    const { installmentPlanId } = await seedInstallmentPlan(t, userId, accountId);
    const { asUser, planId } = await createPlan(t, userId, accountId);
    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const installmentBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.installmentPlanId === installmentPlanId)!;
    const categoryBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.categoryIds.includes(categoryId))!;
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: categoryBucket.bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 1_000n,
      repeats: true,
    });

    const preview = await asUser.mutation(api.banking.plan.autoAssign, {
      planId,
      period: '2026-07',
      strategy: 'underfunded',
      bucketIds: [categoryBucket.bucketId, installmentBucket.bucketId],
      dryRun: true,
    });

    expect(preview.rows.map((row) => row.bucketId)).toEqual([installmentBucket.bucketId, categoryBucket.bucketId]);
  });
});
