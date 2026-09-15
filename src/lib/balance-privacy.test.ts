import { describe, expect, test } from 'vitest';

import {
  BALANCE_PRIVACY_COOKIE,
  balancePrivacyCookie,
  parseBalancePrivacyValue,
  readBalancePrivacyCookie,
  serializeBalancePrivacyValue,
} from './balance-privacy';

describe('balance privacy preference', () => {
  test('only the stored truthy value hides balances', () => {
    expect(parseBalancePrivacyValue('1')).toBe(true);
    expect(parseBalancePrivacyValue('0')).toBe(false);
    expect(parseBalancePrivacyValue(null)).toBe(false);
    expect(parseBalancePrivacyValue(undefined)).toBe(false);
    expect(parseBalancePrivacyValue('true')).toBe(false);
  });

  test('serialization round-trips through the parser', () => {
    expect(parseBalancePrivacyValue(serializeBalancePrivacyValue(true))).toBe(true);
    expect(parseBalancePrivacyValue(serializeBalancePrivacyValue(false))).toBe(false);
  });

  test('reads the preference from a cookie header with other cookies around it', () => {
    expect(readBalancePrivacyCookie(`theme=dark; ${BALANCE_PRIVACY_COOKIE}=1; other=x`)).toBe(true);
    expect(readBalancePrivacyCookie(`${BALANCE_PRIVACY_COOKIE}=0`)).toBe(false);
    expect(readBalancePrivacyCookie('theme=dark')).toBe(false);
    expect(readBalancePrivacyCookie('')).toBe(false);
    expect(readBalancePrivacyCookie(undefined)).toBe(false);
  });

  test('does not confuse a cookie whose name ends with the preference name', () => {
    expect(readBalancePrivacyCookie(`legacy.tracky.balancesHidden=1`)).toBe(false);
  });

  test('tolerates malformed cookie segments', () => {
    expect(readBalancePrivacyCookie(`broken; ${BALANCE_PRIVACY_COOKIE}=1`)).toBe(true);
  });

  test('writes a rooted, year-long, same-site cookie', () => {
    const cookie = balancePrivacyCookie(true);

    expect(cookie).toContain(`${BALANCE_PRIVACY_COOKIE}=1`);
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('max-age=31536000');
    expect(cookie).toContain('samesite=lax');
    expect(balancePrivacyCookie(false)).toContain(`${BALANCE_PRIVACY_COOKIE}=0`);
  });
});
