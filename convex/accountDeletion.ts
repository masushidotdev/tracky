import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireAuthUser } from './auth';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const STALE_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const FEEDBACK_RETENTION_MS = 365 * DAY_MS;
const feedbackReason = v.union(
  v.literal('too_complex'), v.literal('missing_features'),
  v.literal('bank_connection'), v.literal('privacy'),
  v.literal('no_longer_needed'), v.literal('other'),
);
// A permanently failing revocation (revoked app, bad credentials) must not
// keep its done row and sessionId forever: decision 0024 keeps that state
// only temporarily.
const REVOCATION_RETRY_MAX_AGE_MS = 30 * DAY_MS;
const STEPS = [
  'disconnect', 'personalData', 'telegram', 'bankingLeaves', 'providerRevocation',
  'bankingCore', 'planning', 'forecast', 'misc', 'agentThreads', 'profile', 'workos',
] as const;
export type WipeStep = (typeof STEPS)[number];

export async function hashUserId(userId: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const deleteMyAccount = mutation({
  args: {
    deletionExportId: v.optional(v.id('dataExports')),
    feedback: v.object({ reason: feedbackReason, otherText: v.optional(v.string()) }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const existing = await ctx.db.query('accountDeletions')
      .withIndex('by_userId', (q) => q.eq('userId', user.id)).unique();
    if (existing) throw new ConvexError('deletion_in_progress');
    const userHash = await hashUserId(user.id);
    const tombstone = await ctx.db.query('deletedUsers')
      .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique();
    if (tombstone) throw new ConvexError('deletion_in_progress');
    const selectedExport = await ctx.db.query('dataExports')
      .withIndex('by_userId_and_deletionSelected', (q) =>
        q.eq('userId', user.id).eq('deletionSelected', true)).unique();
    if (args.deletionExportId && args.deletionExportId !== selectedExport?._id) {
      throw new ConvexError('deletion_export_mismatch');
    }
    if (selectedExport && selectedExport.status !== 'failed') {
      if (selectedExport.status !== 'completed' || !selectedExport.storageId ||
        selectedExport.expiresAtMs <= Date.now() ||
        !selectedExport.deletionDownloadAcknowledgedAtMs ||
        !await ctx.db.system.get('_storage', selectedExport.storageId)) {
        throw new ConvexError('deletion_export_not_acknowledged');
      }
    }
    const otherText = args.feedback.otherText?.trim();
    if (args.feedback.reason === 'other' && (!otherText || otherText.length > 500)) {
      throw new ConvexError('invalid_deletion_feedback');
    }
    if (args.feedback.reason !== 'other' && otherText) {
      throw new ConvexError('invalid_deletion_feedback');
    }
    const now = Date.now();
    await ctx.db.insert('accountDeletionFeedback', {
      userId: user.id,
      email: user.email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      reason: args.feedback.reason,
      otherText: args.feedback.reason === 'other' ? otherText : undefined,
      submittedAtMs: now,
      expiresAtMs: now + FEEDBACK_RETENTION_MS,
    });
    const deletionId = await ctx.db.insert('accountDeletions', {
      userId: user.id,
      userHash,
      status: 'wiping',
      currentStep: 'disconnect',
      requestedAtMs: now,
      updatedAtMs: now,
      attemptCount: 0,
      workosDeleted: false,
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletionActions.beginWipe, { deletionId });
    return null;
  },
});

export const getDeletionStatus = query({
  args: {},
  returns: v.union(v.null(), v.object({ status: v.union(v.literal('wiping'), v.literal('failed'), v.literal('done')), currentStep: v.string() })),
  handler: async (ctx) => {
    // Profile and AuthKit component rows may disappear mid-wipe. The signed
    // Convex identity remains usable until the client signs out.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('Unauthorized');
    let row = await ctx.db.query('accountDeletions')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!row) {
      const userHash = await hashUserId(identity.subject);
      row = await ctx.db.query('accountDeletions')
        .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique();
    }
    return row ? { status: row.status, currentStep: row.currentStep } : null;
  },
});

export const getWork = internalQuery({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.union(v.null(), schema.doc('accountDeletions')),
  handler: async (ctx, { deletionId }) => await ctx.db.get('accountDeletions', deletionId),
});

export const stopSyncBatch = internalMutation({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { deletionId }) => {
    const deletion = await ctx.db.get('accountDeletions', deletionId);
    if (!deletion || deletion.status !== 'wiping' || !deletion.userId) return { done: true };
    const statuses = ['pending', 'active', 'reauthorizationRequired', 'paused', 'error'] as const;
    for (const status of statuses) {
      const rows = await ctx.db.query('providerConnections')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', deletion.userId!).eq('status', status)).take(100);
      if (rows.length === 0) continue;
      for (const row of rows) await ctx.db.patch('providerConnections', row._id, {
        status: 'disconnected', nextSyncAfterMs: undefined, updatedAtMs: Date.now(),
      });
      return { done: false };
    }
    const syncStates = await ctx.db.query('accountSyncStates')
      .withIndex('by_userId', (q) => q.eq('userId', deletion.userId!)).take(100);
    if (syncStates.length) {
      for (const row of syncStates) await ctx.db.delete('accountSyncStates', row._id);
      return { done: false };
    }
    const jobs = await ctx.db.query('proactiveJobs')
      .withIndex('by_userId', (q) => q.eq('userId', deletion.userId!)).take(100);
    if (jobs.length) {
      for (const row of jobs) await ctx.db.delete('proactiveJobs', row._id);
      return { done: false };
    }
    return { done: true };
  },
});

export const advanceWipe = internalMutation({
  args: { deletionId: v.id('accountDeletions'), completedStep: v.string(), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('accountDeletions', args.deletionId);
    if (!row || row.status !== 'wiping' || row.currentStep !== args.completedStep) return null;
    const index = STEPS.indexOf(args.completedStep as WipeStep);
    if (index < 0) throw new Error('unknown_wipe_step');
    const next = args.done ? (STEPS[index + 1] ?? 'workos') : row.currentStep;
    await ctx.db.patch('accountDeletions', row._id, { currentStep: next, updatedAtMs: Date.now(), lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.accountDeletionActions.beginWipe, { deletionId: row._id });
    return null;
  },
});

export const failWipe = internalMutation({
  args: { deletionId: v.id('accountDeletions'), message: v.string() },
  returns: v.null(),
  handler: async (ctx, { deletionId, message }) => {
    const row = await ctx.db.get('accountDeletions', deletionId);
    if (!row || row.status === 'done') return null;
    const attemptCount = row.attemptCount + 1;
    const delay = Math.min(DAY_MS, 60_000 * 2 ** Math.min(attemptCount - 1, 10));
    await ctx.db.patch('accountDeletions', deletionId, {
      status: 'failed', attemptCount, lastError: message.slice(0, 500),
      updatedAtMs: Date.now(), nextRetryAtMs: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.accountDeletion.restartWipe, { deletionId });
    console.error('Account erasure failed', { deletionId, step: row.currentStep, message });
    return null;
  },
});

export const restartWipe = internalMutation({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.boolean(),
  handler: async (ctx, { deletionId }) => {
    const row = await ctx.db.get('accountDeletions', deletionId);
    if (!row || row.status === 'done') return false;
    const now = Date.now();
    if (row.status === 'wiping' && row.updatedAtMs > now - STALE_MS) return false;
    if (row.status === 'failed' && (row.nextRetryAtMs ?? 0) > now) return false;
    await ctx.db.patch('accountDeletions', deletionId, { status: 'wiping', updatedAtMs: now, nextRetryAtMs: undefined });
    await ctx.scheduler.runAfter(0, internal.accountDeletionActions.beginWipe, { deletionId });
    return true;
  },
});

export const sweepDeletions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db.query('accountDeletions')
      .withIndex('by_status_and_updatedAtMs', (q) => q.eq('status', 'wiping').lt('updatedAtMs', now - STALE_MS)).take(100);
    const due = await ctx.db.query('accountDeletions')
      .withIndex('by_status_and_nextRetryAtMs', (q) => q.eq('status', 'failed').lt('nextRetryAtMs', now)).take(100);
    for (const rows of [stale, due]) {
      for (const row of rows) {
        await ctx.db.patch('accountDeletions', row._id, { status: 'wiping', updatedAtMs: now, nextRetryAtMs: undefined });
        await ctx.scheduler.runAfter(0, internal.accountDeletionActions.beginWipe, { deletionId: row._id });
      }
    }
    const retryDue = await ctx.db.query('accountDeletions')
      .withIndex('by_status_and_nextRetryAtMs', (q) => q.eq('status', 'done').lt('nextRetryAtMs', now)).take(100);
    for (const row of retryDue) {
      if (row.revocationResults?.some((result) => !result.ok)) {
        await ctx.scheduler.runAfter(0, internal.accountDeletionActions.retryRevocations, { deletionId: row._id });
      }
    }
    const oldDone = await ctx.db.query('accountDeletions')
      .withIndex('by_status_and_updatedAtMs', (q) => q.eq('status', 'done').lt('updatedAtMs', now - DAY_MS)).take(100);
    for (const row of oldDone) {
      const pending = row.revocationResults?.some((result) => !result.ok) ?? false;
      // Without an age cap, stuck rows keep the first index page forever and
      // block later completed rows behind them; without touching updatedAtMs,
      // markRetriedRevocation would also keep them first after every retry.
      const expired = row.requestedAtMs < now - REVOCATION_RETRY_MAX_AGE_MS;
      if (!pending || expired) {
        if (pending) console.error('Account erasure revocation abandoned', { deletionId: row._id });
        await ctx.db.delete('accountDeletions', row._id);
      }
    }
    const expiredFeedback = await ctx.db.query('accountDeletionFeedback')
      .withIndex('by_expiresAtMs', (q) => q.lt('expiresAtMs', now)).take(100);
    for (const row of expiredFeedback) await ctx.db.delete('accountDeletionFeedback', row._id);
    const detachedDue = await ctx.db.query('detachedConsentRevocations')
      .withIndex('by_nextRetryAtMs', (q) => q.lt('nextRetryAtMs', now)).take(100);
    for (const row of detachedDue) {
      if (row.requestedAtMs < now - REVOCATION_RETRY_MAX_AGE_MS) {
        console.error('Detached bank consent revocation abandoned', { revocationId: row._id });
        await ctx.db.delete('detachedConsentRevocations', row._id);
      } else {
        // Move the due time before scheduling, so repeated sweep runs cannot
        // dispatch the same revocation while its network request is in flight.
        await ctx.db.patch('detachedConsentRevocations', row._id, { nextRetryAtMs: now + STALE_MS });
        await ctx.scheduler.runAfter(0, internal.accountDeletionActions.retryDetachedConsent, { revocationId: row._id });
      }
    }
    const detachedExpired = await ctx.db.query('detachedConsentRevocations')
      .withIndex('by_requestedAtMs', (q) => q.lt('requestedAtMs', now - REVOCATION_RETRY_MAX_AGE_MS)).take(100);
    for (const row of detachedExpired) {
      console.error('Detached bank consent revocation abandoned', { revocationId: row._id });
      await ctx.db.delete('detachedConsentRevocations', row._id);
    }
    return null;
  },
});

