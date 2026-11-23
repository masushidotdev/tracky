// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ANALYTICS_CONSENT_EVENT,
  analyticsEvents,
  buildFirstBankAccountConnectedProps,
  buildFirstCsvImportCompletedProps,
  buildFirstPlanCreatedProps,
  buildFirstTransactionCreatedProps,
  countBucket,
  lengthBucket,
  normalizeRouteId,
  readConsent,
  sanitizeEventUrls,
  setAnalyticsConsent,
} from './events';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    register: vi.fn(),
    optedOut: () => false,
  },
}));

describe('normalizeRouteId', () => {
  test('static routes pass through', () => {
    expect(normalizeRouteId('/app/plan')).toBe('/app/plan');
    expect(normalizeRouteId('/')).toBe('/');
  });

  test('dynamic segments collapse to :id', () => {
    expect(normalizeRouteId('/app/loans/abc123')).toBe('/app/loans/:id');
    expect(normalizeRouteId('/app/accounts/xyz')).toBe('/app/accounts/:id');
    expect(normalizeRouteId('/app/docs/some-slug')).toBe('/app/docs/:id');
  });
});

describe('consent store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('unknown by default', () => {
    expect(readConsent()).toBe('unknown');
  });

  test('setAnalyticsConsent persists without env configured', () => {
    setAnalyticsConsent(true);
    expect(readConsent()).toBe('accepted');
    setAnalyticsConsent(false);
    expect(readConsent()).toBe('rejected');
  });

  test('setAnalyticsConsent notifies same-tab listeners', () => {
    const listener = vi.fn();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, listener);
    setAnalyticsConsent(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setAnalyticsConsent(false);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, listener);
  });
});

describe('buckets', () => {
  test('count buckets', () => {
    expect(countBucket(0)).toBe('1');
    expect(countBucket(5)).toBe('2-10');
    expect(countBucket(30)).toBe('11-50');
    expect(countBucket(500)).toBe('50+');
  });

  test('length buckets', () => {
    expect(lengthBucket(10)).toBe('0-50');
    expect(lengthBucket(100)).toBe('51-200');
    expect(lengthBucket(500)).toBe('201-1000');
    expect(lengthBucket(5000)).toBe('1000+');
  });
});

describe('sanitizeEventUrls', () => {
  test('rewrites SDK URL props to the normalized route id', () => {
    const event = {
      properties: {
        $current_url: 'https://app.trytracky.app/app/loans/abc123?x=1#y',
        $pathname: '/app/loans/abc123',
        $referrer: 'https://google.com/',
        $referring_domain: 'google.com',
        route_id: '/app/loans/:id',
      },
    };
    sanitizeEventUrls(event);
    expect(event.properties.$pathname).toBe('/app/loans/:id');
    expect(event.properties.$current_url).toBe('https://app.trytracky.app/app/loans/:id');
    expect(event.properties.$referrer).toBeUndefined();
    expect(event.properties.$referring_domain).toBeUndefined();
    expect(event.properties.route_id).toBe('/app/loans/:id');
  });

  test('drops URL props when no pathname is present', () => {
    const event: { properties: Record<string, unknown> } = {
      properties: { $current_url: 'https://example.com/', foo: 'bar' },
    };
    sanitizeEventUrls(event);
    expect(event.properties.$current_url).toBeUndefined();
    expect(event.properties.$pathname).toBeUndefined();
    expect(event.properties.foo).toBe('bar');
  });

  test('tolerates null events', () => {
    expect(sanitizeEventUrls(null)).toBeNull();
  });
});

const FORBIDDEN_PII_KEYS = [
  'amount',
  'amountMinor',
  'balance',
  'description',
  'accountName',
  'account_name',
  'name',
  'iban',
  'ibanMasked',
  'email',
  'note',
  'counterpartyName',
  'bankName',
  'aspspName',
  'userId',
  'rowCount',
] as const;

describe('onboarding first-time milestone events', () => {
  test('defines snake_case first-time event names while keeping existing recurring events', () => {
    expect(analyticsEvents.firstCsvImportCompleted).toBe('first_csv_import_completed');
    expect(analyticsEvents.firstPlanCreated).toBe('first_plan_created');
    expect(analyticsEvents.firstTransactionCreated).toBe('first_transaction_created');
    expect(analyticsEvents.firstBankAccountConnected).toBe('first_bank_account_connected');

    // Existing recurring events must remain untouched.
    expect(analyticsEvents.signupStarted).toBe('signup_started');
    expect(analyticsEvents.loginCompleted).toBe('login_completed');
    expect(analyticsEvents.manualAccountCreated).toBe('manual_account_created');
    expect(analyticsEvents.csvImportStarted).toBe('csv_import_started');
    expect(analyticsEvents.csvImportCompleted).toBe('csv_import_completed');
    expect(analyticsEvents.csvImportFailed).toBe('csv_import_failed');
    expect(analyticsEvents.bankConnectionStarted).toBe('bank_connection_started');
    expect(analyticsEvents.bankConnectionCompleted).toBe('bank_connection_completed');
    expect(analyticsEvents.bankConnectionFailed).toBe('bank_connection_failed');
    expect(analyticsEvents.planBucketCreated).toBe('plan_bucket_created');
  });

  test('first_csv_import_completed props contain only row_count_bucket and surface', () => {
    const props = buildFirstCsvImportCompletedProps(25);
    expect(props).toEqual({ row_count_bucket: '11-50', surface: 'import' });
    expect(Object.keys(props).sort()).toEqual(['row_count_bucket', 'surface']);
    for (const key of FORBIDDEN_PII_KEYS) {
      expect(props).not.toHaveProperty(key);
    }
  });

  test('first_plan_created props contain only surface', () => {
    const props = buildFirstPlanCreatedProps();
    expect(props).toEqual({ surface: 'plan' });
    expect(Object.keys(props)).toEqual(['surface']);
    for (const key of FORBIDDEN_PII_KEYS) {
      expect(props).not.toHaveProperty(key);
    }
  });

  test.each(['csv', 'manual', 'bank'] as const)(
    'first_transaction_created props contain only allowed source=%s',
    (source) => {
      const props = buildFirstTransactionCreatedProps(source);
      expect(props).toEqual({ source });
      expect(Object.keys(props)).toEqual(['source']);
      for (const key of FORBIDDEN_PII_KEYS) {
        expect(props).not.toHaveProperty(key);
      }
    },
  );

  test('first_bank_account_connected props contain only surface', () => {
    const props = buildFirstBankAccountConnectedProps();
    expect(props).toEqual({ surface: 'bank-connections' });
    expect(Object.keys(props)).toEqual(['surface']);
    for (const key of FORBIDDEN_PII_KEYS) {
      expect(props).not.toHaveProperty(key);
    }
  });
});
