// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
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
