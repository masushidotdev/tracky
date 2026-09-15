import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { components } from '../_generated/api';
import type { PlanTier } from '../lib/entitlements';

export function dailyLimitNameForTier(tier: PlanTier): 'analystDailyFree' | 'analystDailyPro' {
  return tier === 'pro' ? 'analystDailyPro' : 'analystDailyFree';
}

export const analystRateLimiter = new RateLimiter(components.rateLimiter, {
  analystDailyFree: { kind: 'fixed window', period: 24 * HOUR, rate: 20 },
  analystDailyPro: { kind: 'fixed window', period: 24 * HOUR, rate: 100 },
  analystBurst: { kind: 'token bucket', rate: 6, period: MINUTE, capacity: 6 },
  telegramIngressDaily: { kind: 'fixed window', period: 24 * HOUR, rate: 200 },
  telegramIngressBurst: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 20 },
});
