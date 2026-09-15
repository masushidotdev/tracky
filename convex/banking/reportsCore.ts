export type ReportTransactionRow = {
  direction: 'CRDT' | 'DBIT';
  status: string;
  classificationKind: string;
  amount: { amountMinor: bigint; currency: string };
  bookingDate: string;
  categoryId?: string | null;
  counterpartyName?: string | null;
  hiddenFromReports?: boolean;
  tagIds?: ReadonlyArray<string>;
  description: string;
  accountId: string;
};

export type ReportLookups = {
  categories: Map<string, { name: string; kind?: string }>;
  categoryGroups: Map<string, ResolvedGroup> | null;
  accounts: Map<string, { label: string }>;
};

export type ReportOptions = {
  tab: 'cashflow' | 'spending' | 'income';
  groupBy: 'category' | 'categoryGroup' | 'counterparty' | 'account';
  granularity: 'month' | 'quarter' | 'year';
};

export type ReportSummary = {
  currency: string;
  incomeMinor: bigint;
  expensesMinor: bigint;
  netMinor: bigint;
  savingsRatePct: number;
};

export type ReportSeriesGroup = {
  key: string;
  label: string;
  incomeMinor: bigint;
  expensesMinor: bigint;
};

export type ReportSeries = {
  period: string;
  currency: string;
  groups: Array<ReportSeriesGroup>;
};

export type ReportBreakdown = ReportSeriesGroup & {
  currency: string;
  totalMinor: bigint;
};

export type AggregatedReport = {
  summary: Array<ReportSummary>;
  series: Array<ReportSeries>;
  breakdown: Array<ReportBreakdown>;
};

type Totals = {
  incomeMinor: bigint;
  expensesMinor: bigint;
};

type ResolvedGroup = {
  key: string;
  label: string;
};

function absoluteMinorUnits(value: bigint) {
  return value < 0n ? -value : value;
}