// The Enable Banking callback may receive a session after erasure has already
// removed its auth request. Persist it before trying to revoke the session so
// a failed DELETE or crashed callback has a retry path independent of the
// already-erased providerConnections table.
export const captureDetachedConsent = internalMutation({
  args: { userId: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, sessionId }) => {
    if (!sessionId.trim()) throw new Error('missing_detached_session_id');
    const existing = await ctx.db.query('detachedConsentRevocations')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId)).unique();
    if (existing) return null;
    const now = Date.now();
    await ctx.db.insert('detachedConsentRevocations', {
      userHash: await hashUserId(userId), sessionId,
      requestedAtMs: now, updatedAtMs: now, attemptCount: 0,
      nextRetryAtMs: now + 60_000,
    });
    return null;
  },
});

export const markDetachedConsentRevoked = internalMutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db.query('detachedConsentRevocations')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId)).unique();
    if (row) await ctx.db.delete('detachedConsentRevocations', row._id);
    return null;
  },
});

export const getDetachedConsent = internalQuery({
  args: { revocationId: v.id('detachedConsentRevocations') },
  returns: v.union(v.null(), schema.doc('detachedConsentRevocations')),
  handler: async (ctx, { revocationId }) => await ctx.db.get('detachedConsentRevocations', revocationId),
});

