import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { internalAction, internalMutation } from '../../_generated/server';
import { decide, jevChoice, jevNoul, minimizeJevText } from '../../lib/jev';
import { anomalyGateQuestions, healthDriverQuestions, routeAnomalyGate } from './jevGates';
import { detectSpendingAnomalies, toPersistedSpendingAnomaly } from './anomalyCore';
import { computeHealthScore } from './healthScoreCore';
import { formatSubscriptionReviewSummary, reviewSubscriptions } from './subscriptionReviewCore';
import type { Doc, Id } from '../../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../../_generated/server';

const PAGE_SIZE = 20;
const MAX_ATTEMPTS = 3;
const WATCHDOG_BATCH_SIZE = 20;
// Convex actions have a shorter maximum runtime than this fence. A worker that
// starts within its dispatch lease renews from its actual start time.
const JOB_LEASE_MS = 15 * 60 * 1_000;
const RETRY_BASE_DELAY_MS = 30_000;

class ProactiveJobStepError extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
    this.name = 'ProactiveJobStepError';
  }
}

async function runProactiveJobStep<T>(errorCode: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new ProactiveJobStepError(errorCode);
  }
}

const proactiveJobKindValidator = v.union(
  v.literal('healthScore'),
  v.literal('spendingAnomaly'),
  v.literal('subscriptionReview'),
  v.literal('monthlyReport'),
);

type ProactiveJobKind = Doc<'proactiveJobs'>['kind'];
type ProfilePage = {
  page: Array<{ authUserId: string; locale?: string; name?: string }>;
  isDone: boolean;
  continueCursor: string;
};

