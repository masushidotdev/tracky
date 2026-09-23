import { createThread, getThreadMetadata, saveMessage } from '@convex-dev/agent';
import { makeFunctionReference } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { components } from '../../_generated/api';
import { internalMutation } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';

async function assertNotDeleting(ctx: MutationCtx, userId: string) {
  const deletion = await ctx.db.query('accountDeletions')
    .withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
  if (deletion) throw new ConvexError('deletion_in_progress');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const userHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const tombstone = await ctx.db.query('deletedUsers')
    .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique();
  if (tombstone) throw new ConvexError('deletion_in_progress');
}

// The durable proactive-job lease is fifteen minutes. A crashed report claim is
// reclaimable before that lease is recovered, so the watchdog never hits a
// second, longer dead zone in agentReports.
const REPORT_STALE_AFTER_MS = 10 * 60 * 1_000;
const MAX_REPORT_ATTEMPTS = 3;
const MAX_SUMMARY_LENGTH = 8_000;
const MAX_ERROR_LENGTH = 500;

const reportKindValidator = v.union(v.literal('monthly'), v.literal('subscriptionReview'));
const healthComponentsValidator = v.object({
  savingsRate: v.number(),
  budgetAdherence: v.number(),
  debtLoad: v.number(),
  liquidityMonths: v.number(),
  subscriptionLoad: v.number(),
});
const notificationUpsertRef = makeFunctionReference<
  'mutation',
  {
    candidates: Array<{
      userId: string;
      type:
        | 'budgetOverspend'
        | 'upcomingPayment'
        | 'lowProjectedBalance'
        | 'syncFailed'
        | 'analystReport'
        | 'spendingAnomaly'
        | 'healthScore'
        | 'subscriptionReview';
      severity: 'info' | 'warning' | 'critical';
      titleKey: string;
      bodyKey: string;
      params: Record<string, string | number>;
      dedupeKey: string;
    }>;
  },
  { inserted: number; updated: number }
>('notifications:upsertCandidates');

