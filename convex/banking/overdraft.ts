import { latestBookedBalance } from './balances';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

export type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

export function addMoneyAmounts(left: MoneyAmount, right: MoneyAmount) {
  if (left.currency !== right.currency) {
    return null;
  }

  return {
    amountMinor: left.amountMinor + right.amountMinor,
    currency: left.currency,
  };
}

export function availableBalance(booked: MoneyAmount, overdraftLimitAmount: MoneyAmount | undefined) {
  if (!overdraftLimitAmount) {
    return booked;
  }

  return addMoneyAmounts(booked, overdraftLimitAmount) ?? booked;
}

export function derivedOverdraftUsed(booked: MoneyAmount): MoneyAmount {
  return {
    amountMinor: booked.amountMinor < 0n ? -booked.amountMinor : 0n,
    currency: booked.currency,
  };
}

async function derivedUsedAmountFromLinkedAccount(
  ctx: QueryCtx,
  facility: Doc<'creditFacilities'>,
  linkedAccountId: Id<'financialAccounts'>,
): Promise<MoneyAmount | null> {
  const linkedAccount = await ctx.db.get('financialAccounts', linkedAccountId);
  if (linkedAccount?.userId !== facility.userId || linkedAccount.currency !== facility.limitAmount.currency) {
    return null;
  }

  const bookedBalance = await latestBookedBalance(ctx, linkedAccount._id);
  if (bookedBalance?.amount.currency !== facility.limitAmount.currency) {
    return null;
  }

  return derivedOverdraftUsed(bookedBalance.amount);
}

export async function effectiveOverdraftUsedAmount(
  ctx: QueryCtx,
  facility: Doc<'creditFacilities'>,
): Promise<MoneyAmount> {
  if (facility.facilityType !== 'accountOverdraft' || facility.status !== 'active' || !facility.linkedAccountId) {
    return facility.usedAmount;
  }

  return (await derivedUsedAmountFromLinkedAccount(ctx, facility, facility.linkedAccountId)) ?? facility.usedAmount;
}

// A card credit line linked to a CARD-type account (manual or imported) derives
// its usage from the card account's negative balance instead of manual input.
export async function linkedCardAccountForFacility(ctx: QueryCtx, facility: Doc<'creditFacilities'>) {
  if (facility.facilityType !== 'cardCreditLine' || facility.status !== 'active' || !facility.linkedAccountId) {
    return null;
  }

  const linkedAccount = await ctx.db.get('financialAccounts', facility.linkedAccountId);
  if (
    !linkedAccount ||
    linkedAccount.userId !== facility.userId ||
    linkedAccount.accountType !== 'CARD' ||
    linkedAccount.currency !== facility.limitAmount.currency
  ) {
    return null;
  }

  return linkedAccount;
}

export async function effectiveFacilityUsedAmount(
  ctx: QueryCtx,
  facility: Doc<'creditFacilities'>,
): Promise<{ usedAmount: MoneyAmount; usageDerived: boolean }> {
  if (facility.facilityType === 'accountOverdraft') {
    return { usedAmount: await effectiveOverdraftUsedAmount(ctx, facility), usageDerived: true };
  }

  const cardAccount = await linkedCardAccountForFacility(ctx, facility);
  if (cardAccount) {
    const derived = await derivedUsedAmountFromLinkedAccount(ctx, facility, cardAccount._id);
    if (derived) {
      return { usedAmount: derived, usageDerived: true };
    }
  }

  return { usedAmount: facility.usedAmount, usageDerived: false };
}

export async function overdraftLimitByAccount(ctx: QueryCtx, userId: string) {
  const [accounts, facilities] = await Promise.all([
    ctx.db
      .query('financialAccounts')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
      .take(200),
    ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
      .take(200),
  ]);
  const accountById = new Map(accounts.filter((account) => !account.hidden).map((account) => [account._id, account]));
  const limits = new Map<Id<'financialAccounts'>, MoneyAmount>();

  for (const facility of facilities) {
    if (facility.facilityType !== 'accountOverdraft' || !facility.linkedAccountId) {
      continue;
    }

    const account = accountById.get(facility.linkedAccountId);
    if (!account || account.currency !== facility.limitAmount.currency) {
      continue;
    }

    const existing = limits.get(account._id);
    limits.set(account._id, {
      amountMinor:
        (existing?.amountMinor ?? 0n) + (facility.limitAmount.amountMinor > 0n ? facility.limitAmount.amountMinor : 0n),
      currency: account.currency,
    });
  }

  return limits;
}
