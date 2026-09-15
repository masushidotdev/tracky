import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { decimalNumberToMinorUnits } from '../../lib/money';
import { computePayoffPlan } from '../proactive/debtPayoffCore';
import { moneyToMajor } from '../format';
import { analystFunctionRefs } from '../functionRefs';
import type { Tool } from 'ai';

function compactSchedule(schedule: ReturnType<typeof computePayoffPlan>['schedule'], currency: string) {
  const rows = schedule.length <= 120
    ? schedule
    : schedule.filter((row, index) => index === 0 || row.month % 12 === 0 || index === schedule.length - 1);
  return rows.map((row) => ({
    month: row.month,
    openingBalance: moneyToMajor({ amountMinor: row.openingBalanceMinor, currency }).amount,
    interest: moneyToMajor({ amountMinor: row.interestMinor, currency }).amount,
    paid: moneyToMajor({ amountMinor: row.paidMinor, currency }).amount,
    closingBalance: moneyToMajor({ amountMinor: row.closingBalanceMinor, currency }).amount,
    targetDebtId: row.targetDebtId,
  }));
}

export const compareDebtPayoff: Tool = createTool({
  description: 'Simulate a bounded debt payoff plan using avalanche or snowball, within one explicit currency.',
  inputSchema: z.object({
    strategy: z.enum(['avalanche', 'snowball']),
    extraPayment: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
    maxMonths: z.number().int().min(1).max(600).default(600),
  }),
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    const debtInput = await ctx.runQuery(analystFunctionRefs.debtInputsForUser, {
      userId: ctx.userId,
      currency: input.currency?.toUpperCase(),
    });
    if (debtInput.requiresCurrency) {
      return { requiresCurrency: true, currencies: debtInput.currencies, message: 'Choose one currency.' };
    }
    const currency = debtInput.currency ?? input.currency?.toUpperCase();
    if (!currency) return { requiresCurrency: false, currencies: [], message: 'No active installment debt found.' };
    const plan = computePayoffPlan({
      debts: debtInput.debts,
      extraPaymentMinor: decimalNumberToMinorUnits(input.extraPayment, currency),
      strategy: input.strategy,
      maxMonths: input.maxMonths,
    });
    return {
      requiresCurrency: false,
      strategy: plan.strategy,
      currency: plan.currency,
      months: plan.months,
      totalInterest: moneyToMajor({ amountMinor: plan.totalInterestMinor, currency }).amount,
      totalPaid: moneyToMajor({ amountMinor: plan.totalPaidMinor, currency }).amount,
      payoffByDebt: plan.payoffByDebt.map((debt) => ({
        id: debt.id,
        name: debt.name,
        payoffMonth: debt.payoffMonth,
        interestAccrued: moneyToMajor({ amountMinor: debt.interestAccruedMinor, currency }).amount,
        totalPaid: moneyToMajor({ amountMinor: debt.totalPaidMinor, currency }).amount,
      })),
      schedule: compactSchedule(plan.schedule, currency),
      scheduleMode: plan.schedule.length <= 120 ? 'monthly' : 'annualCheckpoints',
      warnings: plan.warnings,
    };
  },
});