function cleanText(value: string, limit: number) {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function cleanSummary(value: string) {
  return Array.from(value.replace(/\r\n?/g, '\n'))
    .map((character) => {
      const code = character.charCodeAt(0);
      if (character === '\n' || character === '\t') return character;
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH);
}

function normalizedDedupePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function monthlyReportCandidate(userId: string, period: string, threadId: string) {
  return {
    userId,
    type: 'analystReport' as const,
    severity: 'info' as const,
    titleKey: 'notifications.report.title',
    bodyKey: 'notifications.report.body',
    params: { period, threadId },
    dedupeKey: `analyst:report:monthly:${period}`,
  };
}

export const claimReport = internalMutation({
  args: { userId: v.string(), kind: reportKindValidator, period: v.string(), locale: v.string() },
  handler: async (ctx, args) => {
    await assertNotDeleting(ctx, args.userId);
    const now = Date.now();
    const existing = await ctx.db
      .query('agentReports')
      .withIndex('by_userId_and_period_and_kind', (q) =>
        q.eq('userId', args.userId).eq('period', args.period).eq('kind', args.kind),
      )
      .unique();
    if (existing) {
      const recentRunning = existing.status === 'running' && now - existing.updatedAtMs < REPORT_STALE_AFTER_MS;
      if (existing.status === 'completed' || recentRunning || existing.attempts >= MAX_REPORT_ATTEMPTS) {
        return {
          claimed: false as const,
          reportId: existing._id,
          status: existing.status,
          threadId: existing.threadId ?? null,
          attempts: existing.attempts,
          retryAtMs: recentRunning ? existing.updatedAtMs + REPORT_STALE_AFTER_MS : null,
        };
      }
      await ctx.db.patch('agentReports', existing._id, {
        status: 'running',
        locale: args.locale,
        attempts: existing.attempts + 1,
        updatedAtMs: now,
        errorMessage: undefined,
      });
      return {
        claimed: true as const,
        reportId: existing._id,
        status: 'running' as const,
        threadId: existing.threadId ?? null,
        attempts: existing.attempts + 1,
        retryAtMs: null,
      };
    }

    const reportId = await ctx.db.insert('agentReports', {
      userId: args.userId,
      kind: args.kind,
      period: args.period,
      status: 'running',
      locale: args.locale,
      attempts: 1,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return {
      claimed: true as const,
      reportId,
      status: 'running' as const,
      threadId: null,
      attempts: 1,
      retryAtMs: null,
    };
  },
});

export const prepareReportDelivery = internalMutation({
  args: {
    reportId: v.id('agentReports'),
    userId: v.string(),
    preferredThreadId: v.optional(v.string()),
    threadTitle: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get('agentReports', args.reportId);
    if (!report || report.userId !== args.userId || report.kind !== 'monthly' || report.status !== 'running') {
      throw new Error('Running monthly report not found.');
    }
    const requestedThreadId = args.preferredThreadId?.trim();
    let preferredThreadId: string | undefined;
    if (requestedThreadId) {
      try {
        const metadata = await getThreadMetadata(ctx, components.agent, { threadId: requestedThreadId });
        if (metadata.userId === args.userId) preferredThreadId = requestedThreadId;
      } catch {
        // Missing/deleted threads are replaced inside this transaction.
      }
    }
    if (
      preferredThreadId &&
      report.threadId === preferredThreadId &&
      report.outputMessageId
    ) {
      return { threadId: report.threadId, outputMessageId: report.outputMessageId };
    }

    const threadId = preferredThreadId || await createThread(ctx, components.agent, {
      userId: args.userId,
      title: cleanText(args.threadTitle, 120),
    });
    const { messageId: outputMessageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: args.userId,
      agentName: 'analyst-proactive',
      message: { role: 'assistant', content: '' },
      metadata: { status: 'pending' },
    });
    await ctx.db.patch('agentReports', report._id, {
      threadId,
      outputMessageId,
      updatedAtMs: Date.now(),
    });
    return { threadId, outputMessageId };
  },
});

export const completeReport = internalMutation({
  args: { reportId: v.id('agentReports'), userId: v.string(), threadId: v.string(), summary: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get('agentReports', args.reportId);
    if (!report || report.userId !== args.userId) throw new Error('Report not found.');
    if (report.threadId && report.threadId !== args.threadId) throw new Error('Report thread does not match.');
    if (report.status === 'completed') return report._id;
    if (report.status !== 'running') throw new Error('Running report not found.');
    const summary = cleanSummary(args.summary);
    if (report.outputMessageId) {
      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        userId: args.userId,
        agentName: 'analyst-proactive',
        pendingMessageId: report.outputMessageId,
        message: { role: 'assistant', content: summary },
        metadata: { status: 'success' },
      });
    }
    const now = Date.now();
    await ctx.db.patch('agentReports', report._id, {
      threadId: args.threadId,
      status: 'completed',
      summary,
      errorMessage: undefined,
      updatedAtMs: now,
      completedAtMs: now,
    });
    if (report.kind === 'monthly') {
      await ctx.runMutation(notificationUpsertRef, {
        candidates: [monthlyReportCandidate(args.userId, report.period, args.threadId)],
      });
    }
    return report._id;
  },
});

export const failReport = internalMutation({
  args: { reportId: v.id('agentReports'), userId: v.string(), errorMessage: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get('agentReports', args.reportId);
    if (!report || report.userId !== args.userId) return null;
    if (report.status === 'completed') return report._id;
    await ctx.db.patch('agentReports', report._id, {
      status: 'failed',
      errorMessage: cleanText(args.errorMessage, MAX_ERROR_LENGTH),
      updatedAtMs: Date.now(),
    });
    return report._id;
  },
});

export const reconcileTerminalMonthlyReport = internalMutation({
  args: { userId: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db
      .query('agentReports')
      .withIndex('by_userId_and_period_and_kind', (q) =>
        q.eq('userId', args.userId).eq('period', args.period).eq('kind', 'monthly'),
      )
      .unique();
    if (!report) return { outcome: 'failed' as const, reportId: null };
    if (report.status === 'completed') {
      return { outcome: 'completed' as const, reportId: report._id };
    }

    const errorCode = 'MONTHLY_REPORT_GENERATION_FAILED';
    if (report.threadId && report.outputMessageId) {
      let outputStatus: string | undefined;
      try {
        const [outputMessage] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
          messageIds: [report.outputMessageId],
        });
        outputStatus = outputMessage?.status;
      } catch {
        // Compatibility with stale/invalid pre-slot IDs: the report can still
        // reach a coherent terminal state without inventing another message.
      }
      if (outputStatus && outputStatus !== 'failed') {
        const italian = report.locale.toLowerCase().startsWith('it');
        await saveMessage(ctx, components.agent, {
          threadId: report.threadId,
          userId: args.userId,
          agentName: 'analyst-proactive',
          pendingMessageId: report.outputMessageId,
          message: {
            role: 'assistant',
            content: italian
              ? 'Impossibile generare il report mensile. Riprova più tardi.'
              : 'The monthly report could not be generated. Please try again later.',
          },
          metadata: { status: 'failed', error: errorCode },
        });
      }
    }
    await ctx.db.patch('agentReports', report._id, {
      status: 'failed',
      errorMessage: errorCode,
      updatedAtMs: Date.now(),
    });
    return { outcome: 'failed' as const, reportId: report._id };
  },
});

