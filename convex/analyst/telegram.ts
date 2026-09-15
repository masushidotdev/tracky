import { createThread, getThreadMetadata, saveMessage } from '@convex-dev/agent';
import { ConvexError, v } from 'convex/values';
import { action, internalMutation, mutation, query } from '../_generated/server';
import { components } from '../_generated/api';
import { requireAuthUser } from '../auth';
import { analystFunctionRefs } from './functionRefs';
import { claimAnalystTurn } from './turnLocks';
import {
  sha256Hex,
  telegramLinkReply,
  telegramRateLimitReply,
  telegramUnlinkedReply,
  truncateTelegramText,
} from './telegramCore';
import { telegramFunctionRefs } from './telegramRefs';
import { analystRateLimiter, dailyLimitNameForTier } from './rateLimits';
import type { MutationCtx } from '../_generated/server';

const LINK_CODE_TTL_MS = 10 * 60 * 1_000;
const UPDATE_LEASE_MS = 12 * 60 * 1_000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomLinkCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length]).join('');
}

export const generateTelegramLinkCode = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const code = randomLinkCode();
    const codeHash = await sha256Hex(code);
    const expiresAtMs = Date.now() + LINK_CODE_TTL_MS;
    await ctx.runMutation(telegramFunctionRefs.storeLinkCode, { userId: user.id, codeHash, expiresAtMs });
    return { code, expiresAtMs, command: `/link ${code}` };
  },
});

export const telegramStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const link = await ctx.db
      .query('telegramLinks')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .unique();
    return link
      ? {
          linked: true as const,
          chatSuffix: link.chatId.slice(-4),
          verifiedAtMs: link.verifiedAtMs,
          locale: link.locale,
        }
      : { linked: false as const };
  },
});

export const unlinkTelegram = mutation({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const user = await requireAuthUser(ctx);
    const link = await ctx.db
      .query('telegramLinks')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .unique();
    if (!link) return false;
    await ctx.db.delete('telegramLinks', link._id);
    return true;
  },
});

export const storeLinkCode = internalMutation({
  args: { userId: v.string(), codeHash: v.string(), expiresAtMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!/^[a-f0-9]{64}$/.test(args.codeHash)) throw new ConvexError('Invalid link code hash');
    if (args.expiresAtMs <= now || args.expiresAtMs > now + LINK_CODE_TTL_MS + 5_000) {
      throw new ConvexError('Invalid link code expiry');
    }
    const collision = await ctx.db
      .query('telegramLinkCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', args.codeHash))
      .unique();
    if (collision) throw new ConvexError('Unable to generate link code');
    const previous = await ctx.db
      .query('telegramLinkCodes')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (previous) {
      await ctx.db.patch('telegramLinkCodes', previous._id, {
        codeHash: args.codeHash,
        expiresAtMs: args.expiresAtMs,
        usedAtMs: undefined,
        createdAtMs: now,
      });
      return previous._id;
    }
    return await ctx.db.insert('telegramLinkCodes', {
      userId: args.userId,
      codeHash: args.codeHash,
      expiresAtMs: args.expiresAtMs,
      createdAtMs: now,
    });
  },
});

async function enqueueTelegramWorker(ctx: MutationCtx, updateId: number, delayMs = 0) {
  await ctx.scheduler.runAfter(Math.max(0, delayMs), telegramFunctionRefs.processUpdate, { updateId });
}

async function enqueueNextTelegramUpdateForChat(ctx: MutationCtx, chatId: string) {
  const next = await ctx.db
    .query('telegramUpdates')
    .withIndex('by_chatId_and_status_and_updateId', (q) => q.eq('chatId', chatId).eq('status', 'pending'))
    .first();
  if (next) await enqueueTelegramWorker(ctx, next.updateId, next.nextRunAtMs - Date.now());
}

export const consumeTelegramRateLimit = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<true> => {
    await analystRateLimiter.limit(ctx, 'analystBurst', { key: args.userId, throws: true });
    const entitlements = await ctx.runQuery(analystFunctionRefs.entitlementsForUser, { userId: args.userId });
    await analystRateLimiter.limit(ctx, dailyLimitNameForTier(entitlements.tier), {
      key: args.userId,
      throws: true,
    });
    return true;
  },
});

export const consumeTelegramIngressRateLimit = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<true> => {
    await analystRateLimiter.limit(ctx, 'telegramIngressBurst', { key: args.chatId, throws: true });
    await analystRateLimiter.limit(ctx, 'telegramIngressDaily', { key: args.chatId, throws: true });
    return true;
  },
});

