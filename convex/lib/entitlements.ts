export type PlanTier = 'free' | 'pro';

type TierValues<TValue> = Record<PlanTier, TValue>;

export const FEATURES = {
  'analyst.longTermProjection': { free: false, pro: true },
  'forecast.scenarios': { free: false, pro: true },
  'plan.multiplePlans': { free: false, pro: true },
} as const satisfies Record<string, TierValues<boolean>>;

export type FeatureKey = keyof typeof FEATURES;

export const LIMITS = {
  analystDailyMessages: { free: 20, pro: 100 },
} as const satisfies Record<string, TierValues<number>>;

export type Entitlements = {
  tier: PlanTier;
  features: Record<FeatureKey, boolean>;
  limits: {
    analystDailyMessages: number;
  };
};

export function resolveTier(settings: { planTier?: PlanTier } | null | undefined): PlanTier {
  return settings?.planTier ?? 'free';
}

export function entitlementsForTier(tier: PlanTier): Entitlements {
  return {
    tier,
    features: {
      'analyst.longTermProjection': FEATURES['analyst.longTermProjection'][tier],
      'forecast.scenarios': FEATURES['forecast.scenarios'][tier],
      'plan.multiplePlans': FEATURES['plan.multiplePlans'][tier],
    },
    limits: {
      analystDailyMessages: LIMITS.analystDailyMessages[tier],
    },
  };
}