export const saveHealthSnapshot = internalMutation({
  args: {
    userId: v.string(),
    computedAtDate: v.string(),
    currency: v.string(),
    score: v.number(),
    components: healthComponentsValidator,
  },
  handler: async (ctx, args) => {
    await assertNotDeleting(ctx, args.userId);
    const score = Math.min(100, Math.max(0, Math.round(args.score)));
    const currency = args.currency.toUpperCase();
    const existing = await ctx.db
      .query('healthScoreSnapshots')
      .withIndex('by_userId_and_currency_and_computedAtDate', (q) =>
        q.eq('userId', args.userId).eq('currency', currency).eq('computedAtDate', args.computedAtDate),
      )
      .unique();
    const previous = await ctx.db
      .query('healthScoreSnapshots')
      .withIndex('by_userId_and_currency_and_computedAtDate', (q) =>
        q.eq('userId', args.userId).eq('currency', currency).lt('computedAtDate', args.computedAtDate),
      )
      .order('desc')
      .take(1);
    const snapshotId = existing
      ? existing._id
      : await ctx.db.insert('healthScoreSnapshots', {
          userId: args.userId,
          computedAtDate: args.computedAtDate,
          currency,
          score,
          components: args.components,
          createdAtMs: Date.now(),
        });
    if (existing) await ctx.db.patch('healthScoreSnapshots', existing._id, { score, components: args.components });

    const previousScore = previous.at(0)?.score;
    const delta = previousScore === undefined ? 0 : score - previousScore;
    if (previousScore !== undefined && Math.abs(delta) >= 5) {
      await ctx.runMutation(notificationUpsertRef, {
        candidates: [{
          userId: args.userId,
          type: 'healthScore',
          severity: delta > 0 ? 'info' : delta <= -15 ? 'critical' : 'warning',
          titleKey: delta > 0 ? 'notifications.health.improved.title' : 'notifications.health.declined.title',
          bodyKey: delta > 0 ? 'notifications.health.improved.body' : 'notifications.health.declined.body',
          params: { score, previousScore, delta: Math.abs(delta), currency },
          dedupeKey: `analyst:health:${args.computedAtDate}:${currency}`,
        }],
      });
    }
    return { snapshotId, previousScore: previousScore ?? null, delta };
  },
});

