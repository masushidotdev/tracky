import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { minorUnitFactor } from '../../lib/money';
import { projectForecast } from '../../forecast/forecastCore';
import {
  PERCENT_SCALE,
  RATE_SCALE,
  monthEndIso,
  multiplyScaled,
  percentScaled,
  ratioPct,
  roundedDivide,
} from '../../forecast/projectionMath';
import { moneyToMajor } from '../format';
import { analystFunctionRefs } from '../functionRefs';
import type { ForecastLifeEvent } from '../../forecast/forecastCore';
import type { ToolCtx } from '@convex-dev/agent';
import type { Tool } from 'ai';

const optionalAnnualRate = z.number().finite().gt(-100).optional();
const optionalMajorAmount = z.number().finite().nonnegative().optional();
const CASH_ACCOUNT_ID = 'analyst:cash';
const INVESTMENT_ACCOUNT_ID = 'analyst:investment';

export const longTermProjectionInputSchema = z.object({
  horizonYears: z.number().int().min(1).max(50).default(30),
  incomeGrowthAnnualPct: optionalAnnualRate,
  expenseInflationAnnualPct: optionalAnnualRate,
  investmentReturnAnnualPct: optionalAnnualRate,
  surplusInvestedPct: z.number().finite().min(0).max(100).optional(),
  liquidBufferMonths: z.number().finite().nonnegative().optional(),
  swrPct: z.number().finite().positive().optional(),
  fireTargetMajor: optionalMajorAmount,
  monthlyIncomeMajor: optionalMajorAmount,
  monthlyExpensesMajor: optionalMajorAmount,
  initialLiquidMajor: optionalMajorAmount,
  initialInvestedMajor: optionalMajorAmount,
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  oneOffEvents: z
    .array(
      z.object({
        monthIndex: z.number().int().nonnegative(),
        amountMajor: z.number().finite().nonnegative(),
        kind: z.enum(['income', 'expense']),
      }),
    )
    .optional(),
  retirementAtMonthIndex: z.number().int().nonnegative().optional(),
});

type LongTermProjectionInput = z.infer<typeof longTermProjectionInputSchema>;
type LongTermProjectionGate = (ctx: ToolCtx) => Promise<boolean>;

type NormalizedAdapterAssumptions = {
  horizonYears: number;
  initialLiquidMinor: bigint;
  initialInvestedMinor: bigint;
  monthlyIncomeMinor: bigint;
  monthlyExpensesMinor: bigint;
  incomeGrowthAnnualPct: number;
  expenseInflationAnnualPct: number;
  investmentReturnAnnualPct: number;
  surplusInvestedPct: number;
  liquidBufferMonths: number;
  swrPct: number;
  fireTargetMinor: bigint;
  oneOffEvents: Array<{ monthIndex: number; amountMinor: bigint; kind: 'income' | 'expense' }>;
  retirementAtMonthIndex?: number;
};

function majorToMinor(amountMajor: number, currency: string) {
  return BigInt(Math.round(amountMajor * Number(minorUnitFactor(currency))));
}

function amountToMajor(amountMinor: bigint, currency: string) {
  return moneyToMajor({ amountMinor, currency }).amount;
}

function amountDividedByPercent(value: bigint, pct: number) {
  return roundedDivide(value * 100n * PERCENT_SCALE, percentScaled(pct));
}

function accountBalance(accounts: ReadonlyArray<{ id: string; endBalanceMinor: bigint }>, accountId: string) {
  return accounts.find((account) => account.id === accountId)?.endBalanceMinor ?? 0n;
}

function monthIndexForDate(startDate: string, date: string) {
  const startYear = Number(startDate.slice(0, 4));
  const startMonth = Number(startDate.slice(5, 7));
  const endYear = Number(date.slice(0, 4));
  const endMonth = Number(date.slice(5, 7));
  return (endYear - startYear) * 12 + endMonth - startMonth;
}

