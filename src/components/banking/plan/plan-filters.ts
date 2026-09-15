import type { PlanBucket } from './types';

/**
 * YNAB calls these "focused views": the grid stays the same, the row set narrows to the question
 * you are answering right now. `hidden` is the only view that shows hidden buckets, so hiding a
 * bucket never loses it.
 */
export const PLAN_FILTERS = ['all', 'underfunded', 'overspent', 'snoozed', 'available', 'hidden'] as const;

export type PlanFilter = (typeof PLAN_FILTERS)[number];

export const PLAN_FILTER_LABEL_KEYS = {
  all: 'plan.filter.all',
  underfunded: 'plan.filter.underfunded',
  overspent: 'plan.filter.overspent',
  snoozed: 'plan.filter.snoozed',
  available: 'plan.filter.available',
  hidden: 'plan.filter.hidden',
} as const satisfies Record<PlanFilter, string>;

type FilterableBucket = Pick<PlanBucket, 'availableMinor' | 'hidden' | 'snoozed' | 'underfundedMinor'>;

export function matchesPlanFilter(bucket: FilterableBucket, filter: PlanFilter) {
  if (filter === 'hidden') return bucket.hidden;
  if (bucket.hidden) return false;
  switch (filter) {
    case 'underfunded':
      // A snoozed target is a deliberate "not this month", so it does not belong to the work list.
      return bucket.underfundedMinor > 0n && !bucket.snoozed;
    case 'overspent':
      return bucket.availableMinor < 0n;
    case 'snoozed':
      return bucket.snoozed;
    case 'available':
      return bucket.availableMinor > 0n;
    default:
      return true;
  }
}
