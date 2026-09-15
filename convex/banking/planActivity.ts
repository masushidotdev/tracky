import { absoluteMinorUnits } from '../lib/money';
import type { Doc } from '../_generated/dataModel';

type PlanActivityTransaction = Pick<
  Doc<'transactions'>,
  'amount' | 'classificationKind' | 'direction' | 'status' | 'transferMatchId'
>;

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

export function periodStartDate(period: string) {
  return `${period}-01`;
}

// `period` carries a 1-based month while Date.UTC expects a 0-based index, so passing it
// through already lands on the first day of the FOLLOWING month. Adding another month here
// is the bug that made Plan alerts count two months of transactions.
export function periodEndDate(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function isPlanActivityEligible(transaction: PlanActivityTransaction, options: { currency: string }) {
  if (
    transaction.status !== 'BOOK' ||
    transaction.transferMatchId ||
    transaction.amount.currency !== options.currency
  ) {
    return false;
  }

  // Transfers and internal movements are not spending. Income is the plan's funding side
  // (YNAB's "Ready to Assign"), never category activity — otherwise a salary would silently
  // offset assigned spending. An inflow only counts as activity once it belongs to a spending
  // category, which is what makes a refund reduce what was spent.
  if (
    transaction.classificationKind === 'transfer' ||
    transaction.classificationKind === 'internal' ||
    transaction.classificationKind === 'income'
  ) {
    return false;
  }

  return (
    transaction.direction === 'DBIT' ||
    transaction.classificationKind === 'expense' ||
    transaction.classificationKind === 'subscription'
  );
}

export function signedActivityMinor(transaction: Pick<PlanActivityTransaction, 'amount' | 'direction'>) {
  const amountMinor = absoluteMinorUnits(transaction.amount.amountMinor);
  return transaction.direction === 'CRDT' ? amountMinor : -amountMinor;
}
