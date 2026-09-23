'use node';

import { listMessages } from '@convex-dev/agent';
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { components, internal } from '../_generated/api';
import { makeAnalystAgent } from './agent';
import { DEFAULT_MODEL } from './models';
import { retrieveMemoryContext } from './memoryActions';
import {
  isValidTelegramWebhookSecret,
  shouldContinueTelegramChunkDelivery,
  telegramApprovalReply,
  telegramTextChunks,
} from './telegramCore';
import { telegramFunctionRefs } from './telegramRefs';
import { analystFunctionRefs } from './functionRefs';

class SafeTelegramError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new SafeTelegramError('telegram_not_configured');
  return { token };
}

async function sendTelegramChunk(chatId: string, text: string) {
  const { token } = telegramConfig();
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    throw new SafeTelegramError('telegram_network_error');
  }
  if (!response.ok) throw new SafeTelegramError(response.status >= 500 ? 'telegram_server_error' : 'telegram_rejected');
}

export const sendNotificationTelegram = internalAction({
  args: { notificationId: v.id('notifications'), userId: v.string(), chatId: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<{ sent: true; chunkCount: number }> => {
    const chunks = telegramTextChunks(args.text);
    if (chunks.length === 0) {
      throw new SafeTelegramError('empty_outbound_message');
    }
    for (const chunk of chunks) {
      const allowed: boolean = await ctx.runMutation(internal.notificationDelivery.maySendNotificationTelegram, {
        notificationId: args.notificationId,
        userId: args.userId,
        chatId: args.chatId,
      });
      if (!allowed) throw new SafeTelegramError('notification_cancelled');
      await sendTelegramChunk(args.chatId, chunk);
    }
    return { sent: true, chunkCount: chunks.length };
  },
});

function messageRequestsApproval(message: Awaited<ReturnType<typeof listMessages>>['page'][number]) {
  const content = message.message?.content;
  return (
    message.message?.role === 'assistant' &&
    Array.isArray(content) &&
    content.some((part) => part.type === 'tool-approval-request')
  );
}

async function existingAgentReply(
  ctx: Parameters<typeof listMessages>[0],
  threadId: string,
  promptMessageId: string,
  locale: string,
) {
  const messages = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const prompt = messages.page.find((message) => message._id === promptMessageId);
  if (!prompt) return null;
  const responses = messages.page
    .filter(
      (message) =>
        message.order === prompt.order &&
        message.stepOrder > prompt.stepOrder &&
        message.status === 'success' &&
        message.message?.role === 'assistant',
    )
    .sort((left, right) => left.stepOrder - right.stepOrder);
  if (responses.length === 0) return null;
  const text = responses
    .map((message) => message.text?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const approvalRequired = responses.some(messageRequestsApproval);
  return [text, approvalRequired ? telegramApprovalReply(locale) : ''].filter(Boolean).join('\n\n') || null;
}

export const processTelegramUpdate = internalAction({
  args: { updateId: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const claim = await ctx.runMutation(telegramFunctionRefs.claimUpdate, { updateId: args.updateId });
    if (!claim) return null;
    try {
      if (claim.stage === 'generate') {
        if (!claim.userId || !claim.threadId || !claim.promptMessageId) {
          throw new SafeTelegramError('invalid_generation_state');
        }
        let reply = await existingAgentReply(ctx, claim.threadId, claim.promptMessageId, claim.locale);
        if (!reply) {
          const memoryContext = await retrieveMemoryContext(ctx, claim.userId, claim.inboundText);
          const agent = makeAnalystAgent(DEFAULT_MODEL, claim.locale, undefined, memoryContext);
          const result = await agent.generateText(
            ctx,
            { threadId: claim.threadId, userId: claim.userId },
            { promptMessageId: claim.promptMessageId },
            { contextOptions: { recentMessages: 30 } },
          );
          reply =
            (await existingAgentReply(ctx, claim.threadId, claim.promptMessageId, claim.locale)) ??
            (result.text.trim() || telegramApprovalReply(claim.locale));
        }
        await ctx.runMutation(telegramFunctionRefs.saveGeneratedReply, {
          updateId: claim.updateId,
          leaseToken: claim.leaseToken,
          outboundText: reply,
        });
        return null;
      }

      const chunks = telegramTextChunks(claim.outboundText ?? '');
      if (chunks.length === 0) throw new SafeTelegramError('empty_outbound_message');
      for (let index = claim.sentChunkCount; index < chunks.length; index += 1) {
        const allowed = await ctx.runMutation(telegramFunctionRefs.maySendChunk, {
          updateId: claim.updateId,
          leaseToken: claim.leaseToken,
        });
        if (!allowed) return null;
        await sendTelegramChunk(claim.chatId, chunks[index]);
        const acknowledgement = await ctx.runMutation(telegramFunctionRefs.advanceChunk, {
          updateId: claim.updateId,
          leaseToken: claim.leaseToken,
          sentChunkCount: index + 1,
          totalChunks: chunks.length,
        });
        if (!shouldContinueTelegramChunkDelivery(acknowledgement)) return null;
      }
      return null;
    } catch (error) {
      await ctx.runMutation(telegramFunctionRefs.failUpdate, {
        updateId: claim.updateId,
        leaseToken: claim.leaseToken,
        errorCode: error instanceof SafeTelegramError ? error.code : 'telegram_processing_failed',
      });
      return null;
    } finally {
      if (claim.turnLockId && claim.userId && claim.threadId) {
        await ctx.runMutation(analystFunctionRefs.releaseAnalystTurn, {
          turnLockId: claim.turnLockId,
          userId: claim.userId,
          threadId: claim.threadId,
        });
      }
    }
  },
});

export const registerTelegramWebhook = internalAction({
  args: {},
  handler: async (): Promise<{ ok: true }> => {
    const { token } = telegramConfig();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
    if (!isValidTelegramWebhookSecret(secret)) {
      throw new SafeTelegramError('invalid_webhook_secret_configuration');
    }
    if (!webhookUrl) throw new SafeTelegramError('missing_webhook_url');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch {
      throw new SafeTelegramError('invalid_webhook_url');
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.pathname !== '/telegram-webhook' || parsedUrl.username || parsedUrl.password) {
      throw new SafeTelegramError('invalid_webhook_url');
    }
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: parsedUrl.toString(),
          secret_token: secret,
          allowed_updates: ['message'],
          drop_pending_updates: false,
        }),
      });
    } catch {
      throw new SafeTelegramError('telegram_network_error');
    }
    if (!response.ok) throw new SafeTelegramError('telegram_webhook_registration_failed');
    return { ok: true };
  },
});
