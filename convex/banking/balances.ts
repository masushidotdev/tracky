import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type BalanceKind = 'available' | 'booked' | 'expected' | 'other';

const BOOKED_PRIORITY: Record<BalanceKind, number> = {
  booked: 0,
  available: 1,
  expected: 2,
  other: 3,
};

// A provider writes every balance of a fetch in one go, so the newest snapshot is a handful of rows
// at most (one provider returns two rows, another three). Ten covers it without paging the whole history in.
const LATEST_SNAPSHOT_LOOKBACK = 10;

type BalanceReadCtx = QueryCtx | MutationCtx;

export function balanceKind(
  balance: Pick<Doc<'accountBalances'>, 'balanceType' | 'balanceName'>,
): BalanceKind {
  const type = balance.balanceType.toLowerCase().replace(/[^a-z0-9]/g, '');
  let kind: BalanceKind;

  if (type.includes('interimavailable') || type.includes('available')) {
    kind = 'available';
  } else if (type.includes('closingbooked') || type.includes('booked')) {
    kind = 'booked';
  } else if (type.includes('expected') || type.includes('interim')) {
    kind = 'expected';
  } else {
    kind = 'other';
  }

  if (kind === 'available' || kind === 'booked' || !balance.balanceName) {
    return kind;
  }

  // Some providers type every balance as XPCD; only the provider name
  // distinguishes the available balance from the booked accounting position.
  if (/disponib|available|spendable/i.test(balance.balanceName)) {
    return 'available';
  }

  if (/contabil|booked|accounting/i.test(balance.balanceName)) {
    return 'booked';
  }

  return kind;
}

/**
 * The accounting position of an account — the money that is actually on it. This is the single
 * balance the app stores against an account: an arranged overdraft is modelled as a
 * `creditFacilities` row, and spendable money is derived as booked + limit by `availableBalance`.
 * Reading the provider's own spendable row here would fold the limit into the balance and make
 * every later derivation count it twice.
 *
 * Ties on kind are the normal case, not the exception: one observed provider reports the accounting position
 * and the spendable one as two `XPCD` rows that share a fetch, a type and the name
 * "Expected balance", identical in every field but the amount. The amount is therefore the only
 * discriminator the payload leaves us, and it is a sound one: spendable = booked + limit, so the
 * accounting position is never the larger of the two.
 */
export function preferredBookedBalance(balances: Array<Doc<'accountBalances'>>) {
  if (balances.length === 0) {
    return undefined;
  }

  const latestFetchedAtMs = balances.reduce(
    (latest, balance) => Math.max(latest, balance.fetchedAtMs),
    balances[0].fetchedAtMs,
  );
  const latestSnapshot = balances.filter((balance) => balance.fetchedAtMs === latestFetchedAtMs);

  // A manual account has no provider fetch: its snapshots are a synthetic ledger, one row per
  // write, and `fetchedAtMs` is just the wall clock. Two writes in the same millisecond therefore
  // share a snapshot, and the newest row — not the smallest — is the current balance. Ranking
  // those by amount read a card as still owing its settled statement.
  if (latestSnapshot.every((balance) => balance.provider === 'manual')) {
    return latestSnapshot.reduce((newest, balance) =>
      balance._creationTime > newest._creationTime ? balance : newest,
    );
  }

  let preferred = latestSnapshot[0];

  for (const balance of latestSnapshot.slice(1)) {
    const preferredPriority = BOOKED_PRIORITY[balanceKind(preferred)];
    const candidatePriority = BOOKED_PRIORITY[balanceKind(balance)];
    if (candidatePriority < preferredPriority) {
      preferred = balance;
      continue;
    }
    if (candidatePriority > preferredPriority) continue;

    const candidateMinor = balance.amount.amountMinor;
    const preferredMinor = preferred.amount.amountMinor;
    if (candidateMinor === preferredMinor) {
      // Same kind, same amount: the choice cannot matter, so make it stable on provider order.
      if (balance._creationTime < preferred._creationTime) preferred = balance;
      continue;
    }
    if (candidateMinor < preferredMinor) {
      preferred = balance;
    }
  }

  return preferred;
}

export async function latestBookedBalance(ctx: BalanceReadCtx, accountId: Id<'financialAccounts'>) {
  const balances = await ctx.db
    .query('accountBalances')
    .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
    .order('desc')
    .take(LATEST_SNAPSHOT_LOOKBACK);

  return preferredBookedBalance(balances) ?? null;
}
