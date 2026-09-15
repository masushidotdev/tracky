import { describe, expect, test } from 'vitest';
import {
  RATE_SCALE,
  applyMonthlyRate,
  monthlyRateScaled,
  multiplyScaled,
  roundedDivide,
} from './projectionMath';

describe('projection math', () => {
  test('rounds halves away from zero for positive and negative values', () => {
    expect(roundedDivide(5n, 2n)).toBe(3n);
    expect(roundedDivide(-5n, 2n)).toBe(-3n);
    expect(roundedDivide(4n, 2n)).toBe(2n);
    expect(multiplyScaled(-15n, 500n, 1_000n)).toBe(-8n);
  });

  test('converts zero, 100%, and tiny annual rates to scaled monthly rates', () => {
    expect(monthlyRateScaled(0)).toBe(0n);
    expect(monthlyRateScaled(100)).toBeGreaterThan(59_000_000_000n);
    expect(monthlyRateScaled(100)).toBeLessThan(60_000_000_000n);
    expect(monthlyRateScaled(0.000001)).toBe(833n);
  });

  test('compounds the monthly rate back to the annual identity within rounding tolerance', () => {
    const initialMinor = 1_000_000_000n;
    let doubledMinor = initialMinor;
    const monthlyRate = monthlyRateScaled(100);

    for (let month = 0; month < 12; month += 1) {
      doubledMinor = applyMonthlyRate(doubledMinor, monthlyRate);
    }

    expect(doubledMinor).toBeGreaterThanOrEqual(2n * initialMinor - 12n);
    expect(doubledMinor).toBeLessThanOrEqual(2n * initialMinor + 12n);
    expect(applyMonthlyRate(initialMinor, 0n)).toBe(initialMinor);
    expect(RATE_SCALE).toBe(1_000_000_000_000n);
  });
});
