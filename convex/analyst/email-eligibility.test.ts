import { describe, expect, test } from 'vitest';
import { isMonthlyReportEmailEligible } from './emailEligibility';

describe('monthly report email eligibility', () => {
  test('requires an active profile with a present and explicitly verified email', () => {
    expect(isMonthlyReportEmailEligible(null)).toBe(false);
    expect(isMonthlyReportEmailEligible({ status: 'active', email: 'user@example.com' })).toBe(false);
    expect(isMonthlyReportEmailEligible({ status: 'active', email: 'user@example.com', emailVerified: false })).toBe(false);
    expect(isMonthlyReportEmailEligible({ status: 'active', email: '   ', emailVerified: true })).toBe(false);
    expect(isMonthlyReportEmailEligible({ status: 'deleted', email: 'user@example.com', emailVerified: true })).toBe(false);
    expect(isMonthlyReportEmailEligible({ status: 'active', email: 'user@example.com', emailVerified: true })).toBe(true);
  });
});
