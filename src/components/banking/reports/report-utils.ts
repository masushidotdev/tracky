import type {
  ReportBreakdown,
  ReportDatePreset,
  ReportSeriesGroup,
  ReportTab,
} from './types';
import { currencyFractionDigits } from '@/lib/money';

export const REPORT_CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export function chartColor(index: number) {
  return REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length];
}

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function resolveDatePreset(
  preset: ReportDatePreset,
  customFrom: string,
  customTo: string,
  now = new Date(),
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'custom') {
    return { dateFrom: customFrom, dateTo: customTo };
  }
  if (preset === 'allTime') {
    return { dateFrom: '2000-01-01', dateTo: localIso(today) };
  }
  if (preset === 'thisMonth') {
    return { dateFrom: localIso(startOfMonth(today)), dateTo: localIso(today) };
  }
  if (preset === 'lastMonth') {
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { dateFrom: localIso(previousMonth), dateTo: localIso(endOfMonth(previousMonth)) };
  }
  if (preset === 'thisYear') {
    return { dateFrom: `${today.getFullYear()}-01-01`, dateTo: localIso(today) };
  }
  if (preset === 'lastYear') {
    const year = today.getFullYear() - 1;
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }

  const from = new Date(today);
  if (preset === 'last30Days') {
    from.setDate(from.getDate() - 29);
  } else if (preset === 'last90Days') {
    from.setDate(from.getDate() - 89);
  } else {
    from.setFullYear(from.getFullYear() - 1);
    from.setDate(from.getDate() + 1);
  }
  return { dateFrom: localIso(from), dateTo: localIso(today) };
}

export function reportGroupValue(group: ReportSeriesGroup, tab: ReportTab) {
  if (tab === 'spending') {
    return group.expensesMinor;
  }
  if (tab === 'income') {
    return group.incomeMinor;
  }
  return group.incomeMinor - group.expensesMinor;
}

export type RolledBreakdown = {
  key: string;
  label: string;
  amountMinor: bigint;
  sourceKeys: Array<string>;
  isOther: boolean;
};

export function rollupBreakdown(
  rows: Array<ReportBreakdown>,
  tab: Extract<ReportTab, 'spending' | 'income'>,
  otherLabel: string,
): Array<RolledBreakdown> {
  const values = rows
    .map((row) => ({
      key: row.key,
      label: row.label,
      amountMinor: tab === 'spending' ? row.expensesMinor : row.incomeMinor,
      sourceKeys: [row.key],
      isOther: false,
    }))
    .filter((row) => row.amountMinor > 0n)
    .sort((left, right) => (left.amountMinor === right.amountMinor ? 0 : left.amountMinor > right.amountMinor ? -1 : 1));
  const top = values.slice(0, 10);
  const remainder = values.slice(10);
  if (remainder.length === 0) {
    return top;
  }
  return [
    ...top,
    {
      key: '__other__',
      label: otherLabel,
      amountMinor: remainder.reduce((total, row) => total + row.amountMinor, 0n),
      sourceKeys: remainder.map((row) => row.key),
      isOther: true,
    },
  ];
}

export function minorToDecimal(amountMinor: bigint, currency: string, decimalSeparator = '.') {
  const digits = currencyFractionDigits(currency);
  const factor = 10n ** BigInt(digits);
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const whole = absolute / factor;
  if (digits === 0) {
    return `${negative ? '-' : ''}${whole}`;
  }
  return `${negative ? '-' : ''}${whole}${decimalSeparator}${String(absolute % factor).padStart(digits, '0')}`;
}

// Neutralize spreadsheet formula injection: bank-controlled labels (payee,
// category names) can start with `=`, `+`, `-`, `@` and execute on open in
// Excel/Sheets. A leading apostrophe forces text treatment in every reader.
const CSV_FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

function escapeCsvCell(value: string, separator: string) {
  const neutralized = value.length > 0 && CSV_FORMULA_TRIGGER_RE.test(value[0]) ? `'${value}` : value;
  if (neutralized.includes(separator) || neutralized.includes('"') || neutralized.includes('\n')) {
    return `"${neutralized.replaceAll('"', '""')}"`;
  }
  return neutralized;
}

export function createCsv(rows: Array<Array<string>>, separator: string) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell, separator)).join(separator)).join('\n');
}
