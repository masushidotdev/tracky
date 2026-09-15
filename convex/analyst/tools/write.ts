import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { decimalNumberToMinorUnits } from '../../lib/money';
import { analystFunctionRefs } from '../functionRefs';
import type { Tool } from 'ai';
import type { Id } from '../../_generated/dataModel';

function requireUserId(userId: string | undefined) {
  if (!userId) throw new Error('Unauthorized');
  return userId;
}

const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter uppercase code');
const positiveMoneySchema = z.object({ amount: z.number().finite().positive(), currency: currencySchema });
const nonnegativeMoneySchema = z.object({ amount: z.number().finite().nonnegative(), currency: currencySchema });
const savedMoneySchema = nonnegativeMoneySchema;

export const planAssignedInputSchema = z.object({
  bucketName: z.string().trim().min(1),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  amount: nonnegativeMoneySchema,
});

export const planTargetInputSchema = z.object({
  bucketName: z.string().trim().min(1),
  cadence: z.enum(['weekly', 'monthly', 'yearly', 'custom']),
  behaviour: z.enum(['setAside', 'refill', 'balanceBy']).default('setAside'),
  amount: positiveMoneySchema,
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  repeats: z.boolean().default(true),
});

export const moneyBoxInputSchema = z
  .object({
    name: z.string().min(1),
    targetAmount: positiveMoneySchema,
    savedAmount: savedMoneySchema.optional(),
    targetDate: z.string(),
    accountName: z.string().min(1).optional(),
  })
  .refine((input) => !input.savedAmount || input.savedAmount.currency === input.targetAmount.currency, {
    message: 'Saved amount currency must match target amount currency',
    path: ['savedAmount', 'currency'],
  });

export const plannedExpenseInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  amount: positiveMoneySchema,
  direction: z.enum(['inflow', 'outflow']).default('outflow'),
  dueDate: z.string(),
  recurrenceInterval: z.enum(['day', 'week', 'month', 'year']).optional(),
  recurrenceIntervalCount: z.number().int().min(1).optional(),
  categoryName: z.string().optional(),
  createMoneyBox: z.boolean().optional(),
  accountName: z.string().min(1).optional(),
});

export const bulkRecategorizeInputSchema = z.object({
  changes: z
    .array(
      z.object({
        transactionId: z.string().min(1),
        classificationKind: z.enum(['income', 'expense', 'subscription', 'transfer', 'internal', 'uncategorized']),
        categoryName: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .min(1)
    .max(50)
    .refine((changes) => new Set(changes.map((change) => change.transactionId)).size === changes.length, {
      message: 'Duplicate transaction changes are not allowed',
    }),
});

export const setPlanAssigned: Tool = createTool({
  description: 'Set the assigned amount for one active-Plan bucket and month. Requires explicit user approval.',
  inputSchema: planAssignedInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    await ctx.runMutation(analystFunctionRefs.setPlanAssignedForAgent, {
      userId: requireUserId(ctx.userId),
      bucketName: input.bucketName,
      period: input.period,
      amount: {
        amountMinor: decimalNumberToMinorUnits(input.amount.amount, input.amount.currency),
        currency: input.amount.currency,
      },
    });
    return { ok: true, bucketName: input.bucketName, period: input.period };
  },
});

export const setPlanTarget: Tool = createTool({
  description: 'Create or update a target for one active-Plan bucket. Requires explicit user approval.',
  inputSchema: planTargetInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    await ctx.runMutation(analystFunctionRefs.setPlanTargetForAgent, {
      userId: requireUserId(ctx.userId),
      bucketName: input.bucketName,
      cadence: input.cadence,
      behaviour: input.behaviour,
      amount: {
        amountMinor: decimalNumberToMinorUnits(input.amount.amount, input.amount.currency),
        currency: input.amount.currency,
      },
      dueDate: input.dueDate,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      repeats: input.repeats,
    });
    return { ok: true, bucketName: input.bucketName, targetUpdated: true };
  },
});

export const createMoneyBox: Tool = createTool({
  description: 'Create a savings money box. Requires explicit user approval.',
  inputSchema: moneyBoxInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    const currency = input.targetAmount.currency.toUpperCase();
    await ctx.runMutation(analystFunctionRefs.createMoneyBoxForAgent, {
      userId: requireUserId(ctx.userId),
      name: input.name,
      targetAmount: { amountMinor: decimalNumberToMinorUnits(input.targetAmount.amount, currency), currency },
      savedAmount: input.savedAmount
        ? {
            amountMinor: decimalNumberToMinorUnits(input.savedAmount.amount, input.savedAmount.currency),
            currency: input.savedAmount.currency.toUpperCase(),
          }
        : undefined,
      targetDate: input.targetDate,
      accountName: input.accountName,
    });
    return { ok: true, name: input.name, created: true };
  },
});

export const createPlannedExpense: Tool = createTool({
  description: 'Create a planned expense or income, optionally recurring or backed by a money box. Requires approval.',
  inputSchema: plannedExpenseInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    const currency = input.amount.currency.toUpperCase();
    await ctx.runMutation(analystFunctionRefs.createPlannedExpenseForAgent, {
      userId: requireUserId(ctx.userId),
      ...input,
      amount: { amountMinor: decimalNumberToMinorUnits(input.amount.amount, currency), currency },
    });
    return { ok: true, name: input.name, created: true };
  },
});

export const bulkRecategorize: Tool = createTool({
  description: 'Recategorize up to 50 transactions atomically by classification and category name. Requires approval.',
  inputSchema: bulkRecategorizeInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    await ctx.runMutation(analystFunctionRefs.bulkRecategorizeForAgent, {
      userId: requireUserId(ctx.userId),
      changes: input.changes.map((change) => ({
        ...change,
        transactionId: change.transactionId as Id<'transactions'>,
      })),
    });
    return { ok: true, updatedCount: input.changes.length };
  },
});
