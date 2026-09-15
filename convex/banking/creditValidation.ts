import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DbCtx = QueryCtx | MutationCtx;

export async function validateSettlementAccount(
  ctx: DbCtx,
  userId: string,
  accountId: Id<'financialAccounts'>,
  facilityCurrency: string,
) {
  const account = await ctx.db.get('financialAccounts', accountId);
  if (!account || account.userId !== userId) {
    throw new ConvexError('Account not found');
  }
  if (account.accountType === 'CARD') {
    throw new ConvexError('The settlement account must be a cash account, not a card');
  }
  if (account.status !== 'active') {
    throw new ConvexError('The settlement account must be active');
  }
  if (account.currency !== facilityCurrency) {
    throw new ConvexError('The settlement account currency must match the credit facility currency');
  }
  return account;
}