export const acceptTelegramUpdate = internalMutation({
  args: {
    updateId: v.number(),
    chatId: v.string(),
    text: v.string(),
    locale: v.string(),
    linkCommand: v.boolean(),
    linkCodeHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ accepted: boolean; duplicate: boolean }> => {
    if (!Number.isSafeInteger(args.updateId) || args.updateId < 0) throw new ConvexError('Invalid Telegram update');
    if (!args.chatId || args.chatId.length > 64 || !args.text || args.text.length > 4_000) {
      throw new ConvexError('Invalid Telegram update');
    }
    const duplicate = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_updateId', (q) => q.eq('updateId', args.updateId))
      .unique();
    if (duplicate) return { accepted: true, duplicate: true };
    try {
      await ctx.runMutation(telegramFunctionRefs.consumeIngressRateLimit, { chatId: args.chatId });
    } catch {
      return { accepted: true, duplicate: false };
    }
    const now = Date.now();
    if (args.linkCommand) {
      let replyState: 'linked' | 'invalid' | 'conflict' | 'alreadyLinked' = 'invalid';
      let linkedUserId: string | undefined;
      if (args.linkCodeHash && /^[a-f0-9]{64}$/.test(args.linkCodeHash)) {
        const code = await ctx.db
          .query('telegramLinkCodes')
          .withIndex('by_codeHash', (q) => q.eq('codeHash', args.linkCodeHash!))
          .unique();
        if (code && !code.usedAtMs && code.expiresAtMs > now) {
          const userLink = await ctx.db
            .query('telegramLinks')
            .withIndex('by_userId', (q) => q.eq('userId', code.userId))
            .unique();
          const chatLink = await ctx.db
            .query('telegramLinks')
            .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId))
            .unique();
          if (userLink?.chatId === args.chatId && chatLink?.userId === code.userId) {
            replyState = 'alreadyLinked';
            linkedUserId = code.userId;
            await ctx.db.patch('telegramLinks', userLink._id, { locale: args.locale, updatedAtMs: now });
            await ctx.db.patch('telegramLinkCodes', code._id, { usedAtMs: now });
          } else if (userLink || chatLink) {
            replyState = 'conflict';
          } else {
            replyState = 'linked';
            linkedUserId = code.userId;
            await ctx.db.insert('telegramLinks', {
              userId: code.userId,
              chatId: args.chatId,
              verifiedAtMs: now,
              locale: args.locale,
              createdAtMs: now,
              updatedAtMs: now,
            });
            await ctx.db.patch('telegramLinkCodes', code._id, { usedAtMs: now });
          }
        }
      }
      await ctx.db.insert('telegramUpdates', {
        updateId: args.updateId,
        chatId: args.chatId,
        kind: 'link',
        userId: linkedUserId,
        inboundText: '/link [redacted]',
        locale: args.locale,
        outboundText: telegramLinkReply(args.locale, replyState),
        sentChunkCount: 0,
        stage: 'send',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await enqueueTelegramWorker(ctx, args.updateId);
      return { accepted: true, duplicate: false };
    }

    const link = await ctx.db
      .query('telegramLinks')
      .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId))
      .unique();
    if (!link) {
      await ctx.db.insert('telegramUpdates', {
        updateId: args.updateId,
        chatId: args.chatId,
        kind: 'unlinkedMessage',
        inboundText: args.text,
        locale: args.locale,
        outboundText: telegramUnlinkedReply(args.locale),
        sentChunkCount: 0,
        stage: 'send',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await enqueueTelegramWorker(ctx, args.updateId);
      return { accepted: true, duplicate: false };
    }

    let rateLimitAllowed = true;
    try {
      await ctx.runMutation(telegramFunctionRefs.consumeRateLimit, { userId: link.userId });
    } catch {
      rateLimitAllowed = false;
    }
    if (!rateLimitAllowed) {
      await ctx.db.insert('telegramUpdates', {
        updateId: args.updateId,
        chatId: args.chatId,
        kind: 'rateLimited',
        userId: link.userId,
        inboundText: args.text,
        locale: args.locale,
        outboundText: telegramRateLimitReply(args.locale),
        sentChunkCount: 0,
        stage: 'send',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await enqueueTelegramWorker(ctx, args.updateId);
      return { accepted: true, duplicate: false };
    }

    let threadId = link.threadId;
    if (threadId) {
      try {
        const thread = await getThreadMetadata(ctx, components.agent, { threadId });
        if (thread.userId !== link.userId || thread.status !== 'active') threadId = undefined;
      } catch {
        threadId = undefined;
      }
    }
    if (!threadId) {
      threadId = await createThread(ctx, components.agent, {
        userId: link.userId,
        title: args.locale.startsWith('it') ? 'Telegram' : 'Telegram',
      });
    }
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: link.userId,
      prompt: args.text,
    });
    await ctx.db.patch('telegramLinks', link._id, { threadId, locale: args.locale, updatedAtMs: now });
    await ctx.db.insert('telegramUpdates', {
      updateId: args.updateId,
      chatId: args.chatId,
      kind: 'message',
      userId: link.userId,
      threadId,
      promptMessageId: messageId,
      inboundText: args.text,
      locale: args.locale,
      sentChunkCount: 0,
      stage: 'generate',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      nextRunAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await enqueueTelegramWorker(ctx, args.updateId);
    return { accepted: true, duplicate: false };
  },
});

export const claimTelegramUpdate = internalMutation({
  args: { updateId: v.number() },
  handler: async (ctx, args) => {
    const update = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_updateId', (q) => q.eq('updateId', args.updateId))
      .unique();
    if (!update || update.status === 'completed' || update.status === 'failed') return null;
    const now = Date.now();
    const earlierPending = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_chatId_and_status_and_updateId', (q) =>
        q.eq('chatId', update.chatId).eq('status', 'pending').lt('updateId', update.updateId),
      )
      .first();
    const earlierProcessing = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_chatId_and_status_and_updateId', (q) =>
        q.eq('chatId', update.chatId).eq('status', 'processing').lt('updateId', update.updateId),
      )
      .first();
    if (earlierPending || earlierProcessing) {
      if (update.status === 'processing' && (update.leaseExpiresAtMs ?? 0) <= now) {
        await ctx.db.patch('telegramUpdates', update._id, {
          status: 'pending',
          leaseToken: undefined,
          leaseExpiresAtMs: undefined,
          nextRunAtMs: now,
          updatedAtMs: now,
        });
      }
      return null;
    }
    if (update.kind === 'message') {
      const link = await ctx.db
        .query('telegramLinks')
        .withIndex('by_chatId', (q) => q.eq('chatId', update.chatId))
        .unique();
      if (!link || link.userId !== update.userId) {
        await ctx.db.patch('telegramUpdates', update._id, {
          status: 'failed',
          leaseToken: undefined,
          leaseExpiresAtMs: undefined,
          errorCode: 'link_removed',
          updatedAtMs: now,
        });
        await enqueueNextTelegramUpdateForChat(ctx, update.chatId);
        return null;
      }
    }
    if (update.status === 'processing' && (update.leaseExpiresAtMs ?? 0) > now) return null;
    if (update.nextRunAtMs > now) return null;
    if (update.attempts >= update.maxAttempts) {
      await ctx.db.patch('telegramUpdates', update._id, {
        status: 'failed',
        leaseToken: undefined,
        leaseExpiresAtMs: undefined,
        errorCode: 'attempts_exhausted',
        updatedAtMs: now,
      });
      await enqueueNextTelegramUpdateForChat(ctx, update.chatId);
      return null;
    }
    const leaseToken = `${update.updateId}:${update.stage}:${update.attempts + 1}:${now}`;
    const turnLockId =
      update.kind === 'message' && update.stage === 'generate' && update.userId && update.threadId
        ? await claimAnalystTurn(ctx, update.userId, update.threadId)
        : undefined;
    await ctx.db.patch('telegramUpdates', update._id, {
      status: 'processing',
      attempts: update.attempts + 1,
      leaseToken,
      leaseExpiresAtMs: now + UPDATE_LEASE_MS,
      updatedAtMs: now,
    });
    return {
      updateId: update.updateId,
      chatId: update.chatId,
      kind: update.kind,
      userId: update.userId,
      threadId: update.threadId,
      promptMessageId: update.promptMessageId,
      inboundText: update.inboundText,
      outboundText: update.outboundText,
      sentChunkCount: update.sentChunkCount,
      stage: update.stage,
      locale: update.locale,
      leaseToken,
      turnLockId,
    };
  },
});