const refs = {
  profiles: makeFunctionReference<'query', { paginationOpts: { numItems: number; cursor: string | null } }, ProfilePage>(
    'analyst/proactive/queries:listActiveUserProfilesPage',
  ),
  healthInputs: makeFunctionReference<'query', { userId: string; asOfDate: string }, { primaryCurrency: string | null; inputs: Array<Parameters<typeof computeHealthScore>[0] & { currency: string }> }>(
    'analyst/proactive/queries:healthInputsForUser',
  ),
  spendingSeries: makeFunctionReference<'query', { userId: string; asOfDate: string }, Parameters<typeof detectSpendingAnomalies>[0]>(
    'analyst/proactive/queries:spendingSeriesForUser',
  ),
  subscriptionInputs: makeFunctionReference<'query', { userId: string; asOfDate: string }, { subscriptions: Parameters<typeof reviewSubscriptions>[0]; monthlyIncomeByCurrency: Record<string, number> }>(
    'analyst/proactive/queries:subscriptionReviewInputsForUser',
  ),
  saveHealth: makeFunctionReference<'mutation', { userId: string; computedAtDate: string; currency: string; score: number; components: ReturnType<typeof computeHealthScore>['components'] }, unknown>(
    'analyst/proactive/mutations:saveHealthSnapshot',
  ),
  persistAnomalies: makeFunctionReference<'mutation', { userId: string; period: string; anomalies: Array<{ scope: 'category' | 'merchant'; key: string; label: string; currency: string; currentAmount: number; mean: number; zScore: number; percentAboveBaseline: number; jevNotify?: boolean; jevSeverity?: 'info' | 'warning' | 'critical' }> }, unknown>(
    'analyst/proactive/mutations:persistAnomalyNotifications',
  ),
  persistSubscriptionReview: makeFunctionReference<'mutation', { userId: string; period: string; locale: string; summary: string; reviews: Array<{ currency: string; monthlyTotal: number; actionableCount: number; shouldNotify: boolean }> }, unknown>(
    'analyst/proactive/mutations:persistSubscriptionReview',
  ),
  dispatchHealth: makeFunctionReference<'mutation', { cursor: string | null; asOfDate?: string }, null>(
    'analyst/proactive/jobs:dispatchHealthScores',
  ),
  dispatchAnomalies: makeFunctionReference<'mutation', { cursor: string | null; asOfDate?: string }, null>(
    'analyst/proactive/jobs:dispatchSpendingAnomalies',
  ),
  dispatchSubscriptions: makeFunctionReference<'mutation', { cursor: string | null; asOfDate?: string; period?: string }, null>(
    'analyst/proactive/jobs:dispatchSubscriptionReviews',
  ),
  dispatchReports: makeFunctionReference<'mutation', { cursor: string | null; asOfDate?: string; period?: string }, null>(
    'analyst/proactive/jobs:dispatchMonthlyReports',
  ),
  watchdog: makeFunctionReference<'mutation', { limit?: number; nowMs?: number }, unknown>(
    'analyst/proactive/jobs:watchdogProactiveJobs',
  ),
  computeHealth: makeFunctionReference<'action', { jobId: Id<'proactiveJobs'>; leaseToken: string }, null>(
    'analyst/proactive/jobs:computeHealthScoreForUser',
  ),
  detectAnomalies: makeFunctionReference<'action', { jobId: Id<'proactiveJobs'>; leaseToken: string }, null>(
    'analyst/proactive/jobs:detectSpendingAnomaliesForUser',
  ),
  reviewSubscriptions: makeFunctionReference<'action', { jobId: Id<'proactiveJobs'>; leaseToken: string }, null>(
    'analyst/proactive/jobs:reviewSubscriptionsForUser',
  ),
  generateReport: makeFunctionReference<'action', { jobId: Id<'proactiveJobs'>; leaseToken: string }, null>(
    'analyst/proactive/reports:generateMonthlyReportForUser',
  ),
  renewJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string }, Doc<'proactiveJobs'> | null>(
    'analyst/proactive/jobs:startOrRenewProactiveJob',
  ),
  completeJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string }, boolean>(
    'analyst/proactive/jobs:completeProactiveJob',
  ),
  failJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; errorCode: string }, boolean>(
    'analyst/proactive/jobs:failProactiveJob',
  ),
  reconcileTerminalReport: makeFunctionReference<'mutation', { userId: string; period: string }, { outcome: 'completed' | 'failed'; reportId: Id<'agentReports'> | null }>(
    'analyst/proactive/mutations:reconcileTerminalMonthlyReport',
  ),
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function previousPeriod(asOfDate: string) {
  const [year, month] = asOfDate.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function retryDelay(attempt: number) {
  return RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
}

function dedupeKey(input: { userId: string; kind: ProactiveJobKind; asOfDate: string; period?: string }) {
  const scope = input.kind === 'monthlyReport' || input.kind === 'subscriptionReview'
    ? input.period
    : input.asOfDate;
  if (!scope) throw new Error('A reporting period is required for monthly proactive work.');
  return `${input.kind}:${input.userId}:${scope}`;
}

async function profilePage(ctx: MutationCtx, cursor: string | null) {
  return await ctx.runQuery(refs.profiles, { paginationOpts: { numItems: PAGE_SIZE, cursor } });
}

async function enqueueJob(
  ctx: MutationCtx,
  input: { userId: string; kind: ProactiveJobKind; asOfDate: string; period?: string; locale: string; nowMs?: number },
) {
  const key = dedupeKey(input);
  const existing = await ctx.db
    .query('proactiveJobs')
    .withIndex('by_dedupeKey', (q) => q.eq('dedupeKey', key))
    .unique();
  if (existing) return { jobId: existing._id, inserted: false as const, status: existing.status };

  const now = input.nowMs ?? Date.now();
  const jobId = await ctx.db.insert('proactiveJobs', {
    userId: input.userId,
    kind: input.kind,
    dedupeKey: key,
    asOfDate: input.asOfDate,
    period: input.period,
    locale: input.locale,
    status: 'pending',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRunAtMs: now,
    createdAtMs: now,
    updatedAtMs: now,
  });
  return { jobId, inserted: true as const, status: 'pending' as const };
}

function actionForKind(kind: ProactiveJobKind) {
  switch (kind) {
    case 'healthScore': return refs.computeHealth;
    case 'spendingAnomaly': return refs.detectAnomalies;
    case 'subscriptionReview': return refs.reviewSubscriptions;
    case 'monthlyReport': return refs.generateReport;
  }
}

async function claimAndSchedule(ctx: MutationCtx, job: Doc<'proactiveJobs'>, now: number) {
  if (job.attempts >= job.maxAttempts) {
    await finalizeExhaustedJob(ctx, job, now, 'PROACTIVE_JOB_ATTEMPTS_EXHAUSTED');
    return false;
  }
  const nextAttempt = job.attempts + 1;
  const leaseToken = `${job._id}:${now}:${nextAttempt}`;
  await ctx.db.patch('proactiveJobs', job._id, {
    status: 'running',
    attempts: nextAttempt,
    leaseToken,
    leaseExpiresAtMs: now + JOB_LEASE_MS,
    errorCode: undefined,
    updatedAtMs: now,
  });
  await ctx.scheduler.runAfter(0, actionForKind(job.kind), { jobId: job._id, leaseToken });
  return true;
}

async function finalizeExhaustedJob(
  ctx: MutationCtx,
  job: Doc<'proactiveJobs'>,
  now: number,
  errorCode: string,
) {
  const reportOutcome = job.kind === 'monthlyReport' && job.period
    ? (await ctx.runMutation(refs.reconcileTerminalReport, {
        userId: job.userId,
        period: job.period,
      })).outcome
    : 'failed';
  const completed = reportOutcome === 'completed';
  await ctx.db.patch('proactiveJobs', job._id, {
    status: completed ? 'completed' : 'failed',
    leaseToken: undefined,
    leaseExpiresAtMs: undefined,
    errorCode: completed ? undefined : errorCode.slice(0, 100),
    nextRunAtMs: now,
    updatedAtMs: now,
    completedAtMs: completed ? now : undefined,
  });
}

export const enqueueProactiveJob = internalMutation({
  args: {
    userId: v.string(),
    kind: proactiveJobKindValidator,
    asOfDate: v.string(),
    period: v.optional(v.string()),
    locale: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await enqueueJob(ctx, args);
    await ctx.scheduler.runAfter(0, refs.watchdog, {});
    return result;
  },
});

export const startOrRenewProactiveJob = internalMutation({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string(), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('proactiveJobs', args.jobId);
    const now = args.nowMs ?? Date.now();
    if (
      !job ||
      job.status !== 'running' ||
      job.leaseToken !== args.leaseToken ||
      job.leaseExpiresAtMs === undefined ||
      job.leaseExpiresAtMs <= now
    ) {
      return null;
    }
    await ctx.db.patch('proactiveJobs', args.jobId, {
      leaseExpiresAtMs: now + JOB_LEASE_MS,
      updatedAtMs: now,
    });
    return { ...job, leaseExpiresAtMs: now + JOB_LEASE_MS, updatedAtMs: now };
  },
});