function normalizeAssumptions(
  input: LongTermProjectionInput,
  baseline: {
    liquidMinor: bigint;
    investedMinor: bigint;
    monthlyIncomeMinor: bigint;
    monthlyExpensesMinor: bigint;
  },
  currency: string,
): NormalizedAdapterAssumptions {
  const monthlyExpensesMinor =
    input.monthlyExpensesMajor === undefined
      ? baseline.monthlyExpensesMinor
      : majorToMinor(input.monthlyExpensesMajor, currency);
  const swrPct = input.swrPct ?? 4;
  return {
    horizonYears: input.horizonYears,
    initialLiquidMinor:
      input.initialLiquidMajor === undefined ? baseline.liquidMinor : majorToMinor(input.initialLiquidMajor, currency),
    initialInvestedMinor:
      input.initialInvestedMajor === undefined
        ? baseline.investedMinor
        : majorToMinor(input.initialInvestedMajor, currency),
    monthlyIncomeMinor:
      input.monthlyIncomeMajor === undefined
        ? baseline.monthlyIncomeMinor
        : majorToMinor(input.monthlyIncomeMajor, currency),
    monthlyExpensesMinor,
    incomeGrowthAnnualPct: input.incomeGrowthAnnualPct ?? 0,
    expenseInflationAnnualPct: input.expenseInflationAnnualPct ?? 2,
    investmentReturnAnnualPct: input.investmentReturnAnnualPct ?? 5,
    surplusInvestedPct: input.surplusInvestedPct ?? 100,
    liquidBufferMonths: input.liquidBufferMonths ?? 3,
    swrPct,
    fireTargetMinor:
      input.fireTargetMajor === undefined
        ? amountDividedByPercent(monthlyExpensesMinor * 12n, swrPct)
        : majorToMinor(input.fireTargetMajor, currency),
    oneOffEvents: (input.oneOffEvents ?? []).map((event) => ({
      monthIndex: event.monthIndex,
      amountMinor: majorToMinor(event.amountMajor, currency),
      kind: event.kind,
    })),
    retirementAtMonthIndex: input.retirementAtMonthIndex,
  };
}

function adapterEvents(
  assumptions: NormalizedAdapterAssumptions,
  startDate: string,
  birthYear: number,
): Array<ForecastLifeEvent> {
  const events: Array<ForecastLifeEvent> = assumptions.oneOffEvents.map((event) => ({
    kind: event.kind === 'income' ? 'otherIncome' : 'otherExpense',
    startYear: Number(monthEndIso(startDate, event.monthIndex).slice(0, 4)),
    amountMinor: event.amountMinor,
  }));
  if (assumptions.retirementAtMonthIndex !== undefined) {
    const retirementYear = Number(monthEndIso(startDate, assumptions.retirementAtMonthIndex).slice(0, 4));
    events.push({
      kind: 'retirement',
      age: retirementYear - birthYear,
      expensePct: 100,
      incomeReductionPct: 100,
    });
  }
  return events;
}

export async function isLongTermProjectionAllowed(ctx: ToolCtx): Promise<boolean> {
  if (!ctx.userId) return false;
  const entitlements = await ctx.runQuery(analystFunctionRefs.entitlementsForUser, { userId: ctx.userId });
  return entitlements.features['analyst.longTermProjection'];
}

