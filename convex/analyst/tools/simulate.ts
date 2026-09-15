import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { minorUnitFactor } from '../../lib/money';
import { analystFunctionRefs } from '../functionRefs';
import { applyWhatIfScenario } from '../whatIfCore';
import type { Tool } from 'ai';

function addMonths(period: string, offset: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

type CashflowProjectionInput = {
  accounts: Array<{ latestBalance: { amount: { amountMinor: bigint; currency: string } } | null }>;
  upcomingItemsByAccount: Array<{
    accountId: string;
    items: Array<{
      key: string;
      dueDate: string;
      amount: { amountMinor: bigint; currency: string };
      direction: 'inflow' | 'outflow';
      occurrencePayment?: unknown;
    }>;
  }>;
};

export function monthlyBaselineFromFutureCashflow(
  input: CashflowProjectionInput,
  options: { startMonth: string; horizonMonths: number; currency: string },
) {
  const factor = Number(minorUnitFactor(options.currency));
  let projectedBalanceMinor = input.accounts.reduce(
    (total, row) =>
      row.latestBalance?.amount.currency === options.currency ? total + row.latestBalance.amount.amountMinor : total,
    0n,
  );
  const uniqueItems = new Map<string, CashflowProjectionInput['upcomingItemsByAccount'][number]['items'][number]>();
  for (const group of input.upcomingItemsByAccount) {
    for (const item of group.items) {
      if (!item.occurrencePayment && item.amount.currency === options.currency) {
        uniqueItems.set(item.key, item);
      }
    }
  }

  return Array.from({ length: options.horizonMonths }, (_, index) => {
    const month = addMonths(options.startMonth, index);
    const monthEnd = `${addMonths(month, 1)}-01`;
    let inflowMinor = 0n;
    let outflowMinor = 0n;
    for (const item of uniqueItems.values()) {
      if (item.dueDate < `${month}-01` || item.dueDate >= monthEnd) continue;
      if (item.direction === 'inflow') inflowMinor += item.amount.amountMinor;
      else outflowMinor += item.amount.amountMinor;
    }
    projectedBalanceMinor += inflowMinor - outflowMinor;
    return {
      month,
      inflow: Number(inflowMinor) / factor,
      outflow: Number(outflowMinor) / factor,
      projectedBalance: Number(projectedBalanceMinor) / factor,
    };
  });
}

const changeSchema = z.object({
  kind: z.enum(['addMonthlyExpense', 'removeMonthlyExpense', 'oneOffExpense', 'addMonthlyIncome', 'adjustBudget']),
  label: z.string(),
  amount: z.number().finite(),
  currency: z.string(),
  startDate: z.string().optional(),
  months: z.number().int().min(1).optional(),
});

export const simulateWhatIf: Tool = createTool({
  description: 'Compare the projected cashflow baseline with hypothetical income, expense, or budget changes.',
  inputSchema: z.object({
    changes: z.array(changeSchema).min(1),
    horizonMonths: z.number().int().min(1).max(12).default(6),
    currency: z.string(),
    asOfDate: z.string().optional(),
  }),
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    const asOfDate = (input.asOfDate ?? new Date().toISOString()).slice(0, 10);
    const startMonth = asOfDate.slice(0, 7);
    const horizonExclusive = new Date(`${addMonths(startMonth, input.horizonMonths)}-01T00:00:00.000Z`);
    horizonExclusive.setUTCDate(horizonExclusive.getUTCDate() - 1);
    const horizonDate = horizonExclusive.toISOString().slice(0, 10);
    const [cashflow, accounts] = await Promise.all([
      ctx.runQuery(analystFunctionRefs.getFutureCashflowForUser, {
        userId: ctx.userId,
        asOfDate,
        horizonDate,
        limit: 100,
      }),
      ctx.runQuery(analystFunctionRefs.accountsOverviewForUser, { userId: ctx.userId }),
    ]);
    const currency = input.currency.toUpperCase();
    const baseline = monthlyBaselineFromFutureCashflow(
      { accounts: accounts.accounts, upcomingItemsByAccount: cashflow.upcomingItemsByAccount },
      {
        startMonth,
        horizonMonths: input.horizonMonths,
        currency,
      },
    );
    return {
      currency,
      ...applyWhatIfScenario(
        baseline,
        input.changes.filter((change) => change.currency.toUpperCase() === currency),
        input.horizonMonths,
      ),
    };
  },
});