export const completeProactiveJob = internalMutation({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string(), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('proactiveJobs', args.jobId);
    const now = args.nowMs ?? Date.now();
    if (
      !job ||
      job.status !== 'running' ||
      job.leaseToken !== args.leaseToken ||
      job.leaseExpiresAtMs === undefined ||
      job.leaseExpiresAtMs <= now
    ) return false;
    await ctx.db.patch('proactiveJobs', args.jobId, {
      status: 'completed',
      leaseToken: undefined,
      leaseExpiresAtMs: undefined,
      errorCode: undefined,
      nextRunAtMs: now,
      updatedAtMs: now,
      completedAtMs: now,
    });
    return true;
  },
});

export const failProactiveJob = internalMutation({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string(), errorCode: v.string(), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('proactiveJobs', args.jobId);
    const now = args.nowMs ?? Date.now();
    if (
      !job ||
      job.status !== 'running' ||
      job.leaseToken !== args.leaseToken ||
      job.leaseExpiresAtMs === undefined ||
      job.leaseExpiresAtMs <= now
    ) return false;
    const exhausted = job.attempts >= job.maxAttempts;
    const nextRunAtMs = exhausted ? now : now + retryDelay(job.attempts);
    if (exhausted) {
      await finalizeExhaustedJob(ctx, job, now, args.errorCode);
      return true;
    }
    await ctx.db.patch('proactiveJobs', args.jobId, {
      status: 'pending',
      leaseToken: undefined,
      leaseExpiresAtMs: undefined,
      errorCode: args.errorCode.slice(0, 100),
      nextRunAtMs,
      updatedAtMs: now,
    });
    await ctx.scheduler.runAfter(retryDelay(job.attempts), refs.watchdog, {});
    return true;
  },
});

export const deferProactiveJob = internalMutation({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string(), retryAtMs: v.number(), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('proactiveJobs', args.jobId);
    const now = args.nowMs ?? Date.now();
    if (
      !job ||
      job.status !== 'running' ||
      job.leaseToken !== args.leaseToken ||
      job.leaseExpiresAtMs === undefined ||
      job.leaseExpiresAtMs <= now
    ) return false;
    if (job.attempts < 1) throw new Error('A claimed proactive job must have at least one attempt.');
    const nextRunAtMs = Math.max(now, args.retryAtMs);
    await ctx.db.patch('proactiveJobs', args.jobId, {
      status: 'pending',
      // The worker was blocked by an already-running idempotency claim and did
      // no work. Neutralize the watchdog claim so deferrals cannot exhaust the
      // bounded execution attempts before that claim becomes stale.
      attempts: job.attempts - 1,
      leaseToken: undefined,
      leaseExpiresAtMs: undefined,
      errorCode: 'PROACTIVE_JOB_DEFERRED',
      nextRunAtMs,
      updatedAtMs: now,
    });
    await ctx.scheduler.runAfter(Math.max(0, nextRunAtMs - now), refs.watchdog, {});
    return true;
  },
});

