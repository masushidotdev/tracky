/// <reference types="vite/client" />
import { createThread, listMessages } from '@convex-dev/agent';
import agentTest from '@convex-dev/agent/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { components } from '../../_generated/api';
import schema from '../../schema';
import type { Doc, Id } from '../../_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../../_generated/*.js',
  './queries.ts',
  './mutations.ts',
  './jobs.ts',
  '../../notifications.ts',
  '../../auth.ts',
  '../../authProfiles.ts',
  '../../banking/planning.ts',
  '../../banking/planningMath.ts',
  '../../banking/creditMath.ts',
  '../../banking/subscriptionDetection.ts',
  '../../lib/*.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../../') ? `./${path.slice(6)}` : `./analyst/proactive/${path.slice(2)}`,
    loader,
  ]),
);

const refs = {
  roster: makeFunctionReference<'query', { paginationOpts: { numItems: number; cursor: string | null } }, { page: Array<{ authUserId: string }>; continueCursor: string; isDone: boolean }>(
    'analyst/proactive/queries:listActiveUserProfilesPage',
  ),
  spending: makeFunctionReference<'query', { userId: string; asOfDate: string }, Array<{ scope: string; key: string; currentAmount: number }>>(
    'analyst/proactive/queries:spendingSeriesForUser',
  ),
  detectAnomaliesJob: makeFunctionReference<'action', { jobId: Id<'proactiveJobs'>; leaseToken: string }, null>(
    'analyst/proactive/jobs:detectSpendingAnomaliesForUser',
  ),
  healthInputs: makeFunctionReference<'query', { userId: string; asOfDate: string }, { inputs: Array<{ currency: string; trailingInflow: number }> }>(
    'analyst/proactive/queries:healthInputsForUser',
  ),
  subscriptionInputs: makeFunctionReference<'query', { userId: string; asOfDate: string }, { monthlyIncomeByCurrency: Record<string, number> }>(
    'analyst/proactive/queries:subscriptionReviewInputsForUser',
  ),
  anomalies: makeFunctionReference<'query', { userId: string; period: string; limit?: number }, Array<{ label: string; period: string }>>(
    'analyst/proactive/queries:getDetectedAnomaliesForUser',
  ),
  enqueueJob: makeFunctionReference<'mutation', { userId: string; kind: 'healthScore' | 'spendingAnomaly' | 'subscriptionReview' | 'monthlyReport'; asOfDate: string; period?: string; locale: string; nowMs?: number }, { jobId: Id<'proactiveJobs'>; inserted: boolean }>(
    'analyst/proactive/jobs:enqueueProactiveJob',
  ),
  watchdog: makeFunctionReference<'mutation', { limit?: number; nowMs?: number }, { scheduled: number; exhausted: number }>(
    'analyst/proactive/jobs:watchdogProactiveJobs',
  ),
  failJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; errorCode: string; nowMs?: number }, boolean>(
    'analyst/proactive/jobs:failProactiveJob',
  ),
  completeJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; nowMs?: number }, boolean>(
    'analyst/proactive/jobs:completeProactiveJob',
  ),
  startJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; nowMs?: number }, Doc<'proactiveJobs'> | null>(
    'analyst/proactive/jobs:startOrRenewProactiveJob',
  ),
  deferJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; retryAtMs: number; nowMs?: number }, boolean>(
    'analyst/proactive/jobs:deferProactiveJob',
  ),
  claim: makeFunctionReference<'mutation', { userId: string; kind: 'monthly' | 'subscriptionReview'; period: string; locale: string }, { claimed: boolean; reportId: Id<'agentReports'>; retryAtMs: number | null }>(
    'analyst/proactive/mutations:claimReport',
  ),
  prepareReport: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; preferredThreadId?: string; threadTitle: string }, { threadId: string; outputMessageId: string }>(
    'analyst/proactive/mutations:prepareReportDelivery',
  ),
  fail: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; errorMessage: string }, Id<'agentReports'> | null>(
    'analyst/proactive/mutations:failReport',
  ),
  complete: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; threadId: string; summary: string }, Id<'agentReports'>>(
    'analyst/proactive/mutations:completeReport',
  ),
  saveHealth: makeFunctionReference<'mutation', { userId: string; computedAtDate: string; currency: string; score: number; components: { savingsRate: number; budgetAdherence: number; debtLoad: number; liquidityMonths: number; subscriptionLoad: number } }, { snapshotId: Id<'healthScoreSnapshots'>; delta: number }>(
    'analyst/proactive/mutations:saveHealthSnapshot',
  ),
  subscriptionReview: makeFunctionReference<'mutation', { userId: string; period: string; locale: string; summary: string; reviews: Array<{ currency: string; monthlyTotal: number; actionableCount: number; shouldNotify: boolean }> }, { reportId: Id<'agentReports'> }>(
    'analyst/proactive/mutations:persistSubscriptionReview',
  ),
};

