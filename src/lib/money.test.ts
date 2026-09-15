import { describe, expect, it } from 'vitest';

import { fundedProgressPercent } from './money';

function eur(amountMinor: bigint) {
  return { amountMinor, currency: 'EUR' };
}

describe('fundedProgressPercent', () => {
  it('reports unfunded spending as fully over instead of dividing by one minor unit', () => {
    // The Plan makes this the normal case, not an edge case: a bucket you have not assigned to yet
    // is funded 0, and the old fallback denominator turned 587,19 € of spending into 5.871.900%.
    expect(fundedProgressPercent(eur(58_719n), eur(0n))).toBe(100);
    expect(fundedProgressPercent(eur(0n), eur(0n))).toBe(0);
  });

  it('treats a negative funded amount like no funding at all', () => {
    expect(fundedProgressPercent(eur(1_000n), eur(-5_000n))).toBe(100);
  });

  it('computes the ordinary ratio when money was funded', () => {
    expect(fundedProgressPercent(eur(2_500n), eur(10_000n))).toBe(25);
    expect(fundedProgressPercent(eur(10_000n), eur(10_000n))).toBe(100);
    expect(fundedProgressPercent(eur(15_000n), eur(10_000n))).toBe(150);
  });
});
