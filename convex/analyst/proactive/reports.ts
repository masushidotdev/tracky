'use node';

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { internalAction } from '../../_generated/server';
import { decide, jevNoul } from '../../lib/jev';
import { makeProactiveAnalystAgent } from '../agent';
import { DEFAULT_MODEL } from '../models';
import { createAnalystTelemetry } from '../telemetry';
import { detectSpendingAnomalies } from './anomalyCore';
import { reportSkipQuestions, routeReportSkip } from './jevGates';
import type { Doc, Id } from '../../_generated/dataModel';

const refs = {
  claim: makeFunctionReference<'mutation', { userId: string; kind: 'monthly'; period: string; locale: string }, { claimed: boolean; reportId: Id<'agentReports'>; threadId: string | null; attempts: number; status: 'pending' | 'running' | 'completed' | 'failed'; retryAtMs: number | null }>(
    'analyst/proactive/mutations:claimReport',
  ),
  previousThread: makeFunctionReference<'query', { userId: string; beforePeriod: string }, string | null>(
    'analyst/proactive/queries:latestMonthlyReportThreadForUser',
  ),
  prepareDelivery: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; preferredThreadId?: string; threadTitle: string }, { threadId: string; outputMessageId: string }>(
    'analyst/proactive/mutations:prepareReportDelivery',
  ),
  complete: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; threadId: string; summary: string }, unknown>(
    'analyst/proactive/mutations:completeReport',
  ),
  anomaliesForSkip: makeFunctionReference<'query', { userId: string; asOfDate: string }, Parameters<typeof detectSpendingAnomalies>[0]>(
    'analyst/proactive/queries:spendingSeriesForUser',
  ),
  fail: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string; errorMessage: string }, unknown>(
    'analyst/proactive/mutations:failReport',
  ),
  email: makeFunctionReference<'mutation', { reportId: Id<'agentReports'>; userId: string }, unknown>(
    'analyst/emails:queueMonthlyReportEmail',
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
  deferJob: makeFunctionReference<'mutation', { jobId: Id<'proactiveJobs'>; leaseToken: string; retryAtMs: number }, boolean>(
    'analyst/proactive/jobs:deferProactiveJob',
  ),
};

function reportPrompt(period: string, asOfDate: string) {
  return `Generate the autonomous monthly financial report for exactly ${period}. Today is ${asOfDate} UTC.
Use only the proactive read-only and presentation tools. Start by retrieving the relevant accounts, transactions, six-month spending trend ending in ${period}, active Plan for ${period}, anomalies from getDetectedAnomalies for ${period}, active subscriptions, credit facilities, and the latest health score at or before ${asOfDate}.
Separate every amount and conclusion by currency. Do not use web search, do not request approval, and do not perform or propose an already-executed write. If a requested fact is unavailable, say so. Follow the monthly report skill and end with exactly three concrete actions.`;
}

function safeErrorCode() {
  return 'MONTHLY_REPORT_GENERATION_FAILED';
}

