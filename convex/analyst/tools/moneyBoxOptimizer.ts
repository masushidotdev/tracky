import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { decimalNumberToMinorUnits } from '../../lib/money';
import { moneyToMajor } from '../format';
import { analystFunctionRefs } from '../functionRefs';
import { optimizeMoneyBoxFunding } from '../moneyBoxOptimizerCore';
import type { Tool } from 'ai';

export const optimizeMoneyBoxesInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  availableMonthlyAmount: z.number().finite().positive(),
  priorityNames: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export const optimizeMoneyBoxes: Tool = createTool({
  description: 'Build a deterministic read-only allocation plan for active money boxes in one currency.',
  inputSchema: optimizeMoneyBoxesInputSchema,
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    const rows = await ctx.runQuery(analystFunctionRefs.moneyBoxOptimizationInputsForUser, {
      userId: ctx.userId,
      currency: input.currency,
    });
    const availableMinor = decimalNumberToMinorUnits(input.availableMonthlyAmount, input.currency);
    const result = optimizeMoneyBoxFunding({
      moneyBoxes: rows.moneyBoxes,
      currency: input.currency,
      availableMinor,
      priorityNames: input.priorityNames,
    });
    return {
      currency: input.currency,
      allocations: result.allocations.map((row) => ({
        name: row.name,
        targetDate: row.targetDate,
        fundingStatus: row.fundingStatus,
        allocation: moneyToMajor({ amountMinor: row.allocationMinor, currency: row.currency }).amount,
        monthlyRequired: moneyToMajor({ amountMinor: row.monthlyRequiredMinor, currency: row.currency }).amount,
        remaining: moneyToMajor({ amountMinor: row.remainingMinor, currency: row.currency }).amount,
        shortfall: moneyToMajor({ amountMinor: row.shortfallMinor, currency: row.currency }).amount,
      })),
      unallocated: moneyToMajor({ amountMinor: result.unallocatedMinor, currency: input.currency }).amount,
      shortfall: moneyToMajor({ amountMinor: result.shortfallMinor, currency: input.currency }).amount,
      warnings:
        rows.excludedCurrencies.length > 0
          ? [`Excluded money boxes in other currencies: ${rows.excludedCurrencies.join(', ')}`]
          : [],
    };
  },
});
