import Papa from 'papaparse';

import { currencyFractionDigits } from '../money';

export type CsvRecord = Record<string, string>;

export type CsvParseResult = {
  headers: Array<string>;
  rows: Array<CsvRecord>;
  errors: Array<{ row?: number; message: string }>;
};

export type CsvDateFormat = 'auto' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD.MM.YYYY';

export type CsvColumnMapping = {
  bookingDateColumn: string;
  descriptionColumn: string;
  counterpartyNameColumn?: string;
  dateFormat: CsvDateFormat;
} & (
  | { amountMode: 'signed'; amountColumn: string }
  | { amountMode: 'split'; debitColumn: string; creditColumn: string }
);

export type ParsedCsvTransaction = {
  direction: 'CRDT' | 'DBIT';
  amount: { amountMinor: bigint; currency: string };
  bookingDate: string;
  description: string;
  counterpartyName?: string;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DOT_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

export function parseCsv(contents: string): CsvParseResult {
  const parsed = Papa.parse<CsvRecord>(contents, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  return {
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
    errors: parsed.errors.map((error) => ({ row: error.row, message: error.message })),
  };
}

function decimalParts(value: string, fractionDigits: number) {
  const compact = value.trim().replace(/[\s\u00a0']/g, '');
  if (!compact) {
    throw new Error('Amount is required');
  }

  const parenthesized = compact.startsWith('(') && compact.endsWith(')');
  const numeric = compact.replace(/[^\d.,+-]/g, '');
  const negative = parenthesized || numeric.startsWith('-');
  const unsigned = numeric.replace(/[+-]/g, '');
  if (!/\d/.test(unsigned)) {
    throw new Error('Amount is invalid');
  }

  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else {
    const separator = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
    if (separator) {
      const separatorIndex = unsigned.lastIndexOf(separator);
      const digitsAfter = unsigned.length - separatorIndex - 1;
      const occurrences = unsigned.split(separator).length - 1;
      if (occurrences === 1 && digitsAfter > 0 && digitsAfter <= fractionDigits) {
        decimalSeparator = separator;
      }
    }
  }

  const decimalIndex = decimalSeparator ? unsigned.lastIndexOf(decimalSeparator) : -1;
  const wholeRaw = decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned;
  const fractionRaw = decimalIndex >= 0 ? unsigned.slice(decimalIndex + 1) : '';
  const whole = wholeRaw.replace(/[.,]/g, '') || '0';
  const fraction = fractionRaw.replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new Error('Amount is invalid');
  }
  return { fraction, negative, whole };
}

export function parseAmount(value: string, currencyOrFractionDigits: string | number = 'EUR') {
  const fractionDigits =
    typeof currencyOrFractionDigits === 'number'
      ? currencyOrFractionDigits
      : currencyFractionDigits(currencyOrFractionDigits.toUpperCase());
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new Error('Currency fraction digits are invalid');
  }

  const { fraction, negative, whole } = decimalParts(value, fractionDigits);
  const factor = 10n ** BigInt(fractionDigits);
  const paddedFraction = fraction.padEnd(fractionDigits + 1, '0');
  const keptFraction = fractionDigits === 0 ? 0n : BigInt(paddedFraction.slice(0, fractionDigits));
  const shouldRound = Number(paddedFraction[fractionDigits] ?? '0') >= 5;
  const absoluteMinor = BigInt(whole) * factor + keptFraction + (shouldRound ? 1n : 0n);
  return negative ? -absoluteMinor : absoluteMinor;
}

function isoDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error('Date is invalid');
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDate(value: string, format: CsvDateFormat = 'auto') {
  const trimmed = value.trim();
  const isoMatch = ISO_DATE_RE.exec(trimmed);
  if (isoMatch && (format === 'auto' || format === 'YYYY-MM-DD')) {
    return isoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dotMatch = DOT_DATE_RE.exec(trimmed);
  if (dotMatch && (format === 'auto' || format === 'DD.MM.YYYY')) {
    return isoDate(Number(dotMatch[3]), Number(dotMatch[2]), Number(dotMatch[1]));
  }

  const slashMatch = SLASH_DATE_RE.exec(trimmed);
  if (slashMatch && (format === 'auto' || format === 'DD/MM/YYYY' || format === 'MM/DD/YYYY')) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const monthFirst = format === 'MM/DD/YYYY' || (format === 'auto' && second > 12);
    return monthFirst ? isoDate(year, first, second) : isoDate(year, second, first);
  }

  throw new Error('Unsupported date format');
}

export function normalizeDescription(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function computeDedupeKey(args: {
  bookingDate: string;
  direction: 'CRDT' | 'DBIT';
  amountMinor: bigint;
  currency: string;
  description: string;
}) {
  const input = [
    args.bookingDate,
    args.direction,
    args.amountMinor.toString(),
    args.currency.toUpperCase(),
    normalizeDescription(args.description),
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `csv|${hex}`;
}

export function parseTransactionRow(row: CsvRecord, mapping: CsvColumnMapping, currency: string): ParsedCsvTransaction {
  const description = (row[mapping.descriptionColumn] ?? '').trim();
  if (!description) {
    throw new Error('Description is required');
  }

  let direction: 'CRDT' | 'DBIT';
  let signedMinor: bigint;
  if (mapping.amountMode === 'signed') {
    signedMinor = parseAmount(row[mapping.amountColumn] ?? '', currency);
    direction = signedMinor < 0n ? 'DBIT' : 'CRDT';
  } else {
    const debitValue = (row[mapping.debitColumn] ?? '').trim();
    const creditValue = (row[mapping.creditColumn] ?? '').trim();
    if (debitValue && creditValue) {
      throw new Error('Use either debit or credit, not both');
    }
    if (!debitValue && !creditValue) {
      throw new Error('Debit or credit amount is required');
    }
    direction = debitValue ? 'DBIT' : 'CRDT';
    signedMinor = parseAmount(debitValue || creditValue, currency);
  }

  const amountMinor = signedMinor < 0n ? -signedMinor : signedMinor;
  if (amountMinor === 0n) {
    throw new Error('Amount must be greater than zero');
  }
  const counterpartyName = mapping.counterpartyNameColumn ? (row[mapping.counterpartyNameColumn] ?? '').trim() : '';

  return {
    direction,
    amount: { amountMinor, currency: currency.toUpperCase() },
    bookingDate: parseDate(row[mapping.bookingDateColumn] ?? '', mapping.dateFormat),
    description,
    counterpartyName: counterpartyName || undefined,
  };
}
