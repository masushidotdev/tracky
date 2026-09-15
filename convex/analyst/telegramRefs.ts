import { makeFunctionReference } from 'convex/server';
import type { Id } from '../_generated/dataModel';

export const telegramFunctionRefs = {
  storeLinkCode: makeFunctionReference<
    'mutation',
    { userId: string; codeHash: string; expiresAtMs: number },
    Id<'telegramLinkCodes'>
  >('analyst/telegram:storeLinkCode'),
  acceptUpdate: makeFunctionReference<
    'mutation',
    {
      updateId: number;
      chatId: string;
      text: string;
      locale: string;
      linkCommand: boolean;
      linkCodeHash?: string;
    },
    { accepted: boolean; duplicate: boolean }
  >('analyst/telegram:acceptTelegramUpdate'),
  processUpdate: makeFunctionReference<'action', { updateId: number }, null>('analyst/telegramActions:processTelegramUpdate'),
  claimUpdate: makeFunctionReference<
    'mutation',
    { updateId: number },
    | {
        updateId: number;
        chatId: string;
        kind: 'link' | 'message' | 'unlinkedMessage' | 'rateLimited';
        userId?: string;
        threadId?: string;
        promptMessageId?: string;
        inboundText: string;
        outboundText?: string;
        sentChunkCount: number;
        stage: 'generate' | 'send';
        locale: string;
        leaseToken: string;
        turnLockId?: Id<'analystTurnLocks'>;
      }
    | null
  >('analyst/telegram:claimTelegramUpdate'),
  consumeRateLimit: makeFunctionReference<'mutation', { userId: string }, true>(
    'analyst/telegram:consumeTelegramRateLimit',
  ),
  consumeIngressRateLimit: makeFunctionReference<'mutation', { chatId: string }, true>(
    'analyst/telegram:consumeTelegramIngressRateLimit',
  ),
  saveGeneratedReply: makeFunctionReference<
    'mutation',
    { updateId: number; leaseToken: string; outboundText: string },
    boolean
  >('analyst/telegram:saveTelegramGeneratedReply'),
  advanceChunk: makeFunctionReference<
    'mutation',
    { updateId: number; leaseToken: string; sentChunkCount: number; totalChunks: number },
    { accepted: boolean; completed: boolean }
  >('analyst/telegram:advanceTelegramChunk'),
  failUpdate: makeFunctionReference<
    'mutation',
    { updateId: number; leaseToken: string; errorCode: string },
    null
  >('analyst/telegram:failTelegramUpdate'),
};