export const generateMonthlyReportForUser = internalAction({
  args: { jobId: v.id('proactiveJobs'), leaseToken: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runMutation(refs.renewJob, args);
    if (!job || job.kind !== 'monthlyReport' || !job.period) return null;
    const renewFence = async () => (await ctx.runMutation(refs.renewJob, args)) !== null;
    const claim = await ctx.runMutation(refs.claim, {
      userId: job.userId,
      kind: 'monthly',
      period: job.period,
      locale: job.locale,
    });
    if (!claim.claimed) {
      if (claim.status === 'completed') {
        try {
          await ctx.runMutation(refs.email, { reportId: claim.reportId, userId: job.userId });
        } catch {
          // Email is optional and its component-owned queue is independently idempotent.
        }
        await ctx.runMutation(refs.completeJob, args);
      } else if (claim.retryAtMs !== null) {
        await ctx.runMutation(refs.deferJob, { ...args, retryAtMs: claim.retryAtMs });
      } else {
        await ctx.runMutation(refs.failJob, { ...args, errorCode: 'MONTHLY_REPORT_CLAIM_UNAVAILABLE' });
      }
      return null;
    }

    let completed = false;
    let flush = () => Promise.resolve();
    try {
      const preferredThreadId = claim.threadId ?? (await ctx.runQuery(refs.previousThread, {
        userId: job.userId,
        beforePeriod: job.period,
      }));
      if (!(await renewFence())) return null;
      const delivery = await ctx.runMutation(refs.prepareDelivery, {
        reportId: claim.reportId,
        userId: job.userId,
        preferredThreadId: preferredThreadId ?? undefined,
        threadTitle: job.locale.toLowerCase().startsWith('it') ? 'Report mensili' : 'Monthly reports',
      });
      const threadId = delivery.threadId;

      // E1: jev report-skip gate. A quiet month completes with a deterministic
      // template instead of an LLM generation; failures fall closed to generate.
      try {
        const series = await ctx.runQuery(refs.anomaliesForSkip, { userId: job.userId, asOfDate: job.asOfDate });
        const top = detectSpendingAnomalies(series).slice(0, 3);
        const decision = await decide(
          {
            period: job.period,
            anomalyCount: top.length,
            topAnomalies: top.map((anomaly) => ({
              label: anomaly.label.slice(0, 120),
              currency: anomaly.currency,
              currentAmount: anomaly.currentAmount,
              mean: anomaly.mean,
              percentAboveBaseline: Math.round(anomaly.percentAboveBaseline),
            })),
          },
          reportSkipQuestions,
        );
        const actionable = decision.answers.actionable;
        const actionableValue = jevNoul(actionable);
        if (routeReportSkip(actionableValue) === 'template') {
          const italian = job.locale.toLowerCase().startsWith('it');
          const summary = italian
            ? `Report ${job.period}: mese tranquillo, nessuna variazione rilevante da segnalare. Le tue spese sono in linea con i mesi precedenti.`
            : `Report ${job.period}: quiet month, no material change to report. Your spending is in line with previous months.`;
          await ctx.runMutation(refs.complete, { reportId: claim.reportId, userId: job.userId, threadId, summary });
          completed = true;
          try {
            await ctx.runMutation(refs.email, { reportId: claim.reportId, userId: job.userId });
          } catch {
            // Email is optional; the completed in-app report remains authoritative.
          }
          await ctx.runMutation(refs.completeJob, args);
          return null;
        }
      } catch {
        // Fall closed to the LLM generation path below.
      }

      const telemetryContext = createAnalystTelemetry({
        userId: job.userId,
        threadId,
        modelId: DEFAULT_MODEL,
      });
      flush = telemetryContext.flush;
      const agent = makeProactiveAnalystAgent(job.locale);
      if (!(await renewFence())) return null;
      const result = await agent.generateText(
        ctx,
        { threadId, userId: job.userId },
        { prompt: reportPrompt(job.period, job.asOfDate), experimental_telemetry: telemetryContext.telemetry },
        { contextOptions: { recentMessages: 12 }, storageOptions: { saveMessages: 'none' } },
      );
      if (!(await renewFence())) return null;
      await ctx.runMutation(refs.complete, {
        reportId: claim.reportId,
        userId: job.userId,
        threadId,
        summary: result.text,
      });
      completed = true;
      try {
        await ctx.runMutation(refs.email, { reportId: claim.reportId, userId: job.userId });
      } catch {
        // Email is an optional delivery channel; the completed in-app report remains authoritative.
      }
      await ctx.runMutation(refs.completeJob, args);
      return null;
    } catch {
      if (!completed) {
        if (!(await renewFence())) return null;
        try {
          await ctx.runMutation(refs.fail, {
            reportId: claim.reportId,
            userId: job.userId,
            errorMessage: safeErrorCode(),
          });
        } catch {
          // Retry remains explicit even if failure-state persistence is temporarily unavailable.
        }
        await ctx.runMutation(refs.failJob, { ...args, errorCode: safeErrorCode() });
      }
      return null;
    } finally {
      try {
        await flush();
      } catch {
        // Telemetry must not change the durable job outcome.
      }
    }
  },
});
