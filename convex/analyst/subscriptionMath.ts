type Money = {
  amountMinor: bigint;
  currency: string;
};

export function monthlyEquivalent(amount: Money, interval: string, intervalCount: number): Money {
  const safeIntervalCount = Math.max(intervalCount, 1);
  const value = Number(amount.amountMinor);
  const monthlyAmount =
    interval === 'day'
      ? (value * 30.4375) / safeIntervalCount
      : interval === 'week'
        ? (value * 4.345) / safeIntervalCount
        : interval === 'year'
          ? value / (12 * safeIntervalCount)
          : value / safeIntervalCount;

  return {
    amountMinor: BigInt(Math.round(monthlyAmount)),
    currency: amount.currency,
  };
}