export const persistAnomalyNotifications = internalMutation({
  args: {
    userId: v.string(),
    period: v.string(),
    anomalies: v.array(v.object({
      scope: v.union(v.literal('category'), v.literal('merchant')),
      key: v.string(),
      label: v.string(),
      currency: v.string(),
      currentAmount: v.number(),
      mean: v.number(),
      zScore: v.number(),
      percentAboveBaseline: v.number(),
      // UC4 gate output (optional so legacy callers keep working): notify=false
      // suppresses the push, the digest row is still upserted for the inbox.
      jevNotify: v.optional(v.boolean()),
      jevSeverity: v.optional(v.union(v.literal('info'), v.literal('warning'), v.literal('critical'))),
      jevTone: v.optional(v.string()),
      jevConfidence: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    await assertNotDeleting(ctx, args.userId);
    const candidates = args.anomalies.slice(0, 10).map((anomaly) => {
      const currency = anomaly.currency.toUpperCase();
      const severity = anomaly.jevSeverity ?? (anomaly.zScore >= 4 ? ('critical' as const) : ('warning' as const));
      return {
        userId: args.userId,
        type: 'spendingAnomaly' as const,
        severity,
        titleKey: 'notifications.anomaly.title',
        bodyKey: 'notifications.anomaly.body',
        params: {
          label: cleanText(anomaly.label, 120),
          amount: anomaly.currentAmount,
          baseline: anomaly.mean,
          percent: Math.round(anomaly.percentAboveBaseline),
          currency,
          period: args.period,
          ...(anomaly.jevNotify !== undefined ? { jevNotify: anomaly.jevNotify ? 'true' : 'false' } : {}),
          ...(anomaly.jevTone ? { jevTone: cleanText(anomaly.jevTone, 20) } : {}),
          ...(anomaly.jevConfidence !== undefined ? { jevConfidence: Math.round(anomaly.jevConfidence * 100) } : {}),
        },
        dedupeKey: `analyst:anomaly:${args.period}:${currency}:${anomaly.scope}:${normalizedDedupePart(anomaly.key)}`,
      };
    });
    return candidates.length === 0
      ? { inserted: 0, updated: 0 }
      : await ctx.runMutation(notificationUpsertRef, { candidates });
  },
});

export const persistSubscriptionReview = internalMutation({
  args: {
    userId: v.string(),
    period: v.string(),
    locale: v.string(),
    summary: v.string(),
    reviews: v.array(v.object({
      currency: v.string(),
      monthlyTotal: v.number(),
      actionableCount: v.number(),
      shouldNotify: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    await assertNotDeleting(ctx, args.userId);
    const now = Date.now();
    const existing = await ctx.db
      .query('agentReports')
      .withIndex('by_userId_and_period_and_kind', (q) =>
        q.eq('userId', args.userId).eq('period', args.period).eq('kind', 'subscriptionReview'),
      )
      .unique();
    let reportId: Id<'agentReports'>;
    if (existing) {
      reportId = existing._id;
      await ctx.db.patch('agentReports', reportId, {
        status: 'completed',
        locale: args.locale,
        summary: cleanSummary(args.summary),
        attempts: Math.max(existing.attempts, 1),
        updatedAtMs: now,
        completedAtMs: now,
        errorMessage: undefined,
      });
    } else {
      reportId = await ctx.db.insert('agentReports', {
        userId: args.userId,
        kind: 'subscriptionReview',
        period: args.period,
        status: 'completed',
        locale: args.locale,
        summary: cleanSummary(args.summary),
        attempts: 1,
        createdAtMs: now,
        updatedAtMs: now,
        completedAtMs: now,
      });
    }
    const candidates = args.reviews
      .filter((review) => review.shouldNotify && review.actionableCount > 0)
      .slice(0, 10)
      .map((review) => {
        const currency = review.currency.toUpperCase();
        return {
          userId: args.userId,
          type: 'subscriptionReview' as const,
          severity: 'warning' as const,
          titleKey: 'notifications.subscriptionReview.title',
          bodyKey: 'notifications.subscriptionReview.body',
          params: {
            period: args.period,
            currency,
            monthlyTotal: review.monthlyTotal,
            actionableCount: Math.max(0, Math.floor(review.actionableCount)),
          },
          dedupeKey: `analyst:subscription-review:${args.period}:${currency}`,
        };
      });
    const notifications = candidates.length
      ? await ctx.runMutation(notificationUpsertRef, { candidates })
      : { inserted: 0, updated: 0 };
    return { reportId, notifications };
  },
});

export const persistCompletedReportNotification = internalMutation({
  args: { reportId: v.id('agentReports'), userId: v.string(), period: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    await assertNotDeleting(ctx, args.userId);
    const report = await ctx.db.get('agentReports', args.reportId);
    if (
      !report ||
      report.userId !== args.userId ||
      report.kind !== 'monthly' ||
      report.period !== args.period ||
      report.status !== 'completed' ||
      report.threadId !== args.threadId
    ) {
      throw new Error('Completed monthly report not found.');
    }
    return await ctx.runMutation(notificationUpsertRef, {
      candidates: [monthlyReportCandidate(args.userId, args.period, args.threadId)],
    });
  },
});
