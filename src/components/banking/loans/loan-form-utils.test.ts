import { describe, expect, test } from 'vitest';

import { parsePercentageToBasisPoints } from './loan-form-utils';

describe('parsePercentageToBasisPoints', () => {
  test('parses a decimal comma', () => {
    expect(parsePercentageToBasisPoints('3,7')).toBe(370);
  });

  test('parses a decimal point', () => {
    expect(parsePercentageToBasisPoints('6.25')).toBe(625);
  });

  // The separator comes from the input, never from the interface language. Reading it from the
  // locale meant an Italian typing a comma into the English interface got 37% instead of 3,7%,
  // silently, in the same dialog whose balance field read that keystroke as a decimal.
  test('reads the comma as decimal whatever the interface language', () => {
    expect(parsePercentageToBasisPoints('3,7')).toBe(parsePercentageToBasisPoints('3.7'));
  });

  test('drops a thousands separator before the decimal one', () => {
    expect(parsePercentageToBasisPoints('1.234,5')).toBe(123450);
    expect(parsePercentageToBasisPoints('1,234.5')).toBe(123450);
  });

  test('rounds sub-basis-point precision', () => {
    expect(parsePercentageToBasisPoints('3,705')).toBe(371);
  });

  test('rejects negative and malformed rates', () => {
    expect(() => parsePercentageToBasisPoints('-1,5')).toThrow();
    expect(() => parsePercentageToBasisPoints('three')).toThrow();
  });
});
