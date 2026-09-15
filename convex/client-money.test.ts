// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  currencyFractionDigits,
  formatMoney,
  moneyFromMajor,
  moneyInputValue,
  parseMoneyMinor,
} from '../src/lib/money';

describe('client money formatting', () => {
  test('uses ISO currency fraction digits for zero, two, and three digit currencies', () => {
    expect(currencyFractionDigits('JPY')).toBe(0);
    expect(currencyFractionDigits('EUR')).toBe(2);
    expect(currencyFractionDigits('KWD')).toBe(3);
    expect(moneyFromMajor(12.345, 'KWD').amountMinor).toBe(12345n);
    expect(moneyFromMajor(123, 'JPY').amountMinor).toBe(123n);
  });

  test('formats stored minor units with the currency-specific factor', () => {
    expect(formatMoney({ amountMinor: 12345n, currency: 'KWD' }, 'en-US')).toContain('12.345');
    expect(formatMoney({ amountMinor: 123n, currency: 'JPY' }, 'en-US')).toContain('123');
  });

  test('parses and prepares inputs using each currency exponent', () => {
    expect(parseMoneyMinor('123', 'JPY')).toBe(123n);
    expect(parseMoneyMinor('12,345', 'KWD')).toBe(12345n);
    expect(parseMoneyMinor('1.234,56', 'EUR')).toBe(123456n);
    expect(parseMoneyMinor('1.2346', 'KWD')).toBe(1235n);
    expect(moneyInputValue({ amountMinor: 12345n, currency: 'KWD' })).toBe('12.345');
    expect(moneyInputValue({ amountMinor: 123n, currency: 'JPY' })).toBe('123');
  });
});
