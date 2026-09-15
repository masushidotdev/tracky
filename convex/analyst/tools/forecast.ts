import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { monthEndIso } from '../../forecast/projectionMath';
import { moneyToMajor } from '../format';
import { analystFunctionRefs } from '../functionRefs';
import { isLongTermProjectionAllowed } from './longTermProjection';
import type { ForecastResult } from '../../forecast/forecastCore';
import type { ToolCtx } from '@convex-dev/agent';
import type { Tool } from 'ai';

const MAX_YEARLY_ROWS = 50;

export const forecastInputSchema = z.object({});

type ForecastGate = (ctx: ToolCtx) => Promise<boolean>;

function amountToMajor(amountMinor: bigint, currency: string) {
  return moneyToMajor({ amountMinor, currency }).amount;
}

function compactYearly(yearly: ForecastResult['yearly']) {
  if (yearly.length <= MAX_YEARLY_ROWS) return yearly;
  const indexes = Array.from({ length: MAX_YEARLY_ROWS }, (_, index) =>
    Math.round((index * (yearly.length - 1)) / (MAX_YEARLY_ROWS - 1)),
  );
  return indexes.map((index) => yearly[index]);
}

function assumptionsToMajor(value: unknown, currency: string): unknown {
  if (Array.isArray(value)) return value.map((item) => assumptionsToMajor(item, currency));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (key.endsWith('Minor') && typeof item === 'bigint') {
        return [key.slice(0, -'Minor'.length), amountToMajor(item, currency)];
      }
      return [key, assumptionsToMajor(item, currency)];
    }),
  );
}

export async function executeGetForecast(
  ctx: ToolCtx,
  _input: z.infer<typeof forecastInputSchema>,
  options: { isAllowed?: ForecastGate } = {},
) {
  if (!ctx.userId) throw new Error('Unauthorized');
  const isAllowed = options.isAllowed ?? isLongTermProjectionAllowed;
  if (!(await isAllowed(ctx))) {
    return {
      upgradeRequired: true as const,
      needsOnboarding: false as const,
      feature: 'analyst.longTermProjection' as const,
      message: 'Forecast analysis is available on the Pro plan.',
    };
  }

  const result = await ctx.runQuery(analystFunctionRefs.forecastProjectionForUser, { userId: ctx.userId });
  if ('upgradeRequired' in result) {
    return {
      upgradeRequired: true as const,
      needsOnboarding: false as const,
      feature: 'forecast.scenarios' as const,
      message: 'Forecast scenarios are available on the Pro plan.',
    };
  }
  if ('needsOnboarding' in result) {
    return {
      upgradeRequired: false as const,
      needsOnboarding: true as const,
      message: 'Set up Forecast in the app first so I can analyze your active scenario.',
    };
  }

  const currency = result.scenario.currency.toUpperCase();
  const yearly = compactYearly(result.projection.yearly);
  const startDate = new Date().toISOString().slice(0, 10);
  return {
    upgradeRequired: false as const,
    needsOnboarding: false as const,
    scenario: {
      id: result.scenario.id,
      name: result.scenario.name,
      currency,
      endAge: result.scenario.endAge,
    },
    yearly: yearly.map((checkpoint) => ({
      calendarYear: checkpoint.calendarYear,
      age: checkpoint.age,
      date: checkpoint.date,
      netWorth: amountToMajor(checkpoint.netWorthMinor, currency),
      annualIncome: amountToMajor(checkpoint.annualIncomeMinor, currency),
      annualExpenses: amountToMajor(checkpoint.annualExpensesMinor, currency),
      annualSavings: amountToMajor(checkpoint.annualSavingsMinor, currency),
    })),
    yearlyRowsTotal: result.projection.yearly.length,
    yearlyRowsReturned: yearly.length,
    events: result.events,
    depletionYear:
      result.projection.depletedMonthIndex === undefined
        ? null
        : Number(monthEndIso(startDate, result.projection.depletedMonthIndex).slice(0, 4)),
    assumptions: assumptionsToMajor(result.projection.assumptions, currency),
    notices: {
      excludedAccounts: result.excludedAccounts.map(({ name, reason }) => ({ name, reason })),
      excludedFacilities: result.excludedFacilities.map(({ name, reason }) => ({ name, reason })),
      invalidEvents: result.invalidEvents.map(({ reason }) => reason),
    },
  };
}

export const getForecast: Tool = createTool({
  description:
    "Read the user's active saved forecast scenario and return a compact year-by-year net-worth summary, life events, depletion timing, and assumptions.",
  inputSchema: forecastInputSchema,
  execute: (ctx, input) => executeGetForecast(ctx, input),
});
