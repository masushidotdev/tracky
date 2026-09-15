// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { PlanOverspendingBreakdown } from './plan-grid';
import { PlanHeader, PlanOverdraftNotice } from './plan-header';
import type { PlanMonth } from './types';
import { BalancePrivacyProvider } from '@/lib/balance-privacy-context';
import { I18nProvider } from '@/lib/i18n';

function render(element: React.ReactNode) {
  return renderToStaticMarkup(
    <I18nProvider>
      <BalancePrivacyProvider initialHidden={false}>{element}</BalancePrivacyProvider>
    </I18nProvider>,
  );
}

function renderHeader(overdraft: PlanMonth['overdraft']) {
  const month = {
    plan: {
      id: 'plan',
      name: 'Main plan',
      currency: 'EUR',
      expectedIncomeMinor: null,
    },
    period: '2026-07',
    readyToAssignMinor: -83_320n,
    liquidityMinor: -83_320n,
    overdraft,
    breakdown: {
      carryFromPreviousMonthMinor: 0n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    },
    totals: {
      assignedMinor: 0n,
      activityMinor: 0n,
      availableMinor: 0n,
      underfundedMinor: 0n,
      targetsMinor: 0n,
    },
    groups: [],
    unplanned: {},
    truncated: false,
  } as unknown as PlanMonth;

  return render(
    <PlanHeader
      accounts={[]}
      canGoPrevious={true}
      isRecalculating={false}
      month={month}
      onAutoAssign={() => undefined}
      onCurrentMonth={() => undefined}
      onNextMonth={() => undefined}
      onOverdraftTargetDateChange={() => undefined}
      onPreviousMonth={() => undefined}
      onRecalculate={() => undefined}
      overdraftTargetDatePending={false}
    />,
  );
}

describe('Plan overdraft visibility', () => {
  test('renders the overdrawn amount and remaining facility in the Plan header', () => {
    const markup = renderHeader({
      amountMinor: 83_320n,
      remainingFacilityMinor: 216_680n,
      progressMinor: 12_500n,
      targetDate: '2026-10-31',
      monthlyStepMinor: 27_774n,
    });

    expect(markup).toContain('data-slot="plan-overdraft-notice"');
    expect(markup).toContain('Temporary overdraft');
    expect(markup).toContain('Currently overdrawn');
    expect(markup).toContain('€833.20');
    expect(markup).toContain('Overdraft credit remaining');
    expect(markup).toContain('€2,166.80');
    expect(markup).toContain('Reduced since last month');
    expect(markup).toContain('€125.00');
    expect(markup).toContain('Clear by');
    expect(markup).toContain('2026-10-31');
    expect(markup).toContain('Keep each month');
    expect(markup).toContain('€277.74');
  });

  test('renders only the overdrawn amount when no facility is linked', () => {
    const markup = render(
      <PlanOverdraftNotice
        currency="EUR"
        overdraft={{
          amountMinor: 25_000n,
          remainingFacilityMinor: null,
          progressMinor: -5_000n,
          targetDate: null,
          monthlyStepMinor: null,
        }}
      />,
    );

    expect(markup).toContain('€250.00');
    expect(markup).not.toContain('Overdraft credit remaining');
    expect(markup).toContain('Increased since last month');
    expect(markup).toContain('€50.00');
  });

  test('renders no notice when the Plan has no overdraft', () => {
    expect(renderHeader(null)).not.toContain('data-slot="plan-overdraft-notice"');
  });

  test('renders both cash and credit shares with their existing destructive and warning tones', () => {
    const markup = render(
      <PlanOverspendingBreakdown
        currency="EUR"
        message={{
          kind: 'overspent',
          amountMinor: 1_500n,
          availableToSpendMinor: 1_000n,
          cashAmountMinor: 500n,
          creditAmountMinor: 1_000n,
        }}
      />,
    );

    expect(markup).toContain('data-overspend-kind="cash"');
    expect(markup).toContain('Cash overspending');
    expect(markup).toContain('€5.00');
    expect(markup).toContain('text-destructive');
    expect(markup).toContain('data-overspend-kind="credit"');
    expect(markup).toContain('Credit overspending');
    expect(markup).toContain('€10.00');
    expect(markup).toContain('text-warning');
  });

  test('does not mention credit for cash-only overspending', () => {
    const markup = render(
      <PlanOverspendingBreakdown
        currency="EUR"
        message={{
          kind: 'overspent',
          amountMinor: 500n,
          availableToSpendMinor: 1_000n,
          cashAmountMinor: 500n,
          creditAmountMinor: 0n,
        }}
      />,
    );

    expect(markup).toContain('Cash overspending');
    expect(markup).not.toContain('Credit overspending');
    expect(markup).not.toContain('data-overspend-kind="credit"');
  });
});