export const saveTelegramGeneratedReply = internalMutation({
  args: { updateId: v.number(), leaseToken: v.string(), outboundText: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const update = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_updateId', (q) => q.eq('updateId', args.updateId))
      .unique();
    if (!update || update.status !== 'processing' || update.leaseToken !== args.leaseToken) return false;
    const outboundText = truncateTelegramText(args.outboundText, 12_288);
    if (!outboundText) throw new ConvexError('Telegram reply cannot be empty');
    const now = Date.now();
    await ctx.db.patch('telegramUpdates', update._id, {
      outboundText,
      sentChunkCount: 0,
      stage: 'send',
      status: 'pending',
      attempts: 0,
      nextRunAtMs: now,
      leaseToken: undefined,
      leaseExpiresAtMs: undefined,
      errorCode: undefined,
      updatedAtMs: now,
    });
    await enqueueTelegramWorker(ctx, args.updateId);
    return true;
  },
});

export const advanceTelegramChunk = internalMutation({
  args: { updateId: v.number(), leaseToken: v.string(), sentChunkCount: v.number(), totalChunks: v.number() },
  handler: async (ctx, args): Promise<{ accepted: boolean; completed: boolean }> => {
    const update = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_updateId', (q) => q.eq('updateId', args.updateId))
      .unique();
    if (!update || update.status !== 'processing' || update.leaseToken !== args.leaseToken) {
      return { accepted: false, completed: false };
    }
    if (
      !Number.isInteger(args.sentChunkCount) ||
      args.sentChunkCount !== update.sentChunkCount + 1 ||
      args.sentChunkCount > args.totalChunks
    ) {
      throw new ConvexError('Invalid Telegram chunk acknowledgement');
    }
    const now = Date.now();
    const completed = args.sentChunkCount === args.totalChunks;
    await ctx.db.patch('telegramUpdates', update._id, {
      sentChunkCount: args.sentChunkCount,
      status: completed ? 'completed' : 'processing',
      leaseToken: completed ? undefined : update.leaseToken,
      leaseExpiresAtMs: completed ? undefined : now + UPDATE_LEASE_MS,
      completedAtMs: completed ? now : undefined,
      updatedAtMs: now,
    });
    if (completed) await enqueueNextTelegramUpdateForChat(ctx, update.chatId);
    return { accepted: true, completed };
  },
});

