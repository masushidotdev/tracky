import { describe, expect, test } from 'vitest';
import { accountGroupForType, normalizeAccountType } from './lib/accountTypes';

describe('account type taxonomy', () => {
  test('normalizes provider account types', () => {
    expect(normalizeAccountType('  cacc ')).toBe('CACC');
    expect(normalizeAccountType('')).toBeUndefined();
    expect(normalizeAccountType(null)).toBeUndefined();
  });

  test.each([
    ['CACC', 'cash'],
    ['SVGS', 'cash'],
    ['CASH', 'cash'],
    ['CARD', 'credit'],
    [' card ', 'credit'],
    ['INVS', 'asset'],
    ['ASST', 'asset'],
    ['unknown', 'cash'],
    [undefined, 'cash'],
  ] as const)('groups %s accounts as %s', (accountType, expectedGroup) => {
    expect(accountGroupForType(accountType)).toBe(expectedGroup);
  });
});
