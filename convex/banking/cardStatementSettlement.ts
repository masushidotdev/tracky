import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation } from '../_generated/server';
import { absoluteMinorUnits } from '../lib/money';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const MAX_STATEMENT_SETTLEMENT_DAY_DELTA = 45;
const PROVIDER_REPLACEMENT_DAY_DELTA = 7;
const PROVIDER_RECONCILIATION_ATTEMPTS = 50;
const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

export const CARD_STATEMENT_SYNTHETIC_KIND = 'cardStatementSettlement';

export function cardStatementSyntheticDedupeKey(outgoingTransactionId: Id<'transactions'>) {
  return `tracky|card-statement|${outgoingTransactionId}`;
}

export function cardStatementSyntheticMetadata(outgoingTransactionId: Id<'transactions'>) {
  return {
    trackySyntheticKind: CARD_STATEMENT_SYNTHETIC_KIND,
    trackyOutgoingTransactionId: outgoingTransactionId,
  };
}

function isSyntheticCardStatementLeg(transaction: Doc<'transactions'>) {
  return transaction.providerMetadata?.trackySyntheticKind === CARD_STATEMENT_SYNTHETIC_KIND;
}

// Same tolerance shape as installment payments: 5% of the tracked amount,
// with a 5€ floor, so small statement fees don't block auto-settlement.
function statementAmountToleranceMinor(trackedAmountMinor: bigint) {
  const percentageTolerance = trackedAmountMinor / 20n;
  return percentageTolerance > 500n ? percentageTolerance : 500n;
}

function daysBetween(left: string, right: string) {
  const leftMs = Date.parse(`${left.slice(0, 10)}T00:00:00.000Z`);
  const rightMs = Date.parse(`${right.slice(0, 10)}T00:00:00.000Z`);
  return Math.round(Math.abs(leftMs - rightMs) / (24 * 60 * 60 * 1_000));
}

export function statementCycleMatchesPayment(
  cycle: Pick<Doc<'creditFacilityUsageCycles'>, 'dueDate' | 'trackedAmount'>,
  payment: {
    amount: { amountMinor: bigint; currency: string };
    bookingDate: string;
  },
) {
  if (cycle.trackedAmount.currency !== payment.amount.currency) {
    return false;
  }

  const amountDeltaMinor = absoluteMinorUnits(cycle.trackedAmount.amountMinor - payment.amount.amountMinor);
  return (
    amountDeltaMinor <= statementAmountToleranceMinor(cycle.trackedAmount.amountMinor) &&
    daysBetween(cycle.dueDate, payment.bookingDate) <= MAX_STATEMENT_SETTLEMENT_DAY_DELTA
  );
}

// When a confirmed transfer credits a CARD account (the statement settlement
// leg), the matching scheduled statement cycle of the card's credit facility
// is settled automatically. No match within tolerance -> no-op; the manual
// "mark paid" flow stays available.
export async function settleScheduledCycleForCardCredit(
  ctx: MutationCtx,
  args: {
    userId: string;
    incomingTransactionId: Id<'transactions'>;
  },
) {
  const incoming = await ctx.db.get('transactions', args.incomingTransactionId);
  if (!incoming || incoming.userId !== args.userId) {
    return null;
  }

  const account = await ctx.db.get('financialAccounts', incoming.accountId);
  if (!account || account.userId !== args.userId || account.accountType !== 'CARD') {
    return null;
  }

  if (!incoming.transferMatchId) {
    return null;
  }

  const transferMatch = await ctx.db.get('transferMatches', incoming.transferMatchId);
  if (!transferMatch || transferMatch.userId !== args.userId || transferMatch.status !== 'confirmed') {
    return null;
  }

  const outgoing = await ctx.db.get('transactions', transferMatch.outgoingTransactionId);
  if (!outgoing || outgoing.userId !== args.userId || outgoing.direction !== 'DBIT') {
    return null;
  }

  const facilities = await ctx.db
    .query('creditFacilities')
    .withIndex('by_linkedAccountId', (q) => q.eq('linkedAccountId', account._id))
    .take(20);

  let bestCycle: {
    cycleId: Id<'creditFacilityUsageCycles'>;
    amountDeltaMinor: bigint;
    dateDeltaDays: number;
    dueDate: string;
  } | null = null;
  for (const facility of facilities) {
    if (facility.userId !== args.userId || facility.facilityType !== 'cardCreditLine' || facility.status !== 'active') {
      continue;
    }
    if (facility.settlementAccountId && facility.settlementAccountId !== outgoing.accountId) {
      continue;
    }

    const scheduledCycles = await ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_creditFacilityId_and_status', (q) =>
        q.eq('creditFacilityId', facility._id).eq('status', 'scheduled'),
      )
      .take(20);
    for (const cycle of scheduledCycles) {
      if (!statementCycleMatchesPayment(cycle, incoming)) {
        continue;
      }

      const amountDeltaMinor = absoluteMinorUnits(cycle.trackedAmount.amountMinor - incoming.amount.amountMinor);
      const dateDeltaDays = daysBetween(cycle.dueDate, incoming.bookingDate);

      if (
        bestCycle &&
        (bestCycle.amountDeltaMinor < amountDeltaMinor ||
          (bestCycle.amountDeltaMinor === amountDeltaMinor && bestCycle.dateDeltaDays < dateDeltaDays) ||
          (bestCycle.amountDeltaMinor === amountDeltaMinor &&
            bestCycle.dateDeltaDays === dateDeltaDays &&
            bestCycle.dueDate < cycle.dueDate) ||
          (bestCycle.amountDeltaMinor === amountDeltaMinor &&
            bestCycle.dateDeltaDays === dateDeltaDays &&
            bestCycle.dueDate === cycle.dueDate &&
            bestCycle.cycleId.localeCompare(cycle._id) <= 0))
      ) {
        continue;
      }

      bestCycle = { cycleId: cycle._id, amountDeltaMinor, dateDeltaDays, dueDate: cycle.dueDate };
    }
  }

  if (!bestCycle) {
    return null;
  }

  const now = Date.now();
  await ctx.db.patch('creditFacilityUsageCycles', bestCycle.cycleId, {
    status: 'paid',
    transactionId: incoming._id,
    paidAtMs: now,
    updatedAtMs: now,
  });

  return bestCycle.cycleId;
}

