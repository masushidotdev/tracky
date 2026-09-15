import { describe, expect, it } from 'vitest';

import { PLAN_FILTERS, matchesPlanFilter } from './plan-filters';
import type { PlanFilter } from './plan-filters';

type Bucket = Parameters<typeof matchesPlanFilter>[0];

function bucket(overrides: Partial<Bucket> = {}): Bucket {
  return { availableMinor: 0n, hidden: false, snoozed: false, underfundedMinor: 0n, ...overrides };
}

function matching(candidates: Array<Bucket>, filter: PlanFilter) {
  return candidates.filter((candidate) => matchesPlanFilter(candidate, filter)).length;
}

describe('matchesPlanFilter', () => {
  it('keeps every visible bucket in the default view', () => {
    expect(matchesPlanFilter(bucket(), 'all')).toBe(true);
    expect(matchesPlanFilter(bucket({ availableMinor: -1_000n }), 'all')).toBe(true);
  });

  it('excludes hidden buckets from every view but the hidden one', () => {
    const hidden = bucket({ hidden: true, availableMinor: 5_000n, underfundedMinor: 2_000n, snoozed: true });
    for (const filter of PLAN_FILTERS) {
      expect(matchesPlanFilter(hidden, filter)).toBe(filter === 'hidden');
    }
  });

  it('treats a snoozed target as out of the underfunded work list', () => {
    const snoozed = bucket({ underfundedMinor: 2_000n, snoozed: true });
    expect(matchesPlanFilter(snoozed, 'underfunded')).toBe(false);
    expect(matchesPlanFilter(snoozed, 'snoozed')).toBe(true);
    expect(matchesPlanFilter(bucket({ underfundedMinor: 2_000n }), 'underfunded')).toBe(true);
  });

  it('separates overspent from money still available', () => {
    const candidates = [
      bucket({ availableMinor: -1n }),
      bucket({ availableMinor: 0n }),
      bucket({ availableMinor: 1n }),
    ];
    expect(matching(candidates, 'overspent')).toBe(1);
    expect(matching(candidates, 'available')).toBe(1);
  });
});
