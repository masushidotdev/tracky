// Relative, not the `@/` alias: the Convex typecheck compiles the .ts files under src/ without the
// path aliases, and an unresolved import there stops `convex dev` from deploying the backend.
import type { Money } from '../../../lib/money';

/** Lives here rather than in the chart because it describes data, not a component. */
export type PlanProgressDatum = {
  id: string;
  name: string;
  spent: Money;
  funded: Money;
  remaining: Money;
};

export const DASHBOARD_PLAN_BUCKET_LIMIT = 8;

type DashboardPlanBucket = {
  bucketId: string;
  name: string;
  hidden: boolean;
  carryInMinor: bigint;
  assignedMinor: bigint;
  activityMinor: bigint;
  availableMinor: bigint;
  underfundedMinor: bigint;
};

function fundedMinor(bucket: DashboardPlanBucket) {
  return bucket.carryInMinor + bucket.assignedMinor;
}

function bucketRank(bucket: DashboardPlanBucket) {
  if (bucket.availableMinor < 0n) return 0;
  if (bucket.underfundedMinor > 0n) return 1;
  return 2;
}

export function dashboardPlanBuckets(
  buckets: ReadonlyArray<DashboardPlanBucket>,
  currency: string,
  limit = Number.POSITIVE_INFINITY,
): Array<PlanProgressDatum> {
  return buckets
    .filter((bucket) => !bucket.hidden)
    .toSorted((left, right) => {
      const rankDifference = bucketRank(left) - bucketRank(right);
      if (rankDifference !== 0) return rankDifference;

      const rank = bucketRank(left);
      if (rank === 0 && left.availableMinor !== right.availableMinor) {
        return left.availableMinor < right.availableMinor ? -1 : 1;
      }
      if (rank === 1 && left.underfundedMinor !== right.underfundedMinor) {
        return left.underfundedMinor > right.underfundedMinor ? -1 : 1;
      }

      const leftFunded = fundedMinor(left);
      const rightFunded = fundedMinor(right);
      if (leftFunded !== rightFunded) return leftFunded > rightFunded ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(0, limit))
    .map((bucket) => {
      const fundedAmountMinor = fundedMinor(bucket);
      return {
        id: bucket.bucketId,
        name: bucket.name,
        spent: {
          amountMinor: bucket.activityMinor < 0n ? -bucket.activityMinor : 0n,
          currency,
        },
        funded: { amountMinor: fundedAmountMinor, currency },
        remaining: { amountMinor: bucket.availableMinor, currency },
      };
    });
}