function isoDateOffset(date: string, offsetDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

async function reconcileSyntheticCardStatementLegCore(
  ctx: MutationCtx,
  syntheticTransactionId: Id<'transactions'>,
) {
  const synthetic = await ctx.db.get('transactions', syntheticTransactionId);
  if (!synthetic || !isSyntheticCardStatementLeg(synthetic) || !synthetic.transferMatchId) {
    return 'gone' as const;
  }

  const account = await ctx.db.get('financialAccounts', synthetic.accountId);
  if (!account || account.userId !== synthetic.userId || account.provider === 'manual') {
    return 'gone' as const;
  }

  const transferMatch = await ctx.db.get('transferMatches', synthetic.transferMatchId);
  if (
    !transferMatch ||
    transferMatch.userId !== synthetic.userId ||
    transferMatch.status !== 'confirmed' ||
    transferMatch.incomingTransactionId !== synthetic._id
  ) {
    return 'gone' as const;
  }

  const possibleReplacements = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
      q
        .eq('userId', synthetic.userId)
        .eq('accountId', synthetic.accountId)
        .gte('bookingDate', isoDateOffset(synthetic.bookingDate, -PROVIDER_REPLACEMENT_DAY_DELTA))
        .lte('bookingDate', isoDateOffset(synthetic.bookingDate, PROVIDER_REPLACEMENT_DAY_DELTA)),
    )
    .take(100);
  const replacements = possibleReplacements
    .filter(
      (candidate) =>
        candidate._id !== synthetic._id &&
        candidate.provider === account.provider &&
        candidate.status === 'BOOK' &&
        candidate.direction === 'CRDT' &&
        candidate.amount.currency === synthetic.amount.currency &&
        candidate.amount.amountMinor === synthetic.amount.amountMinor &&
        !candidate.transferMatchId &&
        !isSyntheticCardStatementLeg(candidate),
    )
    .sort(
      (left, right) =>
        daysBetween(left.bookingDate, synthetic.bookingDate) - daysBetween(right.bookingDate, synthetic.bookingDate) ||
        left._creationTime - right._creationTime,
    );
  // Never guess between two same-amount credits (for example, a refund next
  // to the real settlement). The marker keeps the synthetic leg visible and a
  // later retry can reconcile once the provider data becomes unambiguous.
  if (replacements.length !== 1) {
    return 'waiting' as const;
  }
  const replacement = replacements[0];

  const linkedCycles = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', synthetic._id))
    .take(5);
  const now = Date.now();
  await ctx.db.patch('transferMatches', transferMatch._id, {
    incomingTransactionId: replacement._id,
    updatedAtMs: now,
  });
  await ctx.db.patch('transactions', replacement._id, {
    classificationKind: 'transfer',
    classificationSource: 'system',
    classificationConfidence: 1,
    transferMatchId: transferMatch._id,
    updatedAtMs: now,
  });
  for (const cycle of linkedCycles) {
    if (cycle.userId !== synthetic.userId) {
      continue;
    }
    await ctx.db.patch('creditFacilityUsageCycles', cycle._id, {
      transactionId: replacement._id,
      updatedAtMs: now,
    });
  }
  await ctx.db.delete('transactions', synthetic._id);
  await invalidatePlanSnapshots(ctx, synthetic.userId, [synthetic.bookingDate, replacement.bookingDate]);
  return 'reconciled' as const;
}

export async function scheduleSyntheticCardStatementReconciliation(
  ctx: MutationCtx,
  syntheticTransactionId: Id<'transactions'>,
) {
  await ctx.scheduler.runAfter(
    5 * 60 * 1_000,
    internal.banking.cardStatementSettlement.reconcileSyntheticCardStatementLeg,
    { syntheticTransactionId, attempt: 0 },
  );
}

export const reconcileSyntheticCardStatementLeg = internalMutation({
  args: {
    syntheticTransactionId: v.id('transactions'),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await reconcileSyntheticCardStatementLegCore(ctx, args.syntheticTransactionId);
    if (result !== 'waiting' || args.attempt >= PROVIDER_RECONCILIATION_ATTEMPTS - 1) {
      return result;
    }

    const delayMs = args.attempt < 8 ? SIX_HOURS_MS : ONE_DAY_MS;
    await ctx.scheduler.runAfter(delayMs, internal.banking.cardStatementSettlement.reconcileSyntheticCardStatementLeg, {
      syntheticTransactionId: args.syntheticTransactionId,
      attempt: args.attempt + 1,
    });
    return result;
  },
});