export async function executeLongTermProjection(
  ctx: ToolCtx,
  input: LongTermProjectionInput,
  options: { isAllowed?: LongTermProjectionGate } = {},
) {
  if (!ctx.userId) throw new Error('Unauthorized');
  const isAllowed = options.isAllowed ?? isLongTermProjectionAllowed;
  if (!(await isAllowed(ctx))) {
    return { upgradeRequired: true as const, feature: 'analyst.longTermProjection' as const };
  }

  const baseline = await ctx.runQuery(analystFunctionRefs.longTermBaselineForUser, {
    userId: ctx.userId,
    currency: input.currency?.toUpperCase(),
  });
  const currency = baseline.currency.toUpperCase();
  const assumptions = normalizeAssumptions(input, baseline, currency);
  const startDate = new Date().toISOString().slice(0, 10);
  const startYear = Number(startDate.slice(0, 4));
  // Synthetic age keeps the requested horizon exact; the legacy tool has no birth-year input.
  const currentAge = 40;
  const birthYear = startYear - currentAge;
  const cashPct = 100 - assumptions.surplusInvestedPct;
  const result = projectForecast(
    {
      currency,
      birthYear,
      endAge: currentAge + assumptions.horizonYears,
      inflationAnnualPct: assumptions.expenseInflationAnnualPct,
      accounts: [
        {
          id: CASH_ACCOUNT_ID,
          kind: 'cash',
          currency,
          balanceMinor: assumptions.initialLiquidMinor,
          growthAnnualPct: 0,
        },
        {
          id: INVESTMENT_ACCOUNT_ID,
          kind: 'investment',
          currency,
          balanceMinor: assumptions.initialInvestedMinor,
          growthAnnualPct: assumptions.investmentReturnAnnualPct,
        },
      ],
      incomeSources: [
        {
          id: 'analyst:income',
          name: 'Income',
          currency,
          monthlyMinor: assumptions.monthlyIncomeMinor,
          change: { mode: 'customPct', annualPct: assumptions.incomeGrowthAnnualPct },
        },
      ],
      livingExpenses: {
        currency,
        monthlyMinor: assumptions.monthlyExpensesMinor,
        change: { mode: 'customPct', annualPct: assumptions.expenseInflationAnnualPct },
      },
      extraSavings: {
        growthAnnualPct: assumptions.investmentReturnAnnualPct,
        // Splits cascade over the remainder, so this produces the exact requested invested share.
        splits: [
          { accountId: CASH_ACCOUNT_ID, pct: cashPct },
          { accountId: INVESTMENT_ACCOUNT_ID, pct: 100 },
        ],
      },
      withdrawal: { capitalGainsTaxPct: 0 },
      events: adapterEvents(assumptions, startDate, birthYear),
    },
    { startDate },
  );

  let fireDate: string | null = null;
  let fireReachedMonthIndex: number | null = null;
  const yearly = result.yearly.map((checkpoint, index) => {
    const inflatedFireTargetMinor = multiplyScaled(assumptions.fireTargetMinor, checkpoint.deflatorScaled, RATE_SCALE);
    if (fireDate === null && checkpoint.netWorthMinor >= inflatedFireTargetMinor) {
      fireDate = checkpoint.date;
      fireReachedMonthIndex = monthIndexForDate(startDate, checkpoint.date);
    }
    const annualSavingsMinor = checkpoint.annualSavingsMinor;
    return {
      yearIndex: index + 1,
      date: checkpoint.date,
      liquid: amountToMajor(accountBalance(checkpoint.accounts, CASH_ACCOUNT_ID), currency),
      invested: amountToMajor(accountBalance(checkpoint.accounts, INVESTMENT_ACCOUNT_ID), currency),
      netWorth: amountToMajor(checkpoint.netWorthMinor, currency),
      annualIncome: amountToMajor(checkpoint.annualIncomeMinor, currency),
      annualExpenses: amountToMajor(checkpoint.annualExpensesMinor, currency),
      annualSavings: amountToMajor(annualSavingsMinor, currency),
      savingsRatePct:
        checkpoint.annualIncomeMinor > 0n ? ratioPct(annualSavingsMinor, checkpoint.annualIncomeMinor) : 0,
      fireProgressPct: ratioPct(checkpoint.netWorthMinor, inflatedFireTargetMinor),
    };
  });

  return {
    upgradeRequired: false as const,
    currency,
    yearly,
    fireDate,
    fireReachedMonthIndex,
    depletedMonthIndex: result.depletedMonthIndex ?? null,
    finalNetWorth: amountToMajor(result.finalNetWorthMinor, currency),
    assumptions: {
      currency,
      horizonYears: assumptions.horizonYears,
      initialLiquid: amountToMajor(assumptions.initialLiquidMinor, currency),
      initialInvested: amountToMajor(assumptions.initialInvestedMinor, currency),
      monthlyIncome: amountToMajor(assumptions.monthlyIncomeMinor, currency),
      monthlyExpenses: amountToMajor(assumptions.monthlyExpensesMinor, currency),
      incomeGrowthAnnualPct: assumptions.incomeGrowthAnnualPct,
      expenseInflationAnnualPct: assumptions.expenseInflationAnnualPct,
      investmentReturnAnnualPct: assumptions.investmentReturnAnnualPct,
      surplusInvestedPct: assumptions.surplusInvestedPct,
      liquidBufferMonths: assumptions.liquidBufferMonths,
      swrPct: assumptions.swrPct,
      fireTarget: amountToMajor(assumptions.fireTargetMinor, currency),
      oneOffEvents: assumptions.oneOffEvents.map((event) => ({
        monthIndex: event.monthIndex,
        amount: amountToMajor(event.amountMinor, currency),
        kind: event.kind,
      })),
      retirementAtMonthIndex: assumptions.retirementAtMonthIndex ?? null,
    },
  };
}

export const longTermProjection: Tool = createTool({
  description:
    "Project long-term wealth and FIRE timing from the user baseline and explicit overrides. Uses the shared forecast engine; the liquid-buffer input is echoed but approximated by routing the non-invested surplus share to cash, and month-indexed one-off or retirement inputs are applied in the corresponding calendar year's event bucket.",
  inputSchema: longTermProjectionInputSchema,
  execute: (ctx, input) => executeLongTermProjection(ctx, input),
});