export const recordDetachedConsentAttempt = internalMutation({
  args: { revocationId: v.id('detachedConsentRevocations'), ok: v.boolean(), code: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { revocationId, ok, code }) => {
    const row = await ctx.db.get('detachedConsentRevocations', revocationId);
    if (!row) return null;
    if (ok || row.requestedAtMs < Date.now() - REVOCATION_RETRY_MAX_AGE_MS) {
      await ctx.db.delete('detachedConsentRevocations', revocationId);
      return null;
    }
    const attemptCount = row.attemptCount + 1;
    const delay = Math.min(DAY_MS, 60_000 * 2 ** Math.min(attemptCount - 1, 10));
    const now = Date.now();
    await ctx.db.patch('detachedConsentRevocations', revocationId, {
      attemptCount, updatedAtMs: now, nextRetryAtMs: now + delay,
      lastError: code?.slice(0, 100),
    });
    return null;
  },
});

export const pruneTombstones = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 365 * DAY_MS;
    const rows = await ctx.db.query('deletedUsers')
      .withIndex('by_deletedAtMs', (q) => q.lt('deletedAtMs', cutoff)).take(100);
    for (const row of rows) await ctx.db.delete('deletedUsers', row._id);
    return null;
  },
});

export const getNextRevocation = internalQuery({
  args: { deletionId: v.id('accountDeletions'), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    connection: v.union(v.null(), schema.doc('providerConnections')),
    cursor: v.union(v.string(), v.null()), done: v.boolean(),
  }),
  handler: async (ctx, { deletionId, cursor }) => {
    const row = await ctx.db.get('accountDeletions', deletionId);
    if (!row || !row.userId) return { connection: null, cursor: null, done: true };
    const page = await ctx.db.query('providerConnections')
      .withIndex('by_userId', (q) => q.eq('userId', row.userId!))
      .paginate({ cursor, numItems: 100 });
    const attempted = new Set(row.revocationResults?.map((result) => result.connectionId));
    const connection = page.page.find((item) => item.provider === 'enableBanking' && !!item.sessionId && !attempted.has(item._id));
    return { connection: connection ?? null, cursor: page.continueCursor, done: page.isDone };
  },
});

