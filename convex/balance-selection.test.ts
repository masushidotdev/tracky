import { describe, expect, test } from 'vitest';
import { balanceKind, preferredBookedBalance } from './banking/balances';
import type { Doc, Id } from './_generated/dataModel';

type BalanceInput = {
  amountMinor: bigint;
  balanceType: string;
  balanceName?: string;
  fetchedAtMs?: number;
  creationTime: number;
  provider?: Doc<'accountBalances'>['provider'];
};

function makeBalance(input: BalanceInput): Doc<'accountBalances'> {
  return {
    _id: `balance_${input.creationTime}` as Id<'accountBalances'>,
    _creationTime: input.creationTime,
    userId: 'user_test',
    accountId: 'account_test' as Id<'financialAccounts'>,
    providerConnectionId: 'connection_test' as Id<'providerConnections'>,
    provider: input.provider ?? 'mock',
    balanceType: input.balanceType,
    ...(input.balanceName ? { balanceName: input.balanceName } : {}),
    amount: { amountMinor: input.amountMinor, currency: 'EUR' },
    fetchedAtMs: input.fetchedAtMs ?? Date.UTC(2026, 6, 24),
  };
}

describe('balance selection', () => {
  test('reads the accounting position, not the overdraft-inflated one, when the bank labels both the same', () => {
    // The real provider payload: two XPCD rows, both named "Expected balance", same fetch, no
    // reference date. The pair differs by exactly the 3.000 EUR overdraft line, which the app
    // models as a credit facility and must never see folded into the balance itself.
    const booked = makeBalance({
      amountMinor: 62784n,
      balanceType: 'XPCD',
      balanceName: 'Expected balance',
      creationTime: 2,
    });
    const withOverdraft = makeBalance({
      amountMinor: 362784n,
      balanceType: 'XPCD',
      balanceName: 'Expected balance',
      creationTime: 1,
    });

    expect(preferredBookedBalance([booked, withOverdraft])).toBe(booked);
    expect(preferredBookedBalance([withOverdraft, booked])).toBe(booked);
  });

  test('reads the accounting position when the overdraft is drawn', () => {
    // Same account a day earlier: -2.997,16 booked against the same 3.000 EUR line leaves 2,84
    // spendable. Picking the larger row would report money the user does not own.
    const booked = makeBalance({
      amountMinor: -299716n,
      balanceType: 'XPCD',
      balanceName: 'Expected balance',
      creationTime: 2,
    });
    const withOverdraft = makeBalance({
      amountMinor: 284n,
      balanceType: 'XPCD',
      balanceName: 'Expected balance',
      creationTime: 1,
    });

    expect(preferredBookedBalance([booked, withOverdraft])).toBe(booked);
    expect(preferredBookedBalance([withOverdraft, booked])).toBe(booked);
  });

  test('distinguishes booked and available XPCD balances by provider name when there is one', () => {
    const booked = makeBalance({
      amountMinor: -299716n,
      balanceType: 'XPCD',
      balanceName: 'Saldo contabile',
      creationTime: 1,
    });
    const available = makeBalance({
      amountMinor: 284n,
      balanceType: 'XPCD',
      balanceName: 'Saldo disponibile',
      creationTime: 2,
    });

    expect(balanceKind(booked)).toBe('booked');
    expect(balanceKind(available)).toBe('available');
    expect(preferredBookedBalance([booked, available])).toBe(booked);
  });

  test('prefers a typed booked row over an available one even when it is the larger amount', () => {
    // Pending debits make the available balance the smaller of the two here, so the amount must
    // only ever break ties between rows of the same kind.
    const booked = makeBalance({
      amountMinor: 100000n,
      balanceType: 'closingBooked',
      creationTime: 1,
    });
    const available = makeBalance({
      amountMinor: 90000n,
      balanceType: 'interimAvailable',
      creationTime: 2,
    });

    expect(preferredBookedBalance([booked, available])).toBe(booked);
    expect(preferredBookedBalance([available, booked])).toBe(booked);
  });

  test('reads the CARD debt rather than the residual credit line', () => {
    const available = makeBalance({
      amountMinor: 170000n,
      balanceType: 'interimAvailable',
      creationTime: 1,
    });
    const booked = makeBalance({
      amountMinor: -80000n,
      balanceType: 'closingBooked',
      creationTime: 2,
    });

    expect(preferredBookedBalance([available, booked])).toBe(booked);
  });

  test('ignores snapshots older than the latest fetch', () => {
    const stale = makeBalance({
      amountMinor: 100n,
      balanceType: 'closingBooked',
      fetchedAtMs: Date.UTC(2026, 6, 23),
      creationTime: 1,
    });
    const latest = makeBalance({
      amountMinor: 500n,
      balanceType: 'closingBooked',
      fetchedAtMs: Date.UTC(2026, 6, 24),
      creationTime: 2,
    });

    expect(preferredBookedBalance([latest, stale])).toBe(latest);
  });

  test('reads the newest row of a manual ledger even when two writes share a millisecond', () => {
    // Manual accounts have no provider fetch: `fetchedAtMs` is the wall clock, so a settlement
    // written right after the movement it settles lands in the same snapshot. Ranking those by
    // amount left a card reading as if its statement had never been paid.
    const beforeSettlement = makeBalance({
      amountMinor: -203193n,
      balanceType: 'closingBooked',
      provider: 'manual',
      creationTime: 10,
    });
    const afterSettlement = makeBalance({
      amountMinor: 0n,
      balanceType: 'closingBooked',
      provider: 'manual',
      creationTime: 11,
    });

    expect(preferredBookedBalance([afterSettlement, beforeSettlement])).toBe(afterSettlement);
    expect(preferredBookedBalance([beforeSettlement, afterSettlement])).toBe(afterSettlement);
  });

  test('resolves equal kinds and equal amounts by the lowest creation time', () => {
    const later = makeBalance({
      amountMinor: 100n,
      balanceType: 'XPCD',
      creationTime: 20,
    });
    const earlier = makeBalance({
      amountMinor: 100n,
      balanceType: 'XPCD',
      creationTime: 10,
    });

    expect(preferredBookedBalance([later, earlier])).toBe(earlier);
    expect(preferredBookedBalance([earlier, later])).toBe(earlier);
  });
});
