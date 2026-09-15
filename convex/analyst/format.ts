import { minorUnitFactor } from '../lib/money';

export type MinorMoney = {
  amountMinor: bigint;
  currency: string;
};

export type MajorMoney = {
  amount: number;
  currency: string;
};

export function moneyToMajor(money: MinorMoney): MajorMoney {
  return {
    amount: Number(money.amountMinor) / Number(minorUnitFactor(money.currency)),
    currency: money.currency,
  };
}

export function formatForTool(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(formatForTool);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.amountMinor === 'bigint' && typeof record.currency === 'string') {
      return moneyToMajor({ amountMinor: record.amountMinor, currency: record.currency });
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, formatForTool(item)]));
  }
  return typeof value === 'bigint' ? Number(value) : value;
}
