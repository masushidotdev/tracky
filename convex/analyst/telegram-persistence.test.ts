/// <reference types="vite/client" />

import agentTest from '@convex-dev/agent/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from '../_generated/api';
import schema from '../schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob(['../_generated/*.js', '../entitlements.ts', '../http.ts', './telegram.ts', './telegramActions.ts']);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./analyst/${path.slice(2)}`,
    loader,
  ]),
);

function createTest() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  rateLimiterTest.register(t);
  return t;
}

describe('Telegram link and update persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  test('does not store a late link code after account deletion begins or completes', async () => {
    const t = createTest();
    const now = Date.now();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('user_erasing'))), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const deletionId = await t.run(async (ctx) => ctx.db.insert('accountDeletions', {
      userId: 'user_erasing', userHash: hash, status: 'wiping',
      currentStep: 'telegram', requestedAtMs: now, updatedAtMs: now,
      attemptCount: 0, workosDeleted: false,
    }));
    await expect(t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_erasing', codeHash: 'b'.repeat(64), expiresAtMs: now + 60_000,
    })).rejects.toThrow('deletion_in_progress');
    await t.run(async (ctx) => {
      await ctx.db.patch('accountDeletions', deletionId, { userId: undefined, status: 'done' });
      await ctx.db.insert('deletedUsers', { userHash: hash, deletedAtMs: now });
    });
    await expect(t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_erasing', codeHash: 'c'.repeat(64), expiresAtMs: now + 60_000,
    })).rejects.toThrow('deletion_in_progress');
  });

  test('stops a claimed outbound reply when its link or account is removed', async () => {
    const t = createTest();
    const now = Date.now();
    const linkId = await t.run(async (ctx) => {
      const link = await ctx.db.insert('telegramLinks', {
        userId: 'user_send', chatId: 'chat_send', verifiedAtMs: now,
        locale: 'en', createdAtMs: now, updatedAtMs: now,
      });
      await ctx.db.insert('telegramUpdates', {
        updateId: 901, chatId: 'chat_send', kind: 'rateLimited', userId: 'user_send',
        inboundText: 'hello', outboundText: 'reply', locale: 'en', sentChunkCount: 0,
        stage: 'send', status: 'pending', attempts: 0, maxAttempts: 3,
        nextRunAtMs: now, createdAtMs: now, updatedAtMs: now,
      });
      return link;
    });
    const claim = await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 901 });
    expect(claim).not.toBeNull();
    expect(await t.mutation(internal.analyst.telegram.maySendTelegramChunk, {
      updateId: 901, leaseToken: claim!.leaseToken,
    })).toBe(true);
    await t.run(async (ctx) => { await ctx.db.delete('telegramLinks', linkId); });
    expect(await t.mutation(internal.analyst.telegram.maySendTelegramChunk, {
      updateId: 901, leaseToken: claim!.leaseToken,
    })).toBe(false);
  });

  test('an action does not send a reply after the account deletion fence appears', async () => {
    const t = createTest();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('telegramLinks', {
        userId: 'user_action_erasing', chatId: 'chat_action_erasing', verifiedAtMs: now,
        locale: 'en', createdAtMs: now, updatedAtMs: now,
      });
      await ctx.db.insert('telegramUpdates', {
        updateId: 902, chatId: 'chat_action_erasing', kind: 'rateLimited',
        userId: 'user_action_erasing', inboundText: 'hello', outboundText: 'sensitive reply',
        locale: 'en', sentChunkCount: 0, stage: 'send', status: 'pending',
        attempts: 0, maxAttempts: 3, nextRunAtMs: now, createdAtMs: now, updatedAtMs: now,
      });
      await ctx.db.insert('accountDeletions', {
        userId: 'user_action_erasing', userHash: 'd'.repeat(64), status: 'wiping',
        currentStep: 'telegram', requestedAtMs: now, updatedAtMs: now,
        attemptCount: 0, workosDeleted: false,
      });
    });
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    try {
      await t.action(internal.analyst.telegramActions.processTelegramUpdate, { updateId: 902 });
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('consumes a link code once, enforces chat ownership, and deduplicates update IDs', async () => {
    const t = createTest();
    const now = Date.now();
    const firstHash = 'a'.repeat(64);
    await t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_a',
      codeHash: firstHash,
      expiresAtMs: now + 60_000,
    });
    expect(
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 1,
        chatId: 'chat_a',
        text: '/link [redacted]',
        locale: 'en',
        linkCommand: true,
        linkCodeHash: firstHash,
      }),
    ).toEqual({ accepted: true, duplicate: false });
    expect(
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 1,
        chatId: 'chat_a',
        text: '/link [redacted]',
        locale: 'en',
        linkCommand: true,
        linkCodeHash: firstHash,
      }),
    ).toEqual({ accepted: true, duplicate: true });

    const secondHash = 'b'.repeat(64);
    await t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_b',
      codeHash: secondHash,
      expiresAtMs: now + 60_000,
    });
    await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
      updateId: 2,
      chatId: 'chat_a',
      text: '/link [redacted]',
      locale: 'en',
      linkCommand: true,
      linkCodeHash: secondHash,
    });
    await t.run(async (ctx) => {
      const links = await ctx.db.query('telegramLinks').take(10);
      const updates = await ctx.db.query('telegramUpdates').take(10);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ userId: 'user_a', chatId: 'chat_a' });
      expect(updates).toHaveLength(2);
      expect(updates.find((update) => update.updateId === 2)?.outboundText).toContain('already linked elsewhere');
    });
  });

  test('returns 503 before comparison when the configured webhook secret is invalid', async () => {
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'too_short';
    try {
      const response = await createTest().fetch('/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'too_short',
        },
        body: '{}',
      });
      expect(response.status).toBe(503);
    } finally {
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
      else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  });

  test('rejects expired codes without linking', async () => {
    const t = createTest();
    const codeHash = 'c'.repeat(64);
    await t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_a',
      codeHash,
      expiresAtMs: Date.now() + 1_000,
    });
    vi.advanceTimersByTime(2_000);
    await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
      updateId: 3,
      chatId: 'chat_a',
      text: '/link [redacted]',
      locale: 'it',
      linkCommand: true,
      linkCodeHash: codeHash,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query('telegramLinks').take(10)).toHaveLength(0);
      expect((await ctx.db.query('telegramUpdates').take(10))[0]?.outboundText).toContain('scaduto');
    });
  });

  test('keeps only the newest generated code for a user', async () => {
    const t = createTest();
    await t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_a',
      codeHash: 'd'.repeat(64),
      expiresAtMs: Date.now() + 60_000,
    });
    await t.mutation(internal.analyst.telegram.storeLinkCode, {
      userId: 'user_a',
      codeHash: 'e'.repeat(64),
      expiresAtMs: Date.now() + 60_000,
    });
    await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
      updateId: 5,
      chatId: 'chat_a',
      text: '/link [redacted]',
      locale: 'en',
      linkCommand: true,
      linkCodeHash: 'd'.repeat(64),
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query('telegramLinkCodes').take(10)).toHaveLength(1);
      expect(await ctx.db.query('telegramLinks').take(10)).toHaveLength(0);
    });
  });

  test('retries leased outbound work with bounded attempts and durable chunk progress', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('telegramUpdates', {
        updateId: 4,
        chatId: 'chat_a',
        kind: 'unlinkedMessage',
        inboundText: 'hello',
        locale: 'en',
        outboundText: 'Link first',
        sentChunkCount: 0,
        stage: 'send',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAtMs: Date.now(),
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    const first = await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 4 });
    expect(first?.leaseToken).toBeTruthy();
    await t.mutation(internal.analyst.telegram.failTelegramUpdate, {
      updateId: 4,
      leaseToken: first!.leaseToken,
      errorCode: 'telegram_network_error',
    });
    vi.advanceTimersByTime(3_000);
    const second = await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 4 });
    expect(second?.leaseToken).toBeTruthy();
    expect(
      await t.mutation(internal.analyst.telegram.advanceTelegramChunk, {
        updateId: 4,
        leaseToken: second!.leaseToken,
        sentChunkCount: 1,
        totalChunks: 1,
      }),
    ).toEqual({ accepted: true, completed: true });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('telegramUpdates')
        .withIndex('by_updateId', (q) => q.eq('updateId', 4))
        .unique();
      expect(row).toMatchObject({ status: 'completed', sentChunkCount: 1, attempts: 2 });
    });
  });

  test('shares the Analyst burst limit and persists a localized rejection', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('telegramLinks', {
        userId: 'user_a',
        chatId: 'chat_a',
        verifiedAtMs: Date.now(),
        locale: 'it',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    for (let index = 0; index < 7; index += 1) {
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 100 + index,
        chatId: 'chat_a',
        text: `message ${index}`,
        locale: 'it',
        linkCommand: false,
      });
    }
    await t.run(async (ctx) => {
      const updates = await ctx.db.query('telegramUpdates').take(10);
      expect(updates.filter((update) => update.kind === 'message')).toHaveLength(6);
      expect(updates.filter((update) => update.kind === 'rateLimited')).toHaveLength(1);
      expect(updates.find((update) => update.kind === 'rateLimited')?.outboundText).toContain('limite messaggi');
    });
  });

  test('processes one chat FIFO and schedules the successor after the predecessor completes', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      for (const updateId of [11, 10]) {
        await ctx.db.insert('telegramUpdates', {
          updateId,
          chatId: 'chat_fifo',
          kind: 'unlinkedMessage',
          inboundText: `message ${updateId}`,
          locale: 'en',
          outboundText: `reply ${updateId}`,
          sentChunkCount: 0,
          stage: 'send',
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          nextRunAtMs: Date.now(),
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        });
      }
    });

    expect(await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 11 })).toBeNull();
    const first = await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 10 });
    expect(first?.updateId).toBe(10);
    await t.mutation(internal.analyst.telegram.advanceTelegramChunk, {
      updateId: 10,
      leaseToken: first!.leaseToken,
      sentChunkCount: 1,
      totalChunks: 1,
    });

    await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      expect(jobs.some((job) => JSON.stringify(job.args).includes('"updateId":11'))).toBe(true);
    });
    expect((await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 11 }))?.updateId).toBe(11);
  });

  test('rejects stale chunk acknowledgements and advances valid multi-chunk progress', async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('telegramUpdates', {
        updateId: 12,
        chatId: 'chat_chunks',
        kind: 'unlinkedMessage',
        inboundText: 'hello',
        locale: 'en',
        outboundText: 'a'.repeat(5_000),
        sentChunkCount: 0,
        stage: 'send',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAtMs: Date.now(),
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    const claim = await t.mutation(internal.analyst.telegram.claimTelegramUpdate, { updateId: 12 });
    expect(claim?.leaseToken).toBeTruthy();

    expect(
      await t.mutation(internal.analyst.telegram.advanceTelegramChunk, {
        updateId: 12,
        leaseToken: 'stale-lease',
        sentChunkCount: 1,
        totalChunks: 2,
      }),
    ).toEqual({ accepted: false, completed: false });
    expect(
      await t.mutation(internal.analyst.telegram.advanceTelegramChunk, {
        updateId: 12,
        leaseToken: claim!.leaseToken,
        sentChunkCount: 1,
        totalChunks: 2,
      }),
    ).toEqual({ accepted: true, completed: false });
    expect(
      await t.mutation(internal.analyst.telegram.advanceTelegramChunk, {
        updateId: 12,
        leaseToken: claim!.leaseToken,
        sentChunkCount: 2,
        totalChunks: 2,
      }),
    ).toEqual({ accepted: true, completed: true });
  });

  test('bounds link, unlinked, and Analyst-limit rejection ingress per chat without durable overflow rows', async () => {
    const t = createTest();
    for (let index = 0; index < 21; index += 1) {
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 1_000 + index,
        chatId: 'chat_link_flood',
        text: '/link [redacted]',
        locale: 'en',
        linkCommand: true,
      });
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 2_000 + index,
        chatId: 'chat_unlinked_flood',
        text: 'hello',
        locale: 'en',
        linkCommand: false,
      });
    }
    await t.run(async (ctx) => {
      await ctx.db.insert('telegramLinks', {
        userId: 'user_ingress',
        chatId: 'chat_linked_flood',
        verifiedAtMs: Date.now(),
        locale: 'it',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    for (let index = 0; index < 25; index += 1) {
      await t.mutation(internal.analyst.telegram.acceptTelegramUpdate, {
        updateId: 3_000 + index,
        chatId: 'chat_linked_flood',
        text: `message ${index}`,
        locale: 'it',
        linkCommand: false,
      });
    }

    await t.run(async (ctx) => {
      const updates = await ctx.db.query('telegramUpdates').take(100);
      expect(updates.filter((update) => update.chatId === 'chat_link_flood')).toHaveLength(20);
      expect(updates.filter((update) => update.chatId === 'chat_unlinked_flood')).toHaveLength(20);
      const linked = updates.filter((update) => update.chatId === 'chat_linked_flood');
      expect(linked.filter((update) => update.kind === 'message')).toHaveLength(6);
      expect(linked.filter((update) => update.kind === 'rateLimited')).toHaveLength(14);
    });
  });
});
