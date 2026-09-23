'use node';

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { enableBankingRequest } from './banking/enableBanking';
import type { Doc, Id } from './_generated/dataModel';

type RevocationResult = { ok: boolean; code?: string };

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return `HTTP_${error.status}`;
  }
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

async function revokeSession(sessionId: string): Promise<RevocationResult> {
  try {
    await enableBankingRequest('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
    return { ok: true };
  } catch (error) {
    // An expired or already removed session has no consent left to revoke.
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return { ok: true, code: 'HTTP_404' };
    }
    console.error('Enable Banking session revocation failed', { code: errorCode(error) });
    return { ok: false, code: errorCode(error) };
  }
}

async function deleteWorkosUser(userId: string): Promise<void> {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error('Missing WORKOS_API_KEY');
  const response = await fetch(`https://api.workos.com/user_management/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.ok || response.status === 404) return;
  throw new Error(`WorkOS DELETE returned HTTP_${response.status}`);
}

export const beginWipe = internalAction({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.null(),
  handler: async (ctx, { deletionId }): Promise<null> => {
    const row: Doc<'accountDeletions'> | null = await ctx.runQuery(internal.accountDeletion.getWork, { deletionId });
    if (!row || row.status !== 'wiping' || !row.userId) return null;
    try {
      let done = false;
      switch (row.currentStep) {
        case 'disconnect':
          ({ done } = await ctx.runMutation(internal.accountDeletion.stopSyncBatch, { deletionId }));
          break;
        case 'personalData':
        case 'telegram':
        case 'bankingLeaves':
        case 'bankingCore':
          ({ done } = await ctx.runMutation(internal.accountDeletionBanking.wipeBankingBatch, {
            userId: row.userId, stage: row.currentStep,
          }));
          break;
        case 'planning':
        case 'forecast':
        case 'misc':
          ({ done } = await ctx.runMutation(internal.accountDeletionPlanning.wipePlanningBatch, {
            userId: row.userId, stage: row.currentStep,
          }));
          break;
        case 'agentThreads':
          ({ done } = await ctx.runAction(internal.accountDeletionPlanning.wipeAgentThread, {
            deletionId, userId: row.userId,
          }));
          break;
        case 'providerRevocation': {
          let cursor: string | null = null;
          let connection: Doc<'providerConnections'> | null = null;
          do {
            const page: { connection: Doc<'providerConnections'> | null; cursor: string | null; done: boolean } =
              await ctx.runQuery(internal.accountDeletion.getNextRevocation, { deletionId, cursor });
            connection = page.connection;
            if (connection || page.done) break;
            cursor = page.cursor;
          } while (cursor);
          if (connection?.sessionId) {
            const result = await revokeSession(connection.sessionId);
            await ctx.runMutation(internal.accountDeletion.recordRevocation, {
              deletionId, connectionId: connection._id, provider: connection.provider,
              sessionId: connection.sessionId, ...result,
            });
            done = false;
          } else {
            done = true;
          }
          break;
        }
        case 'profile':
          await ctx.runMutation(internal.accountDeletion.eraseProfile, { deletionId });
          done = true;
          break;
        case 'workos':
          await deleteWorkosUser(row.userId);
          await ctx.runMutation(internal.accountDeletion.completeWorkos, { deletionId });
          return null;
        default:
          throw new Error(`Unknown account deletion step: ${row.currentStep}`);
      }
      await ctx.runMutation(internal.accountDeletion.advanceWipe, {
        deletionId, completedStep: row.currentStep, done,
      });
    } catch (error) {
      await ctx.runMutation(internal.accountDeletion.failWipe, {
        deletionId, message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  },
});

export const retryRevocations = internalAction({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.null(),
  handler: async (ctx, { deletionId }): Promise<null> => {
    const row: Doc<'accountDeletions'> | null = await ctx.runQuery(internal.accountDeletion.getWork, { deletionId });
    if (!row || row.status !== 'done') return null;
    for (const result of row.revocationResults ?? []) {
      if (result.ok || !result.sessionId || result.provider !== 'enableBanking') continue;
      const retry = await revokeSession(result.sessionId);
      await ctx.runMutation(internal.accountDeletion.markRetriedRevocation, {
        deletionId, connectionId: result.connectionId, ...retry,
      });
    }
    return null;
  },
});

export const retryDetachedConsent = internalAction({
  args: { revocationId: v.id('detachedConsentRevocations') },
  returns: v.null(),
  handler: async (ctx, { revocationId }): Promise<null> => {
    const row: Doc<'detachedConsentRevocations'> | null = await ctx.runQuery(
      internal.accountDeletion.getDetachedConsent, { revocationId },
    );
    if (!row) return null;
    const result = await revokeSession(row.sessionId);
    await ctx.runMutation(internal.accountDeletion.recordDetachedConsentAttempt, {
      revocationId, ...result,
    });
    return null;
  },
});

export type { Id };
