import { describe, expect, test } from 'vitest';
import { enableBankingOperationalErrorMessage } from './banking/enableBankingErrors';

describe('Enable Banking operational errors', () => {
  test('explains credential mismatches', () => {
    const message = enableBankingOperationalErrorMessage(401, {
      message: 'Wrong signature',
      code: 401,
    });

    expect(message).toContain('Wrong signature');
    expect(message).toContain('app id and private key do not match');
  });

  test('explains inactive applications', () => {
    const message = enableBankingOperationalErrorMessage(403, {
      message: 'Application is not active',
    });

    expect(message).toContain('not active');
    expect(message).toContain('Control Panel');
  });

  test('explains restricted linked-account access', () => {
    const message = enableBankingOperationalErrorMessage(403, {
      message: 'Account is not linked to this restricted application',
    });

    expect(message).toContain('restricted Enable Banking app');
    expect(message).toContain('Control Panel');
  });

  test('explains provider rate limits', () => {
    const message = enableBankingOperationalErrorMessage(429, {
      error: 'ASPSP_RATE_LIMIT_EXCEEDED',
    });

    expect(message).toContain('rate limit');
    expect(message).toContain('scheduled backoff');
  });

  test('explains expired consent', () => {
    const message = enableBankingOperationalErrorMessage(401, {
      code: 'CONSENT_EXPIRED',
      message: 'Consent expired',
    });

    expect(message).toContain('Reconnect the bank account');
  });
});
