// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { getPlanWithProgress, getSpendingByCategory, listTransactions, normalizeOptionalId } from './read';

async function executeWithQuerySpy(
  tool: typeof getSpendingByCategory | typeof listTransactions,
  input: Record<string, unknown>,
  queryResult: unknown,
) {
  const calls: Array<Record<string, unknown>> = [];
  const execute = tool.execute;
  if (!execute) throw new Error('Expected executable tool');
  await execute.call(
    {
      ...tool,
      ctx: {
        userId: 'user-1',
        runQuery: (_reference: unknown, args: Record<string, unknown>) => {
          calls.push(args);
          return Promise.resolve(queryResult);
        },
      },
    },
    input,
    { toolCallId: 'call-1', messages: [] },
  );
  return calls.at(0);
}

async function executePlanTool(queryResult: unknown) {
  const execute = getPlanWithProgress.execute;
  if (!execute) throw new Error('Expected executable tool');
  return await execute.call(
    {
      ...getPlanWithProgress,
      ctx: {
        userId: 'user-1',
        runQuery: () => Promise.resolve(queryResult),
      },
    },
    { period: '2026-07' },
    { toolCallId: 'call-plan', messages: [] },
  );
}

describe('Analyst read tool input normalization', () => {
  test('drops empty optional IDs before Convex argument validation', () => {
    expect(normalizeOptionalId('')).toBeUndefined();
    expect(normalizeOptionalId('   ')).toBeUndefined();
  });

  test('trims and retains non-empty optional IDs', () => {
    expect(normalizeOptionalId('  account-id  ')).toBe('account-id');
  });

  test('omits empty IDs from spending and transaction query arguments', async () => {
    const spendingArgs = await executeWithQuerySpy(
      getSpendingByCategory,
      { accountId: '', monthsBack: 3, period: '2026-07' },
      [],
    );
    const transactionArgs = await executeWithQuerySpy(
      listTransactions,
      { accountId: ' ', categoryId: '', limit: 50, cursor: null },
      { page: [], isDone: true, continueCursor: '' },
    );

    expect(spendingArgs).not.toHaveProperty('accountId');
    expect(transactionArgs).not.toHaveProperty('accountId');
    expect(transactionArgs).not.toHaveProperty('categoryId');
  });

  test('formats signed Plan progress amounts in major units', async () => {
    const output = await executePlanTool({
      plan: { id: 'plan-1', name: 'Household', currency: 'EUR' },
      period: '2026-07',
      readyToAssignMinor: 42_500n,
      totals: {
        assignedMinor: 10_000n,
        activityMinor: -2_500n,
        availableMinor: 7_500n,
        neededMinor: 12_000n,
        underfundedMinor: 2_000n,
      },
      buckets: [
        {
          bucketId: 'bucket-1',
          name: 'Groceries',
          hidden: false,
          groupId: 'group-1',
          groupName: 'Everyday',
          assignedMinor: 10_000n,
          activityMinor: -2_500n,
          availableMinor: 7_500n,
          neededMinor: 12_000n,
          underfundedMinor: 2_000n,
          snoozed: false,
          status: 'underfunded',
        },
      ],
      truncated: false,
    });

    expect(output).toEqual({
      period: '2026-07',
      plan: { id: 'plan-1', name: 'Household', currency: 'EUR' },
      readyToAssign: 425,
      totals: { assigned: 100, activity: -25, available: 75, targetNeed: 120, underfunded: 20 },
      buckets: [
        {
          id: 'bucket-1',
          name: 'Groceries',
          hidden: false,
          groupId: 'group-1',
          groupName: 'Everyday',
          assigned: 100,
          activity: -25,
          available: 75,
          targetNeed: 120,
          underfunded: 20,
          snoozed: false,
          status: 'underfunded',
        },
      ],
      truncated: false,
    });
  });
});
