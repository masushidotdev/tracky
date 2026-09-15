import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type ReadCtx = QueryCtx | MutationCtx;

const MAX_CARD_FACILITIES = 200;
const MAX_USAGE_CYCLES = 500;

/**
 * Usage-cycle settlements can exist only as a cash-side transaction. Point each such transaction
 * back to the CARD account whose payment bucket owns the activity; callers ignore rows with a
 * transfer match because their card-side leg is the canonical source instead.
 */
export async function cardStatementSettlementCardAccountIds(ctx: ReadCtx, userId: string) {
  const [facilities, cycles] = await Promise.all([
    ctx.db
      .query('creditFacilities')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_CARD_FACILITIES + 1),
    ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', userId))
      .take(MAX_USAGE_CYCLES + 1),
  ]);
  if (facilities.length > MAX_CARD_FACILITIES) throw new ConvexError('Too many card facilities to read');
  if (cycles.length > MAX_USAGE_CYCLES) throw new ConvexError('Too many card usage cycles to read');

  const cardAccountIdByFacilityId = new Map<Id<'creditFacilities'>, Id<'financialAccounts'>>();
  for (const facility of facilities) {
    if (facility.linkedAccountId) cardAccountIdByFacilityId.set(facility._id, facility.linkedAccountId);
  }

  const cardAccountIdByTransactionId = new Map<Id<'transactions'>, Id<'financialAccounts'>>();
  for (const cycle of cycles) {
    const cardAccountId = cardAccountIdByFacilityId.get(cycle.creditFacilityId);
    if (cycle.transactionId && cardAccountId) {
      cardAccountIdByTransactionId.set(cycle.transactionId, cardAccountId);
    }
  }
  return cardAccountIdByTransactionId;
}
