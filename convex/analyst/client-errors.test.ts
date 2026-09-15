// @vitest-environment node

import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';

import {
  clearAnalystDailyLimitReached,
  getAnalystDailyLimitReached,
  isAnalystDailyRateLimitError,
  isAnalystRateLimitError,
} from '../../src/components/banking/analyst/helpers';

describe('Analyst client errors', () => {
  test.each(['analystBurst', 'analystDailyFree', 'analystDailyPro'])('recognizes the structured %s Convex error', (name) => {
    const error = new ConvexError({ kind: 'RateLimited', name, retryAfter: 12_000 });

    expect(isAnalystRateLimitError(error)).toBe(true);
  });

  test.each(['analystDailyFree', 'analystDailyPro'])('recognizes the daily %s Convex error', (name) => {
    const error = new ConvexError({ kind: 'RateLimited', name, retryAfter: 12_000 });

    expect(isAnalystDailyRateLimitError(error)).toBe(true);
  });

  test('does not treat the burst limit as the daily limit', () => {
    const error = new ConvexError({ kind: 'RateLimited', name: 'analystBurst', retryAfter: 250 });

    expect(isAnalystDailyRateLimitError(error)).toBe(false);
  });

  test('publishes daily-limit state only for daily Analyst limits', () => {
    clearAnalystDailyLimitReached();
    expect(
      isAnalystRateLimitError(
        new ConvexError({ kind: 'RateLimited', name: 'analystDailyFree', retryAfter: 12_000 }),
      ),
    ).toBe(true);
    expect(getAnalystDailyLimitReached()).toBe(true);

    expect(
      isAnalystRateLimitError(new ConvexError({ kind: 'RateLimited', name: 'analystBurst', retryAfter: 250 })),
    ).toBe(true);
    expect(getAnalystDailyLimitReached()).toBe(false);
  });

  test('recognizes forwarded Convex error data without relying on class identity', () => {
    const forwardedAcrossRuntimeBoundary = {
      message: '[CONVEX M(analyst/chat:sendMessage)] Server Error',
      data: { kind: 'RateLimited', name: 'analystBurst', retryAfter: 250 },
    };

    expect(isAnalystRateLimitError(forwardedAcrossRuntimeBoundary)).toBe(true);
  });

  test('does not infer a rate limit from provider-like message text or malformed data', () => {
    expect(isAnalystRateLimitError(new Error('429 too many requests; retry after 30 seconds'))).toBe(false);
    expect(
      isAnalystRateLimitError({
        data: { kind: 'RateLimited', name: 'telegramIngressBurst', retryAfter: 250 },
      }),
    ).toBe(false);
    expect(
      isAnalystRateLimitError({ data: { kind: 'RateLimited', name: 'analystBurst', retryAfter: Number.NaN } }),
    ).toBe(false);
  });
});
