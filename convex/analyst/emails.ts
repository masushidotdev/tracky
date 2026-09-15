import { Resend } from '@convex-dev/resend';
import { v } from 'convex/values';
import { components } from '../_generated/api';
import { internalMutation } from '../_generated/server';
import { isMonthlyReportEmailEligible } from './emailEligibility';

export const resend = new Resend(components.resend, { testMode: false });

export const queueMonthlyReportEmail = internalMutation({
  args: { reportId: v.id('agentReports'), userId: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get('agentReports', args.reportId);
    if (!report || report.userId !== args.userId || report.kind !== 'monthly') throw new Error('Report not found.');
    if (report.status !== 'completed' || !report.summary) throw new Error('Report is not completed.');
    if (report.emailId) return { status: 'queued' as const, emailId: report.emailId };

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', args.userId))
      .unique();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!isMonthlyReportEmailEligible(profile) || !from || !process.env.RESEND_API_KEY) {
      await ctx.db.patch('agentReports', report._id, { emailStatus: 'skipped', updatedAtMs: Date.now() });
      return { status: 'skipped' as const, emailId: null };
    }

    const italian = report.locale.toLowerCase().startsWith('it');
    const emailId = await resend.sendEmail(ctx, {
      from,
      to: profile.email,
      subject: italian ? `Tracky — Report mensile ${report.period}` : `Tracky — Monthly report ${report.period}`,
      text: report.summary,
    });
    await ctx.db.patch('agentReports', report._id, {
      emailId,
      emailStatus: 'queued',
      updatedAtMs: Date.now(),
    });
    return { status: 'queued' as const, emailId };
  },
});

export const cleanupResendEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: 7 * 24 * 60 * 60 * 1_000,
    });
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, {
      olderThan: 28 * 24 * 60 * 60 * 1_000,
    });
    return null;
  },
});