function periodForDate(bookingDate: string, granularity: ReportOptions['granularity']) {
  const year = bookingDate.slice(0, 4);
  if (granularity === 'year') {
    return year;
  }

  const month = bookingDate.slice(5, 7);
  if (granularity === 'month') {
    return `${year}-${month}`;
  }

  const quarter = (Number(month) - 1) / 3 + 1;
  return `${year}-Q${Math.floor(quarter)}`;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function categoryGroup(categoryId: string | null | undefined, lookups: ReportLookups): ResolvedGroup {
  if (!categoryId) {
    return { key: 'uncategorized', label: 'uncategorized' };
  }

  if (lookups.categoryGroups) {
    return lookups.categoryGroups.get(categoryId) ?? { key: 'uncategorized', label: 'uncategorized' };
  }

  const category = lookups.categories.get(categoryId);
  if (!category) {
    return { key: 'uncategorized', label: 'uncategorized' };
  }

  return { key: category.name, label: category.name };
}

export function resolveGroup(row: ReportTransactionRow, lookups: ReportLookups, groupBy: ReportOptions['groupBy']) {
  if (groupBy === 'categoryGroup') {
    return categoryGroup(row.categoryId, lookups);
  }

  if (groupBy === 'category') {
    const name = row.categoryId ? lookups.categories.get(row.categoryId)?.name : undefined;
    const label = name ?? 'uncategorized';
    return { key: label, label };
  }

  if (groupBy === 'account') {
    const label = lookups.accounts.get(row.accountId)?.label ?? row.accountId;
    return { key: label, label };
  }

  const label = normalizeWhitespace(row.counterpartyName ?? row.description) || 'unknown counterparty';
  return { key: label.toLocaleLowerCase(), label };
}

function addAmount(totals: Totals, direction: ReportTransactionRow['direction'], amountMinor: bigint) {
  if (direction === 'CRDT') {
    totals.incomeMinor += amountMinor;
  } else {
    totals.expensesMinor += amountMinor;
  }
}

function roundedSavingsRatePct(netMinor: bigint, incomeMinor: bigint) {
  if (incomeMinor === 0n) {
    return 0;
  }

  const numerator = netMinor * 1000n;
  const sign = numerator < 0n ? -1n : 1n;
  const roundedTenths = sign * ((absoluteMinorUnits(numerator) + incomeMinor / 2n) / incomeMinor);
  return Number(roundedTenths) / 10;
}

export function aggregateTransactionsForReport(
  rows: Array<ReportTransactionRow>,
  lookups: ReportLookups,
  opts: ReportOptions,
): AggregatedReport {
  const summaryByCurrency = new Map<string, Totals>();
  const seriesByPeriodCurrency = new Map<string, { period: string; currency: string; groups: Map<string, Totals> }>();
  const breakdownByCurrencyGroup = new Map<string, { key: string; label: string; currency: string; totals: Totals }>();

  for (const row of rows) {
    if (row.hiddenFromReports === true) {
      continue;
    }
    // Scheduled money has not moved yet; only booked rows are report material.
    if (row.status === 'SCHD') {
      continue;
    }
    if (row.classificationKind === 'transfer' || row.classificationKind === 'internal') {
      continue;
    }
    if (opts.tab === 'spending' && row.direction !== 'DBIT') {
      continue;
    }
    if (opts.tab === 'income' && row.direction !== 'CRDT') {
      continue;
    }

    const amountMinor = absoluteMinorUnits(row.amount.amountMinor);
    const currency = row.amount.currency;
    const period = periodForDate(row.bookingDate, opts.granularity);
    const group = resolveGroup(row, lookups, opts.groupBy);

    const summaryTotals = summaryByCurrency.get(currency) ?? { incomeMinor: 0n, expensesMinor: 0n };
    addAmount(summaryTotals, row.direction, amountMinor);
    summaryByCurrency.set(currency, summaryTotals);

    const seriesMapKey = `${period}\u0000${currency}`;
    const periodCurrency = seriesByPeriodCurrency.get(seriesMapKey) ?? { period, currency, groups: new Map() };
    const seriesTotals = periodCurrency.groups.get(group.key) ?? { incomeMinor: 0n, expensesMinor: 0n };
    addAmount(seriesTotals, row.direction, amountMinor);
    periodCurrency.groups.set(group.key, seriesTotals);
    seriesByPeriodCurrency.set(seriesMapKey, periodCurrency);

    const breakdownMapKey = `${currency}\u0000${group.key}`;
    const breakdown = breakdownByCurrencyGroup.get(breakdownMapKey) ?? {
      key: group.key,
      label: group.label,
      currency,
      totals: { incomeMinor: 0n, expensesMinor: 0n },
    };
    addAmount(breakdown.totals, row.direction, amountMinor);
    breakdownByCurrencyGroup.set(breakdownMapKey, breakdown);
  }

  const summary = [...summaryByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, totals]) => {
      const netMinor = totals.incomeMinor - totals.expensesMinor;
      return {
        currency,
        incomeMinor: totals.incomeMinor,
        expensesMinor: totals.expensesMinor,
        netMinor,
        savingsRatePct: roundedSavingsRatePct(netMinor, totals.incomeMinor),
      };
    });

  const series = [...seriesByPeriodCurrency.values()]
    .sort((left, right) => left.period.localeCompare(right.period) || left.currency.localeCompare(right.currency))
    .map(({ period, currency, groups }) => ({
      period,
      currency,
      groups: [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, totals]) => ({
          key,
          label: breakdownByCurrencyGroup.get(`${currency}\u0000${key}`)?.label ?? key,
          incomeMinor: totals.incomeMinor,
          expensesMinor: totals.expensesMinor,
        })),
    }));

  const breakdown = [...breakdownByCurrencyGroup.values()]
    .map(({ key, label, currency, totals }) => ({
      key,
      label,
      currency,
      incomeMinor: totals.incomeMinor,
      expensesMinor: totals.expensesMinor,
      totalMinor: totals.incomeMinor + totals.expensesMinor,
    }))
    .sort(
      (left, right) =>
        (left.totalMinor === right.totalMinor ? 0 : left.totalMinor > right.totalMinor ? -1 : 1) ||
        left.key.localeCompare(right.key) ||
        left.currency.localeCompare(right.currency),
    );

  return { summary, series, breakdown };
}
