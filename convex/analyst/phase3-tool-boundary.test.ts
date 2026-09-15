// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { analystProactiveTools, analystTools } from './tools';
import { rememberFact } from './tools/memory';
import { bulkRecategorize, bulkRecategorizeInputSchema } from './tools/write';

describe('Phase 3 Analyst tool boundary', () => {
  test('keeps memory and bulk writes approval-gated and interactive-only', () => {
    expect((rememberFact.needsApproval as (input: unknown, options: unknown) => boolean)({}, {})).toBe(true);
    expect((bulkRecategorize.needsApproval as (input: unknown, options: unknown) => boolean)({}, {})).toBe(true);
    expect(analystTools).toHaveProperty('rememberFact');
    expect(analystTools).toHaveProperty('bulkRecategorize');
    expect(analystProactiveTools).not.toHaveProperty('rememberFact');
    expect(analystProactiveTools).not.toHaveProperty('bulkRecategorize');
  });

  test('exposes safe-to-spend in interactive and proactive read toolsets', () => {
    expect(analystTools).toHaveProperty('getSafeToSpend');
    expect(analystProactiveTools).toHaveProperty('getSafeToSpend');
  });

  test('rejects empty, duplicate, and more than 50 recategorizations', () => {
    expect(bulkRecategorizeInputSchema.safeParse({ changes: [] }).success).toBe(false);
    const duplicate = {
      transactionId: 'tx_1',
      classificationKind: 'expense' as const,
      categoryName: 'Food',
    };
    expect(bulkRecategorizeInputSchema.safeParse({ changes: [duplicate, duplicate] }).success).toBe(false);
    expect(
      bulkRecategorizeInputSchema.safeParse({
        changes: Array.from({ length: 51 }, (_, index) => ({
          transactionId: `tx_${index}`,
          classificationKind: 'expense',
        })),
      }).success,
    ).toBe(false);
  });
});
