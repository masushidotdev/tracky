// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import { resolvePlanBucketByName } from '../writes';
import {
  moneyBoxInputSchema,
  planAssignedInputSchema,
  planTargetInputSchema,
  plannedExpenseInputSchema,
  setPlanAssigned,
  setPlanTarget,
} from './write';

vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID ??= 'client_test';
  process.env.WORKOS_API_KEY ??= 'sk_test';
  process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';
});

describe('analyst write tool money validation', () => {
  test('validates Plan assignment and target amounts with uppercase currency codes', () => {
    expect(
      planAssignedInputSchema.safeParse({ bucketName: 'Food', amount: { amount: 0, currency: 'EUR' } }).success,
    ).toBe(true);
    expect(
      planTargetInputSchema.safeParse({
        bucketName: 'Food',
        cadence: 'monthly',
        amount: { amount: 0, currency: 'EUR' },
      }).success,
    ).toBe(false);
    expect(
      plannedExpenseInputSchema.safeParse({
        name: 'Rent',
        amount: { amount: 100, currency: 'eur' },
        dueDate: '2026-08-01',
      }).success,
    ).toBe(false);
  });

  test('allows zero saved money but requires it to use the target currency', () => {
    expect(
      moneyBoxInputSchema.safeParse({
        name: 'Holiday',
        targetAmount: { amount: 1000, currency: 'EUR' },
        savedAmount: { amount: 0, currency: 'EUR' },
        targetDate: '2027-01-01',
        accountName: 'Main account',
      }).success,
    ).toBe(true);
    expect(
      moneyBoxInputSchema.safeParse({
        name: 'Holiday',
        targetAmount: { amount: 1000, currency: 'EUR' },
        savedAmount: { amount: 10, currency: 'USD' },
        targetDate: '2027-01-01',
      }).success,
    ).toBe(false);
  });

  test('requires approval for both Plan write tools', async () => {
    const assignedApproval =
      typeof setPlanAssigned.needsApproval === 'function'
        ? await setPlanAssigned.needsApproval(
            { bucketName: 'Food', amount: { amount: 100, currency: 'EUR' } },
            { toolCallId: 'assigned', messages: [] },
          )
        : setPlanAssigned.needsApproval;
    const targetApproval =
      typeof setPlanTarget.needsApproval === 'function'
        ? await setPlanTarget.needsApproval({
            bucketName: 'Food',
            cadence: 'monthly',
            behaviour: 'setAside',
            amount: { amount: 100, currency: 'EUR' },
            repeats: true,
          }, { toolCallId: 'target', messages: [] })
        : setPlanTarget.needsApproval;
    expect(assignedApproval).toBe(true);
    expect(targetApproval).toBe(true);
  });

  test('refuses unknown and ambiguous active-Plan bucket names', () => {
    const buckets = [{ name: 'Groceries' }, { name: 'Rent' }, { name: ' groceries ' }];
    expect(() => resolvePlanBucketByName(buckets, 'Utilities')).toThrow('Plan bucket "Utilities" was not found');
    expect(() => resolvePlanBucketByName(buckets, 'Groceries')).toThrow('Plan bucket name "Groceries" is ambiguous');
    expect(resolvePlanBucketByName(buckets.slice(0, 2), ' rent ')).toEqual({ name: 'Rent' });
  });
});
