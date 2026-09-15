import type { api } from '../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

export type MoneyBoxFundingPlan = FunctionReturnType<typeof api.banking.planning.listMoneyBoxFundingPlans>[number];
export type PayDownOverview = FunctionReturnType<typeof api.banking.payDown.getPayDownOverview>;
export type PayDownFacility = PayDownOverview['facilities'][number];
export type PayoffSimulation = FunctionReturnType<typeof api.banking.payDown.simulatePayoff>;
export type PayoffStrategy = PayoffSimulation['strategy'];

export function bigintToSafeNumber(value: bigint) {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) return Number.MAX_SAFE_INTEGER;
  if (value < -max) return -Number.MAX_SAFE_INTEGER;
  return Number(value);
}

export function simulationArgsEqual(
  left:
    | {
        extraMonthlyMinor: bigint;
        lumpSumMinor: bigint;
        strategy: PayoffStrategy;
      }
    | undefined,
  right: {
    extraMonthlyMinor: bigint;
    lumpSumMinor: bigint;
    strategy: PayoffStrategy;
  },
) {
  if (!left) return false;
  return (
    left.extraMonthlyMinor === right.extraMonthlyMinor &&
    left.lumpSumMinor === right.lumpSumMinor &&
    left.strategy === right.strategy
  );
}