export const recordRevocation = internalMutation({
  args: {
    deletionId: v.id('accountDeletions'), connectionId: v.id('providerConnections'),
    provider: v.union(v.literal('enableBanking'), v.literal('manual'), v.literal('mock')),
    sessionId: v.string(), ok: v.boolean(), code: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('accountDeletions', args.deletionId);
    if (!row || row.status !== 'wiping') return null;
    const results = row.revocationResults ?? [];
    if (results.some((result) => result.connectionId === args.connectionId)) return null;
    await ctx.db.patch('accountDeletions', row._id, {
      revocationResults: [...results, { connectionId: args.connectionId, provider: args.provider,
        sessionId: args.ok ? undefined : args.sessionId, ok: args.ok, code: args.code }],
      updatedAtMs: Date.now(),
    });
    return null;
  },
});

export const eraseProfile = internalMutation({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.null(),
  handler: async (ctx, { deletionId }) => {
    const row = await ctx.db.get('accountDeletions', deletionId);
    if (!row || !row.userId || row.status !== 'wiping') return null;
    const userId = row.userId;
    const settings = await ctx.db.query('userSettings').withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
    if (settings) await ctx.db.delete('userSettings', settings._id);
    const profile = await ctx.db.query('userProfiles').withIndex('by_authUserId', (q) => q.eq('authUserId', userId)).unique();
    if (profile) await ctx.db.delete('userProfiles', profile._id);
    const tombstone = await ctx.db.query('deletedUsers').withIndex('by_userHash', (q) => q.eq('userHash', row.userHash)).unique();
    if (!tombstone) await ctx.db.insert('deletedUsers', { userHash: row.userHash, deletedAtMs: Date.now() });
    await ctx.db.patch('accountDeletions', deletionId, { wipeCompletedAtMs: Date.now(), updatedAtMs: Date.now() });
    return null;
  },
});

export const completeWorkos = internalMutation({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.null(),
  handler: async (ctx, { deletionId }) => {
    const row = await ctx.db.get('accountDeletions', deletionId);
    if (!row || row.status === 'done') return null;
    const pending = row.revocationResults?.some((result) => !result.ok);
    await ctx.db.patch('accountDeletions', deletionId, {
      userId: undefined, status: 'done', currentStep: 'done', workosDeleted: true,
      updatedAtMs: Date.now(), nextRetryAtMs: pending ? Date.now() + 60_000 : undefined,
    });
    if (pending) {
      await ctx.scheduler.runAfter(60_000, internal.accountDeletionActions.retryRevocations, { deletionId });
    }
    return null;
  },
});

export const markRetriedRevocation = internalMutation({
  args: { deletionId: v.id('accountDeletions'), connectionId: v.id('providerConnections'), ok: v.boolean(), code: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('accountDeletions', args.deletionId);
    if (!row || row.status !== 'done') return null;
    const results = (row.revocationResults ?? []).map((result) => result.connectionId === args.connectionId
      ? { ...result, ok: args.ok, code: args.code, sessionId: args.ok ? undefined : result.sessionId }
      : result);
    await ctx.db.patch('accountDeletions', row._id, {
      revocationResults: results,
      // Keep the done marker for the holding page until the retention sweep.
      nextRetryAtMs: results.every((result) => result.ok) ? undefined : Date.now() + DAY_MS,
      // Refresh the retention cursor so retried rows cannot pin the first
      // page of the oldDone scan and block rows behind them.
      updatedAtMs: Date.now(),
    });
    return null;
  },
});

export type DeletionId = Id<'accountDeletions'>;
