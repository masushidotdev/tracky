import { isSpendableAccountType } from '../lib/accountTypes';

export type SafeToSpendMoney = {
  amountMinor: bigint;
  currency: string;
};

export type SafeToSpendItemKind =
  | 'plannedExpense'
  | 'subscription'
  | 'scheduledTransaction'
  | 'creditInstallment'
  | 'creditStatement';

type PlanningItemSource = SafeToSpendItemKind | 'plannedTransfer';

export type SafeToSpendPlanningView = {
  asOfDate: string;
  cycleStartDate: string;
  cycleEndDate: string;
  monthlyFundingTotals: Array<SafeToSpendMoney>;
  fundingItems: Array<{
    moneyBoxId: string;
    accountId?: string;
    monthlyRequiredAmount: SafeToSpendMoney;
    cycleContributedAmount: SafeToSpendMoney;
  }>;
  accountGroups: Array<{
    accountId: string;
    account?: {
      accountType?: string;
    };
    startingBalance?: SafeToSpendMoney;
    items: Array<{
      title: string;
      dueDate: string;
      amount: SafeToSpendMoney;
      direction: 'inflow' | 'outflow';
      source: PlanningItemSource;
      projectionStatus: 'projected' | 'missingBalance' | 'currencyMismatch' | 'pastCycle';
      occurrencePayment?: unknown;
      plannedExpenseMoneyBoxId?: string;
    }>;
  }>;
};

export type SafeToSpendBreakdown = {
  currency: string;
  availableCash: SafeToSpendMoney;
  committedOutflows: SafeToSpendMoney;
  moneyBoxFunding: SafeToSpendMoney;
  expectedIncome: SafeToSpendMoney;
  safeToSpend: SafeToSpendMoney;
  safeToSpendWithIncome: SafeToSpendMoney;
  cycleStartDate: string;
  cycleEndDate: string;
  daysRemaining: number;
  perDay: SafeToSpendMoney;
  topUpcoming: Array<{
    name: string;
    dueDate: string;
    amount: SafeToSpendMoney;
    kind: SafeToSpendItemKind;
  }>;
};

type CurrencyAccumulator = {
  availableCashMinor: bigint;
  committedOutflowsMinor: bigint;
  moneyBoxFundingMinor: bigint;
  expectedIncomeMinor: bigint;
  accountCount: number;
  upcoming: SafeToSpendBreakdown['topUpcoming'];
};

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

function daysRemaining(asOfDate: string, cycleEndDate: string) {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00.000Z`);
  const cycleEndMs = Date.parse(`${cycleEndDate}T00:00:00.000Z`);
  return Math.max(1, Math.floor((cycleEndMs - asOfMs) / millisecondsPerDay) + 1);
}

function accumulatorForCurrency(totals: Map<string, CurrencyAccumulator>, currency: string) {
  const existing = totals.get(currency);
  if (existing) {
    return existing;
  }

  const created: CurrencyAccumulator = {
    availableCashMinor: 0n,
    committedOutflowsMinor: 0n,
    moneyBoxFundingMinor: 0n,
    expectedIncomeMinor: 0n,
    accountCount: 0,
    upcoming: [],
  };
  totals.set(currency, created);
  return created;
}

function money(amountMinor: bigint, currency: string): SafeToSpendMoney {
  return { amountMinor, currency };
}

function isRemainingProjection(
  item: SafeToSpendPlanningView['accountGroups'][number]['items'][number],
): item is typeof item & { source: SafeToSpendItemKind } {
  return item.projectionStatus === 'projected' && !item.occurrencePayment && item.source !== 'plannedTransfer';
}

export function computeSafeToSpend(
  view: SafeToSpendPlanningView,
  options: { accountId?: string } = {},
): Array<SafeToSpendBreakdown> {
  const totals = new Map<string, CurrencyAccumulator>();
  const committedMoneyBoxIds = new Set<string>();

  for (const group of view.accountGroups) {
    if (options.accountId && group.accountId !== options.accountId) {
      continue;
    }
    // Mirror the planning aggregates: liability and asset groups are not
    // spendable cash. Card settlement items reach their cash account instead.
    if (!isSpendableAccountType(group.account?.accountType)) {
      continue;
    }

    if (group.startingBalance) {
      const total = accumulatorForCurrency(totals, group.startingBalance.currency);
      total.availableCashMinor += group.startingBalance.amountMinor;
      total.accountCount += 1;
    }

    for (const item of group.items) {
      if (!isRemainingProjection(item)) {
        continue;
      }

      const total = accumulatorForCurrency(totals, item.amount.currency);
      if (item.direction === 'inflow') {
        total.expectedIncomeMinor += item.amount.amountMinor;
        continue;
      }

      total.committedOutflowsMinor += item.amount.amountMinor;
      if (item.plannedExpenseMoneyBoxId) {
        committedMoneyBoxIds.add(item.plannedExpenseMoneyBoxId);
      }
      total.upcoming.push({
        name: item.title,
        dueDate: item.dueDate,
        amount: { ...item.amount },
        kind: item.source,
      });
    }
  }

  for (const funding of view.fundingItems) {
    if (
      committedMoneyBoxIds.has(funding.moneyBoxId) ||
      (options.accountId ? funding.accountId !== options.accountId : false)
    ) {
      continue;
    }
    const remainingMinor =
      funding.monthlyRequiredAmount.amountMinor > funding.cycleContributedAmount.amountMinor
        ? funding.monthlyRequiredAmount.amountMinor - funding.cycleContributedAmount.amountMinor
        : 0n;
    accumulatorForCurrency(totals, funding.monthlyRequiredAmount.currency).moneyBoxFundingMinor += remainingMinor;
  }

  const remainingDays = daysRemaining(view.asOfDate, view.cycleEndDate);
  return [...totals.entries()]
    .sort(
      ([leftCurrency, left], [rightCurrency, right]) =>
        right.accountCount - left.accountCount || leftCurrency.localeCompare(rightCurrency),
    )
    .map(([currency, total]) => {
      const safeToSpendMinor = total.availableCashMinor - total.committedOutflowsMinor - total.moneyBoxFundingMinor;
      const safeToSpendWithIncomeMinor = safeToSpendMinor + total.expectedIncomeMinor;
      const perDayMinor = safeToSpendMinor > 0n ? safeToSpendMinor / BigInt(remainingDays) : 0n;

      return {
        currency,
        availableCash: money(total.availableCashMinor, currency),
        committedOutflows: money(total.committedOutflowsMinor, currency),
        moneyBoxFunding: money(total.moneyBoxFundingMinor, currency),
        expectedIncome: money(total.expectedIncomeMinor, currency),
        safeToSpend: money(safeToSpendMinor, currency),
        safeToSpendWithIncome: money(safeToSpendWithIncomeMinor, currency),
        cycleStartDate: view.cycleStartDate,
        cycleEndDate: view.cycleEndDate,
        daysRemaining: remainingDays,
        perDay: money(perDayMinor, currency),
        topUpcoming: total.upcoming
          .toSorted(
            (left, right) =>
              left.dueDate.localeCompare(right.dueDate) ||
              left.name.localeCompare(right.name) ||
              left.kind.localeCompare(right.kind),
          )
          .slice(0, 5),
      };
    });
}