function createTest() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  return t;
}

afterEach(() => vi.useRealTimers());

async function seedTransactionContext(t: ReturnType<typeof createTest>) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const userId = 'user_proactive';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      name: 'Main',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const categoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { userId, providerConnectionId, accountId, categoryId };
  });
}

describe('proactive analyst persistence and inputs', () => {
  test('does not enqueue jobs after erasure starts or after its tombstone remains', async () => {
    const t = createTest();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('user_done'));
    const userHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await t.run(async (ctx) => {
      await ctx.db.insert('accountDeletions', {
        userId: 'user_wiping', userHash: 'pending-hash', status: 'failed', currentStep: 'misc',
        requestedAtMs: 1, updatedAtMs: 1, attemptCount: 1, workosDeleted: false,
      });
      await ctx.db.insert('deletedUsers', { userHash, deletedAtMs: 2 });
    });

    const input = { kind: 'healthScore' as const, asOfDate: '2026-07-11', locale: 'en' };
    expect(await t.mutation(refs.enqueueJob, { ...input, userId: 'user_wiping' }))
      .toMatchObject({ jobId: null, inserted: false, status: 'skipped' });
    expect(await t.mutation(refs.enqueueJob, { ...input, userId: 'user_done' }))
      .toMatchObject({ jobId: null, inserted: false, status: 'skipped' });
    expect(await t.run(async (ctx) => await ctx.db.query('proactiveJobs').take(10)))
      .toHaveLength(0);
  });

  test('paginates only active user profiles', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      for (const [authUserId, status] of [['active-1', 'active'], ['deleted', 'deleted'], ['active-2', 'active']] as const) {
        await ctx.db.insert('userProfiles', {
          authUserId,
          status,
          createdAtMs: 1,
          updatedAtMs: 1,
          lastSyncedAtMs: 1,
        });
      }
    });
    const page = await t.query(refs.roster, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.page.map((profile) => profile.authUserId).sort()).toEqual(['active-1', 'active-2']);
  });

  test('anomaly input excludes transfer/internal and aggregates category and merchant', async () => {
    const t = createTest();
    const seeded = await seedTransactionContext(t);
    await t.run(async (ctx) => {
      for (const [id, kind, amount] of [
        ['expense', 'expense', 2_500n],
        ['transfer', 'transfer', 50_000n],
        ['internal', 'internal', 40_000n],
      ] as const) {
        await ctx.db.insert('transactions', {
          userId: seeded.userId,
          accountId: seeded.accountId,
          providerConnectionId: seeded.providerConnectionId,
          provider: 'mock',
          providerTransactionId: id,
          dedupeKey: id,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor: amount, currency: 'EUR' },
          bookingDate: '2026-07-10',
          description: 'Market One',
          counterpartyName: 'Market One',
          classificationKind: kind,
          classificationSource: 'system',
          categoryId: kind === 'expense' ? seeded.categoryId : undefined,
          importedAtMs: 1,
          updatedAtMs: 1,
        });
      }
    });
    const rows = await t.query(refs.spending, { userId: seeded.userId, asOfDate: '2026-07-11' });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.scope).sort()).toEqual(['category', 'merchant']);
    expect(rows.every((row) => row.currentAmount === 25)).toBe(true);
  });

  test('anomaly worker persists the strict mutation payload and completes its leased job', async () => {
    const t = createTest();
    const seeded = await seedTransactionContext(t);
    const jobId = await t.run(async (ctx) => {
      for (const [period, amountMinor] of [
        ['2026-04', 10_000n],
        ['2026-05', 10_000n],
        ['2026-06', 10_000n],
        ['2026-07', 15_000n],
      ] as const) {
        await ctx.db.insert('transactions', {
          userId: seeded.userId,
          accountId: seeded.accountId,
          providerConnectionId: seeded.providerConnectionId,
          provider: 'mock',
          providerTransactionId: `anomaly-${period}`,
          dedupeKey: `anomaly-${period}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor, currency: 'EUR' },
          bookingDate: `${period}-10`,
          description: 'Market One',
          counterpartyName: 'Market One',
          classificationKind: 'expense',
          classificationSource: 'system',
          categoryId: seeded.categoryId,
          importedAtMs: 1,
          updatedAtMs: 1,
        });
      }
      const now = Date.now();
      return await ctx.db.insert('proactiveJobs', {
        userId: seeded.userId,
        kind: 'spendingAnomaly',
        dedupeKey: `spendingAnomaly:${seeded.userId}:2026-07-13`,
        asOfDate: '2026-07-13',
        locale: 'en',
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        nextRunAtMs: now,
        leaseToken: 'anomaly-worker-token',
        leaseExpiresAtMs: now + 60_000,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(t.action(refs.detectAnomaliesJob, {
      jobId,
      leaseToken: 'anomaly-worker-token',
    })).resolves.toBeNull();

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get('proactiveJobs', jobId),
      notifications: await ctx.db
        .query('notifications')
        .withIndex('by_userId', (q) => q.eq('userId', seeded.userId))
        .take(10),
    }));
    expect(result.job).toMatchObject({ status: 'completed', attempts: 1 });
    expect(result.notifications).toEqual([
      expect.objectContaining({
        type: 'spendingAnomaly',
        params: expect.objectContaining({ amount: 150, baseline: 100, currency: 'EUR' }),
      }),
      expect.objectContaining({
        type: 'spendingAnomaly',
        params: expect.objectContaining({ amount: 150, baseline: 100, currency: 'EUR' }),
      }),
    ]);
  });

  test('BOOK index prevents more than the transaction cap of provisional states from hiding booked aggregates', async () => {
    const t = createTest();
    const seeded = await seedTransactionContext(t);
    const nonBookedStatuses = ['PDNG', 'SCHD', 'HOLD', 'CNCL'] as const;
    for (let offset = 0; offset < 5_001; offset += 500) {
      await t.run(async (ctx) => {
        for (let index = offset; index < Math.min(offset + 500, 5_001); index += 1) {
          await ctx.db.insert('transactions', {
            userId: seeded.userId,
            accountId: seeded.accountId,
            providerConnectionId: seeded.providerConnectionId,
            provider: 'mock',
            providerTransactionId: `provisional-${index}`,
            dedupeKey: `provisional-${index}`,
            status: nonBookedStatuses[index % nonBookedStatuses.length],
            direction: index % 2 === 0 ? 'DBIT' : 'CRDT',
            amount: { amountMinor: 9_999_999n, currency: 'EUR' },
            bookingDate: '2026-07-10',
            description: 'Provisional noise',
            classificationKind: index % 2 === 0 ? 'expense' : 'income',
            classificationSource: 'system',
            importedAtMs: index + 10,
            updatedAtMs: index + 10,
          });
        }
      });
    }
    await t.run(async (ctx) => {
      await ctx.db.insert('transactions', {
        userId: seeded.userId,
        accountId: seeded.accountId,
        providerConnectionId: seeded.providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'booked-expense',
        dedupeKey: 'booked-expense',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2_500n, currency: 'EUR' },
        bookingDate: '2026-07-01',
        description: 'Booked Market',
        counterpartyName: 'Booked Market',
        classificationKind: 'expense',
        classificationSource: 'system',
        categoryId: seeded.categoryId,
        importedAtMs: 1,
        updatedAtMs: 1,
      });
      await ctx.db.insert('transactions', {
        userId: seeded.userId,
        accountId: seeded.accountId,
        providerConnectionId: seeded.providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'booked-income',
        dedupeKey: 'booked-income',
        status: 'BOOK',
        direction: 'CRDT',
        amount: { amountMinor: 300_000n, currency: 'EUR' },
        bookingDate: '2026-06-01',
        description: 'Booked Salary',
        classificationKind: 'income',
        classificationSource: 'system',
        importedAtMs: 2,
        updatedAtMs: 2,
      });
    });

    const spending = await t.query(refs.spending, { userId: seeded.userId, asOfDate: '2026-07-11' });
    expect(spending.find((row) => row.scope === 'category')?.currentAmount).toBe(25);
    const health = await t.query(refs.healthInputs, { userId: seeded.userId, asOfDate: '2026-07-11' });
    expect(health.inputs.find((row) => row.currency === 'EUR')?.trailingInflow).toBe(3_000);
    const subscriptions = await t.query(refs.subscriptionInputs, { userId: seeded.userId, asOfDate: '2026-07-11' });
    expect(subscriptions.monthlyIncomeByCurrency.EUR).toBe(1_000);
  }, 30_000);

  test('exact anomaly index is not obscured by more than one hundred heterogeneous notifications', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('notifications', {
        userId: 'user_anomalies',
        type: 'spendingAnomaly',
        severity: 'warning',
        titleKey: 'anomaly',
        bodyKey: 'anomaly',
        params: { label: 'Groceries', currency: 'EUR', amount: 120, baseline: 50, percent: 140, period: '2026-06' },
        dedupeKey: 'analyst:anomaly:2026-06:EUR:category:groceries',
        createdAtMs: 1,
      });
      for (let index = 0; index < 150; index += 1) {
        await ctx.db.insert('notifications', {
          userId: 'user_anomalies',
          type: index % 2 === 0 ? 'healthScore' : 'budgetOverspend',
          severity: 'info',
          titleKey: 'other',
          bodyKey: 'other',
          params: { period: '2026-07' },
          dedupeKey: `other-${index}`,
          createdAtMs: index + 2,
        });
      }
    });
    await expect(t.query(refs.anomalies, { userId: 'user_anomalies', period: '2026-06', limit: 10 }))
      .resolves.toEqual([expect.objectContaining({ label: 'Groceries', period: '2026-06' })]);
  });

  test('durable proactive queue dedupes, retries, recovers expired leases, and stops at max attempts', async () => {
    // enqueueProactiveJob also schedules an immediate watchdog. Keep that
    // background timer paused while this test drives each lease explicitly.
    vi.useFakeTimers();
    const t = createTest();
    const input = { userId: 'user_queue', kind: 'healthScore' as const, asOfDate: '2026-07-11', locale: 'en', nowMs: 1_000 };
    const first = await t.mutation(refs.enqueueJob, input);
    const duplicate = await t.mutation(refs.enqueueJob, input);
    expect(duplicate).toMatchObject({ jobId: first.jobId, inserted: false });

    expect(await t.mutation(refs.watchdog, { nowMs: 1_000, limit: 10 })).toEqual({ scheduled: 1, exhausted: 0 });
    let job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', first.jobId));
    expect(job).toMatchObject({ status: 'running', attempts: 1 });
    const firstToken = job!.leaseToken!;

    await t.mutation(refs.failJob, { jobId: first.jobId, leaseToken: firstToken, errorCode: 'EXPECTED', nowMs: 1_000 });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', first.jobId));
    expect(job).toMatchObject({ status: 'pending', attempts: 1, nextRunAtMs: 31_000 });
    expect(await t.mutation(refs.watchdog, { nowMs: 30_999, limit: 10 })).toEqual({ scheduled: 0, exhausted: 0 });
    expect(await t.mutation(refs.watchdog, { nowMs: 31_000, limit: 10 })).toEqual({ scheduled: 1, exhausted: 0 });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', first.jobId));
    expect(job).toMatchObject({ status: 'running', attempts: 2 });

    const secondToken = job!.leaseToken!;
    const leaseExpiry = job!.leaseExpiresAtMs!;
    expect(await t.mutation(refs.watchdog, { nowMs: leaseExpiry + 1, limit: 10 })).toEqual({ scheduled: 1, exhausted: 0 });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', first.jobId));
    expect(job).toMatchObject({ status: 'running', attempts: 3 });
    expect(job!.leaseToken).not.toBe(secondToken);

    await t.mutation(refs.failJob, {
      jobId: first.jobId,
      leaseToken: job!.leaseToken!,
      errorCode: 'EXPECTED_FINAL',
      nowMs: leaseExpiry + 1,
    });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', first.jobId));
    expect(job).toMatchObject({ status: 'failed', attempts: 3, errorCode: 'EXPECTED_FINAL' });
    expect(await t.mutation(refs.watchdog, { nowMs: leaseExpiry + 1_000_000, limit: 10 })).toEqual({ scheduled: 0, exhausted: 0 });

    const completable = await t.mutation(refs.enqueueJob, { ...input, asOfDate: '2026-07-12', nowMs: 2_000_000 });
    await t.mutation(refs.watchdog, { nowMs: 2_000_000, limit: 10 });
    const claimed = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', completable.jobId));
    expect(await t.mutation(refs.completeJob, { jobId: completable.jobId, leaseToken: claimed!.leaseToken!, nowMs: 2_000_001 })).toBe(true);
    expect(await t.run(async (ctx) => (await ctx.db.get('proactiveJobs', completable.jobId))?.status)).toBe('completed');
  });

  test('expired dispatch tokens cannot start or mutate state after watchdog fencing', async () => {
    const t = createTest();
    const queued = await t.mutation(refs.enqueueJob, {
      userId: 'user_fenced',
      kind: 'healthScore',
      asOfDate: '2026-07-13',
      locale: 'en',
      nowMs: 1_000,
    });
    await t.mutation(refs.watchdog, { nowMs: 1_000, limit: 10 });
    let job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
    const expiredToken = job!.leaseToken!;
    const expiredAt = job!.leaseExpiresAtMs!;

    expect(await t.mutation(refs.startJob, {
      jobId: queued.jobId,
      leaseToken: expiredToken,
      nowMs: expiredAt,
    })).toBeNull();
    await t.mutation(refs.watchdog, { nowMs: expiredAt, limit: 10 });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
    const winningToken = job!.leaseToken!;
    expect(winningToken).not.toBe(expiredToken);

    await expect(t.mutation(refs.startJob, { jobId: queued.jobId, leaseToken: expiredToken, nowMs: expiredAt + 1 }))
      .resolves.toBeNull();
    await expect(t.mutation(refs.completeJob, { jobId: queued.jobId, leaseToken: expiredToken, nowMs: expiredAt + 1 }))
      .resolves.toBe(false);
    await expect(t.mutation(refs.failJob, { jobId: queued.jobId, leaseToken: expiredToken, errorCode: 'STALE', nowMs: expiredAt + 1 }))
      .resolves.toBe(false);
    const renewed = await t.mutation(refs.startJob, {
      jobId: queued.jobId,
      leaseToken: winningToken,
      nowMs: expiredAt + 1,
    });
    expect(renewed).toMatchObject({ status: 'running', leaseToken: winningToken });
    expect(renewed!.leaseExpiresAtMs).toBe(expiredAt + 1 + 15 * 60 * 1_000);
  });

  test('a recent running report claim defers durably without consuming queue attempts', async () => {
    const t = createTest();
    const now = Date.now();
    const queued = await t.mutation(refs.enqueueJob, {
      userId: 'user_deferred_report',
      kind: 'monthlyReport',
      asOfDate: '2026-07-02',
      period: '2026-06',
      locale: 'en',
      nowMs: now,
    });
    await t.mutation(refs.watchdog, { nowMs: now, limit: 10 });
    const claimedJob = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
    expect(claimedJob).toMatchObject({ status: 'running', attempts: 1 });

    await t.run(async (ctx) => {
      await ctx.db.insert('agentReports', {
        userId: 'user_deferred_report',
        kind: 'monthly',
        period: '2026-06',
        status: 'running',
        locale: 'en',
        attempts: 1,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const unavailable = await t.mutation(refs.claim, {
      userId: 'user_deferred_report',
      kind: 'monthly',
      period: '2026-06',
      locale: 'en',
    });
    expect(unavailable.claimed).toBe(false);
    expect(unavailable.retryAtMs).toBe(now + 10 * 60 * 1_000);
    await t.mutation(refs.deferJob, {
      jobId: queued.jobId,
      leaseToken: claimedJob!.leaseToken!,
      retryAtMs: unavailable.retryAtMs!,
      nowMs: now + 30_000,
    });

    for (const beforeStale of [now + 60_000, now + 5 * 60_000, unavailable.retryAtMs! - 1]) {
      expect(await t.mutation(refs.watchdog, { nowMs: beforeStale, limit: 10 })).toEqual({ scheduled: 0, exhausted: 0 });
    }
    let job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
    expect(job).toMatchObject({ status: 'pending', attempts: 0, nextRunAtMs: unavailable.retryAtMs });

    expect(await t.mutation(refs.watchdog, { nowMs: unavailable.retryAtMs!, limit: 10 }))
      .toEqual({ scheduled: 1, exhausted: 0 });
    job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
    expect(job).toMatchObject({ status: 'running', attempts: 1 });
    await t.run(async (ctx) => {
      const report = await ctx.db
        .query('agentReports')
        .withIndex('by_userId_and_period_and_kind', (q) =>
          q.eq('userId', 'user_deferred_report').eq('period', '2026-06').eq('kind', 'monthly'),
        )
        .unique();
      await ctx.db.patch('agentReports', report!._id, { updatedAtMs: Date.now() - 10 * 60 * 1_000 - 1 });
    });
    const reclaimable = await t.mutation(refs.claim, {
      userId: 'user_deferred_report',
      kind: 'monthly',
      period: '2026-06',
      locale: 'en',
    });
    expect(reclaimable).toMatchObject({ claimed: true, retryAtMs: null });
  });

  test('claims atomically and stops failed retries after three attempts', async () => {
    const t = createTest();
    const input = { userId: 'user_claim', kind: 'monthly' as const, period: '2026-06', locale: 'en' };
    const first = await t.mutation(refs.claim, input);
    expect(first.claimed).toBe(true);
    expect((await t.mutation(refs.claim, input)).claimed).toBe(false);
    await t.mutation(refs.fail, { reportId: first.reportId, userId: input.userId, errorMessage: 'secret\nerror' });
    const second = await t.mutation(refs.claim, input);
    expect(second.claimed).toBe(true);
    await t.mutation(refs.fail, { reportId: first.reportId, userId: input.userId, errorMessage: 'again' });
    const third = await t.mutation(refs.claim, input);
    expect(third.claimed).toBe(true);
    await t.mutation(refs.fail, { reportId: first.reportId, userId: input.userId, errorMessage: 'third' });
    expect((await t.mutation(refs.claim, input)).claimed).toBe(false);
  });

  test('completes a monthly report with its deduplicated inbox notification', async () => {
    const t = createTest();
    const input = { userId: 'user_report', kind: 'monthly' as const, period: '2026-06', locale: 'en' };
    const claim = await t.mutation(refs.claim, input);
    await t.mutation(refs.complete, {
      reportId: claim.reportId,
      userId: input.userId,
      threadId: 'thread_monthly',
      summary: '# Report\n\nDetails',
    });
    await t.mutation(refs.complete, {
      reportId: claim.reportId,
      userId: input.userId,
      threadId: 'thread_monthly',
      summary: '# Different retry output',
    });
    const state = await t.run(async (ctx) => ({
      report: await ctx.db.get('agentReports', claim.reportId),
      notifications: await ctx.db.query('notifications').take(10),
    }));
    expect(state.report?.summary).toBe('# Report\n\nDetails');
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe('analystReport');
  });

  test('report delivery replaces one pending output and does not reuse an unvalidated stale thread', async () => {
    const t = createTest();
    const input = { userId: 'user_delivery', kind: 'monthly' as const, period: '2026-06', locale: 'en' };
    const claim = await t.mutation(refs.claim, input);
    await t.run(async (ctx) => {
      await ctx.db.patch('agentReports', claim.reportId, {
        threadId: 'deleted-thread',
        outputMessageId: 'deleted-message',
      });
    });

    const prepared = await t.mutation(refs.prepareReport, {
      reportId: claim.reportId,
      userId: input.userId,
      preferredThreadId: 'deleted-thread',
      threadTitle: 'Monthly reports',
    });
    expect(prepared.threadId).not.toBe('deleted-thread');
    expect(prepared.outputMessageId).not.toBe('deleted-message');
    await expect(t.mutation(refs.prepareReport, {
      reportId: claim.reportId,
      userId: input.userId,
      preferredThreadId: prepared.threadId,
      threadTitle: 'Monthly reports',
    })).resolves.toEqual(prepared);

    let messages = await t.run(async (ctx) => await listMessages(ctx, components.agent, {
      threadId: prepared.threadId,
      paginationOpts: { cursor: null, numItems: 10 },
    }));
    expect(messages.page).toHaveLength(1);
    expect(messages.page[0]).toMatchObject({ _id: prepared.outputMessageId, status: 'pending' });

    await t.mutation(refs.complete, {
      reportId: claim.reportId,
      userId: input.userId,
      threadId: prepared.threadId,
      summary: 'Authoritative output',
    });
    await t.mutation(refs.complete, {
      reportId: claim.reportId,
      userId: input.userId,
      threadId: prepared.threadId,
      summary: 'Late duplicate output',
    });
    messages = await t.run(async (ctx) => await listMessages(ctx, components.agent, {
      threadId: prepared.threadId,
      paginationOpts: { cursor: null, numItems: 10 },
    }));
    expect(messages.page).toHaveLength(1);
    expect(messages.page[0]).toMatchObject({
      _id: prepared.outputMessageId,
      status: 'success',
      text: 'Authoritative output',
    });
    expect(await t.run(async (ctx) => (await ctx.db.get('agentReports', claim.reportId))?.summary))
      .toBe('Authoritative output');

    const foreignThreadId = await t.run(async (ctx) => await createThread(ctx, components.agent, {
      userId: 'different-user',
    }));
    const foreignClaim = await t.mutation(refs.claim, { ...input, period: '2026-05' });
    const foreignRejected = await t.mutation(refs.prepareReport, {
      reportId: foreignClaim.reportId,
      userId: input.userId,
      preferredThreadId: foreignThreadId,
      threadTitle: 'Monthly reports',
    });
    expect(foreignRejected.threadId).not.toBe(foreignThreadId);
  });

  test('terminal monthly failure atomically finalizes the one pending slot after intermediate retries', async () => {
    const t = createTest();
    const base = Date.now();
    const userId = 'user_terminal_report';
    const queued = await t.mutation(refs.enqueueJob, {
      userId,
      kind: 'monthlyReport',
      asOfDate: '2026-07-02',
      period: '2026-04',
      locale: 'en',
      nowMs: base,
    });
    await t.mutation(refs.watchdog, { nowMs: base, limit: 10 });
    let reportClaim = await t.mutation(refs.claim, { userId, kind: 'monthly', period: '2026-04', locale: 'en' });
    const prepared = await t.mutation(refs.prepareReport, {
      reportId: reportClaim.reportId,
      userId,
      threadTitle: 'Monthly reports',
    });

    for (const [attempt, now] of [base, base + 30_000, base + 90_000].entries()) {
      if (attempt > 0) {
        await t.mutation(refs.watchdog, { nowMs: now, limit: 10 });
        reportClaim = await t.mutation(refs.claim, { userId, kind: 'monthly', period: '2026-04', locale: 'en' });
        await t.mutation(refs.prepareReport, {
          reportId: reportClaim.reportId,
          userId,
          preferredThreadId: prepared.threadId,
          threadTitle: 'Monthly reports',
        });
      }
      const job = await t.run(async (ctx) => await ctx.db.get('proactiveJobs', queued.jobId));
      await t.mutation(refs.fail, {
        reportId: reportClaim.reportId,
        userId,
        errorMessage: 'MONTHLY_REPORT_GENERATION_FAILED',
      });
      const beforeTerminal = await t.run(async (ctx) => await listMessages(ctx, components.agent, {
        threadId: prepared.threadId,
        paginationOpts: { cursor: null, numItems: 10 },
      }));
      expect(beforeTerminal.page).toHaveLength(1);
      expect(beforeTerminal.page[0]).toMatchObject({ _id: prepared.outputMessageId, status: 'pending' });
      if (attempt < 2) {
        await t.mutation(refs.failJob, {
          jobId: queued.jobId,
          leaseToken: job!.leaseToken!,
          errorCode: 'MONTHLY_REPORT_GENERATION_FAILED',
          nowMs: now,
        });
      } else {
        await expect(t.mutation(refs.watchdog, { nowMs: job!.leaseExpiresAtMs!, limit: 10 }))
          .resolves.toEqual({ scheduled: 0, exhausted: 1 });
      }
    }

    const terminal = await t.run(async (ctx) => ({
      job: await ctx.db.get('proactiveJobs', queued.jobId),
      report: await ctx.db.get('agentReports', reportClaim.reportId),
    }));
    const messages = await t.run(async (ctx) => await listMessages(ctx, components.agent, {
      threadId: prepared.threadId,
      paginationOpts: { cursor: null, numItems: 10 },
    }));
    expect(terminal.job).toMatchObject({ status: 'failed', attempts: 3 });
    expect(terminal.report).toMatchObject({ status: 'failed', errorMessage: 'MONTHLY_REPORT_GENERATION_FAILED' });
    expect(messages.page).toHaveLength(1);
    expect(messages.page[0]).toMatchObject({
      _id: prepared.outputMessageId,
      status: 'failed',
      error: 'MONTHLY_REPORT_GENERATION_FAILED',
    });
  });

  test('terminal queue reconciliation preserves an already-completed report', async () => {
    const t = createTest();
    const now = Date.now();
    const userId = 'user_completed_reconcile';
    const queued = await t.mutation(refs.enqueueJob, {
      userId,
      kind: 'monthlyReport',
      asOfDate: '2026-07-02',
      period: '2026-03',
      locale: 'en',
      nowMs: now,
    });
    await t.mutation(refs.watchdog, { nowMs: now, limit: 10 });
    const claim = await t.mutation(refs.claim, { userId, kind: 'monthly', period: '2026-03', locale: 'en' });
    const prepared = await t.mutation(refs.prepareReport, {
      reportId: claim.reportId,
      userId,
      threadTitle: 'Monthly reports',
    });
    await t.mutation(refs.complete, {
      reportId: claim.reportId,
      userId,
      threadId: prepared.threadId,
      summary: 'Completed before queue acknowledgement',
    });
    const running = await t.run(async (ctx) => {
      const job = await ctx.db.get('proactiveJobs', queued.jobId);
      await ctx.db.patch('proactiveJobs', queued.jobId, { attempts: 3 });
      return job!;
    });
    await t.mutation(refs.failJob, {
      jobId: queued.jobId,
      leaseToken: running.leaseToken!,
      errorCode: 'LATE_FAILURE',
      nowMs: now + 1,
    });

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get('proactiveJobs', queued.jobId),
      report: await ctx.db.get('agentReports', claim.reportId),
    }));
    const messages = await t.run(async (ctx) => await listMessages(ctx, components.agent, {
      threadId: prepared.threadId,
      paginationOpts: { cursor: null, numItems: 10 },
    }));
    expect(state.job).toMatchObject({ status: 'completed', attempts: 3 });
    expect(state.report).toMatchObject({ status: 'completed', summary: 'Completed before queue acknowledgement' });
    expect(messages.page).toHaveLength(1);
    expect(messages.page[0]).toMatchObject({ status: 'success', text: 'Completed before queue acknowledgement' });
  });

  test('upserts same-day health snapshots and notifies only at the delta threshold', async () => {
    const t = createTest();
    const healthComponents = { savingsRate: 50, budgetAdherence: 50, debtLoad: 50, liquidityMonths: 50, subscriptionLoad: 50 };
    const first = await t.mutation(refs.saveHealth, { userId: 'user_health', computedAtDate: '2026-07-09', currency: 'EUR', score: 70, components: healthComponents });
    const sameDay = await t.mutation(refs.saveHealth, { userId: 'user_health', computedAtDate: '2026-07-09', currency: 'EUR', score: 72, components: healthComponents });
    expect(sameDay.snapshotId).toBe(first.snapshotId);
    await t.mutation(refs.saveHealth, { userId: 'user_health', computedAtDate: '2026-07-10', currency: 'EUR', score: 77, components: healthComponents });
    await t.mutation(refs.saveHealth, { userId: 'user_health', computedAtDate: '2026-07-11', currency: 'EUR', score: 70, components: healthComponents });
    const state = await t.run(async (ctx) => ({
      snapshots: await ctx.db.query('healthScoreSnapshots').take(10),
      notifications: await ctx.db.query('notifications').take(10),
    }));
    expect(state.snapshots).toHaveLength(3);
    expect(state.notifications).toHaveLength(2);
    expect(state.notifications.map((row) => row.severity).sort()).toEqual(['info', 'warning']);
  });

  test('dedupes subscription review report and actionable notification', async () => {
    const t = createTest();
    const input = {
      userId: 'user_sub_review',
      period: '2026-07',
      locale: 'en',
      summary: 'One duplicate',
      reviews: [{ currency: 'EUR', monthlyTotal: 50, actionableCount: 1, shouldNotify: true }],
    };
    const first = await t.mutation(refs.subscriptionReview, input);
    const second = await t.mutation(refs.subscriptionReview, input);
    expect(second.reportId).toBe(first.reportId);
    const state = await t.run(async (ctx) => ({
      reports: await ctx.db.query('agentReports').take(10),
      notifications: await ctx.db.query('notifications').take(10),
    }));
    expect(state.reports).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe('subscriptionReview');
  });
});