export const watchdogProactiveJobs = internalMutation({
  args: { limit: v.optional(v.number()), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const limit = Math.min(Math.max(Math.floor(args.limit ?? WATCHDOG_BATCH_SIZE), 1), 50);
    let scheduled = 0;
    let exhausted = 0;

    const expired = await ctx.db
      .query('proactiveJobs')
      .withIndex('by_status_and_leaseExpiresAtMs', (q) =>
        q.eq('status', 'running').lte('leaseExpiresAtMs', now),
      )
      .take(limit);
    for (const job of expired) {
      if (await claimAndSchedule(ctx, job, now)) scheduled += 1;
      else exhausted += 1;
    }

    const remaining = limit - expired.length;
    if (remaining > 0) {
      const due = await ctx.db
        .query('proactiveJobs')
        .withIndex('by_status_and_nextRunAtMs', (q) => q.eq('status', 'pending').lte('nextRunAtMs', now))
        .take(remaining);
      for (const job of due) {
        if (await claimAndSchedule(ctx, job, now)) scheduled += 1;
        else exhausted += 1;
      }
    }

    if (scheduled + exhausted >= limit) await ctx.scheduler.runAfter(0, refs.watchdog, {});
    return { scheduled, exhausted };
  },
});

async function runClaimedJob(
  ctx: ActionCtx,
  args: { jobId: Id<'proactiveJobs'>; leaseToken: string },
  run: (job: Doc<'proactiveJobs'>, renew: () => Promise<boolean>) => Promise<void>,
) {
  const job = await ctx.runMutation(refs.renewJob, args);
  if (!job) return null;
  const renew = async () => (await ctx.runMutation(refs.renewJob, args)) !== null;
  try {
    await run(job, renew);
    await ctx.runMutation(refs.completeJob, args);
  } catch (error) {
    await ctx.runMutation(refs.failJob, {
      ...args,
      errorCode: error instanceof ProactiveJobStepError
        ? error.errorCode
        : 'PROACTIVE_JOB_FAILED',
    });
  }
  return null;
}

export const computeHealthScoreForUser = internalAction({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string() },
  handler: async (ctx, args): Promise<null> => await runClaimedJob(ctx, args, async (job, renew) => {
    const data = await ctx.runQuery(refs.healthInputs, { userId: job.userId, asOfDate: job.asOfDate });
    for (const input of data.inputs) {
      const result = computeHealthScore(input);
      if (result.insufficientData) continue;
      if (!(await renew())) return;
      // E2: jev health-driver selector. The deterministic score is saved
      // unchanged; jev only names the narrative driver for downstream reports.
      try {
        const decision = await decide(
          {
            score: result.score,
            components: result.components,
            warnings: result.warnings.slice(0, 5),
          },
          healthDriverQuestions,
        );
        void decision;
      } catch {
        // Driver is advisory only; the snapshot below is unaffected.
      }
      await ctx.runMutation(refs.saveHealth, {
        userId: job.userId,
        computedAtDate: job.asOfDate,
        currency: input.currency,
        score: result.score,
        components: result.components,
      });
    }
  }),
});

export const detectSpendingAnomaliesForUser = internalAction({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string() },
  handler: async (ctx, args): Promise<null> => await runClaimedJob(ctx, args, async (job, renew) => {
    const series = await runProactiveJobStep(
      'SPENDING_ANOMALY_INPUT_READ_FAILED',
      async () => await ctx.runQuery(refs.spendingSeries, { userId: job.userId, asOfDate: job.asOfDate }),
    );
    const anomalies = detectSpendingAnomalies(series)
      .slice(0, 10)
      .map(toPersistedSpendingAnomaly);
    // UC4: jev notification gate per anomaly. Failures fall closed to the
    // deterministic z-score path; a negative gate only suppresses the push,
    // the digest row is still persisted.
    const gated: Array<{
      anomaly: (typeof anomalies)[number];
      notify: boolean;
      severity: 'info' | 'warning' | 'critical';
    }> = [];
    for (const anomaly of anomalies) {
      let verdict = { notify: true, severity: (anomaly.zScore >= 4 ? 'critical' : 'warning') as 'info' | 'warning' | 'critical' };
      try {
        const decision = await decide(
          {
            scope: anomaly.scope,
            label: minimizeJevText(anomaly.label, 120),
            currency: anomaly.currency,
            currentPeriod: job.asOfDate.slice(0, 7),
            currentAmount: anomaly.currentAmount,
            mean: anomaly.mean,
            zScore: anomaly.zScore,
            percentAboveBaseline: anomaly.percentAboveBaseline,
          },
          anomalyGateQuestions,
        );
        const notifyValue = jevNoul(decision.answers.notify_now);
        const tone = jevChoice(decision.answers.tone);
        const toneValue = tone?.choice;
        const toneConf = tone?.confidence;
        verdict = routeAnomalyGate({ notifyNow: notifyValue, tone: toneValue, toneConfidence: toneConf });
      } catch {
        // Keep the deterministic verdict above.
      }
      gated.push({ anomaly, notify: verdict.notify, severity: verdict.severity });
    }
    if (!(await renew())) return;
    await runProactiveJobStep(
      'SPENDING_ANOMALY_PERSIST_FAILED',
      async () => await ctx.runMutation(refs.persistAnomalies, {
        userId: job.userId,
        period: job.asOfDate.slice(0, 7),
        anomalies: gated.map(({ anomaly, notify, severity }) => ({ ...anomaly, jevNotify: notify, jevSeverity: severity })),
      }),
    );
  }),
});