export const failTelegramUpdate = internalMutation({
  args: { updateId: v.number(), leaseToken: v.string(), errorCode: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const update = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_updateId', (q) => q.eq('updateId', args.updateId))
      .unique();
    if (!update || update.status !== 'processing' || update.leaseToken !== args.leaseToken) return null;
    const now = Date.now();
    const terminal = update.attempts >= update.maxAttempts;
    const nextRunAtMs = terminal ? now : now + Math.min(60_000, 2 ** update.attempts * 1_000);
    await ctx.db.patch('telegramUpdates', update._id, {
      status: terminal ? 'failed' : 'pending',
      nextRunAtMs,
      leaseToken: undefined,
      leaseExpiresAtMs: undefined,
      errorCode: args.errorCode.slice(0, 80),
      updatedAtMs: now,
    });
    if (terminal) await enqueueNextTelegramUpdateForChat(ctx, update.chatId);
    else await enqueueTelegramWorker(ctx, update.updateId, nextRunAtMs - now);
    return null;
  },
});

export const watchdogTelegramUpdates = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<number> => {
    const now = Date.now();
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)));
    const pending = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_status_and_nextRunAtMs', (q) => q.eq('status', 'pending').lte('nextRunAtMs', now))
      .take(limit);
    const expired = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_status_and_leaseExpiresAtMs', (q) => q.eq('status', 'processing').lte('leaseExpiresAtMs', now))
      .take(limit);
    const updates = [...new Map([...pending, ...expired].map((update) => [update._id, update])).values()].slice(0, limit);
    for (const update of updates) {
      if (update.attempts >= update.maxAttempts) {
        await ctx.db.patch('telegramUpdates', update._id, {
          status: 'failed',
          leaseToken: undefined,
          leaseExpiresAtMs: undefined,
          errorCode: 'attempts_exhausted',
          updatedAtMs: now,
        });
        await enqueueNextTelegramUpdateForChat(ctx, update.chatId);
        continue;
      }
      if (update.status === 'processing') {
        await ctx.db.patch('telegramUpdates', update._id, {
          status: 'pending',
          leaseToken: undefined,
          leaseExpiresAtMs: undefined,
          nextRunAtMs: now,
          updatedAtMs: now,
        });
      }
      await enqueueTelegramWorker(ctx, update.updateId);
    }
    return updates.length;
  },
});

export const cleanupTelegramLinkCodes = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<number> => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const expired = await ctx.db
      .query('telegramLinkCodes')
      .withIndex('by_expiresAtMs', (q) => q.lte('expiresAtMs', Date.now()))
      .take(limit);
    for (const code of expired) await ctx.db.delete('telegramLinkCodes', code._id);
    return expired.length;
  },
});

export const cleanupTelegramUpdates = internalMutation({
  args: { limit: v.optional(v.number()), retentionDays: v.optional(v.number()) },
  handler: async (ctx, args): Promise<number> => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const retentionDays = Math.max(7, Math.min(90, Math.floor(args.retentionDays ?? 30)));
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
    const completed = await ctx.db
      .query('telegramUpdates')
      .withIndex('by_status_and_updatedAtMs', (q) => q.eq('status', 'completed').lte('updatedAtMs', cutoff))
      .take(limit);
    const remaining = limit - completed.length;
    const failed =
      remaining > 0
        ? await ctx.db
            .query('telegramUpdates')
            .withIndex('by_status_and_updatedAtMs', (q) => q.eq('status', 'failed').lte('updatedAtMs', cutoff))
            .take(remaining)
        : [];
    const updates = [...completed, ...failed];
    for (const update of updates) await ctx.db.delete('telegramUpdates', update._id);
    return updates.length;
  },
});