export const reviewSubscriptionsForUser = internalAction({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string() },
  handler: async (ctx, args): Promise<null> => await runClaimedJob(ctx, args, async (job, renew) => {
    if (!job.period) throw new Error('Subscription review period is missing.');
    const input = await ctx.runQuery(refs.subscriptionInputs, { userId: job.userId, asOfDate: job.asOfDate });
    const reviews = reviewSubscriptions(input.subscriptions, input.monthlyIncomeByCurrency, job.asOfDate);
    if (!(await renew())) return;
    await ctx.runMutation(refs.persistSubscriptionReview, {
      userId: job.userId,
      period: job.period,
      locale: job.locale,
      summary: formatSubscriptionReviewSummary(reviews, job.locale),
      reviews: reviews.map(({ currency, monthlyTotal, actionableCount, shouldNotify }) => ({
        currency,
        monthlyTotal,
        actionableCount,
        shouldNotify,
      })),
    });
  }),
});

export const dispatchHealthScores = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), asOfDate: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const asOfDate = args.asOfDate ?? todayIso();
    const result = await profilePage(ctx, args.cursor);
    for (const profile of result.page) {
      await enqueueJob(ctx, { userId: profile.authUserId, kind: 'healthScore', asOfDate, locale: profile.locale ?? 'en' });
    }
    await ctx.scheduler.runAfter(0, refs.watchdog, {});
    if (!result.isDone) await ctx.scheduler.runAfter(0, refs.dispatchHealth, { cursor: result.continueCursor, asOfDate });
    return null;
  },
});

export const dispatchSpendingAnomalies = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), asOfDate: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const asOfDate = args.asOfDate ?? todayIso();
    const result = await profilePage(ctx, args.cursor);
    for (const profile of result.page) {
      await enqueueJob(ctx, { userId: profile.authUserId, kind: 'spendingAnomaly', asOfDate, locale: profile.locale ?? 'en' });
    }
    await ctx.scheduler.runAfter(0, refs.watchdog, {});
    if (!result.isDone) await ctx.scheduler.runAfter(0, refs.dispatchAnomalies, { cursor: result.continueCursor, asOfDate });
    return null;
  },
});

export const dispatchSubscriptionReviews = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), asOfDate: v.optional(v.string()), period: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const asOfDate = args.asOfDate ?? todayIso();
    const period = args.period ?? asOfDate.slice(0, 7);
    const result = await profilePage(ctx, args.cursor);
    for (const profile of result.page) {
      await enqueueJob(ctx, { userId: profile.authUserId, kind: 'subscriptionReview', asOfDate, period, locale: profile.locale ?? 'en' });
    }
    await ctx.scheduler.runAfter(0, refs.watchdog, {});
    if (!result.isDone) await ctx.scheduler.runAfter(0, refs.dispatchSubscriptions, { cursor: result.continueCursor, asOfDate, period });
    return null;
  },
});

export const dispatchMonthlyReports = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), asOfDate: v.optional(v.string()), period: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const asOfDate = args.asOfDate ?? todayIso();
    const period = args.period ?? previousPeriod(asOfDate);
    const result = await profilePage(ctx, args.cursor);
    for (const profile of result.page) {
      await enqueueJob(ctx, { userId: profile.authUserId, kind: 'monthlyReport', asOfDate, period, locale: profile.locale ?? 'en' });
    }
    await ctx.scheduler.runAfter(0, refs.watchdog, {});
    if (!result.isDone) await ctx.scheduler.runAfter(0, refs.dispatchReports, { cursor: result.continueCursor, asOfDate, period });
    return null;
  },
});
