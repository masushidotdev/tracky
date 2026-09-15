// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { computeDedupeKey, parseAmount, parseCsv, parseDate, parseTransactionRow } from '../src/lib/csv/parse';

describe('CSV client parsing', () => {
  test('parses decimal commas, decimal points, grouping, signs, and currency precision', () => {
    expect(parseAmount('1.234,56')).toBe(123456n);
    expect(parseAmount('1,234.56')).toBe(123456n);
    expect(parseAmount('-12,50')).toBe(-1250n);
    expect(parseAmount('(12.50)')).toBe(-1250n);
    expect(parseAmount('123', 'JPY')).toBe(123n);
  });

  test('normalizes all supported date formats', () => {
    expect(parseDate('2026-07-16')).toBe('2026-07-16');
    expect(parseDate('16/07/2026')).toBe('2026-07-16');
    expect(parseDate('07/16/2026')).toBe('2026-07-16');
    expect(parseDate('16.07.2026')).toBe('2026-07-16');
    expect(parseDate('03/04/2026', 'MM/DD/YYYY')).toBe('2026-03-04');
  });

  test('parses CSV headers and separate debit/credit columns', () => {
    const parsed = parseCsv('Date,Description,Debit,Credit\n16/07/2026,Coffee,"4,50",\n17/07/2026,Refund,,2.00');
    expect(parsed.headers).toEqual(['Date', 'Description', 'Debit', 'Credit']);
    const mapping = {
      bookingDateColumn: 'Date',
      descriptionColumn: 'Description',
      dateFormat: 'DD/MM/YYYY' as const,
      amountMode: 'split' as const,
      debitColumn: 'Debit',
      creditColumn: 'Credit',
    };
    expect(parseTransactionRow(parsed.rows[0], mapping, 'EUR')).toMatchObject({
      direction: 'DBIT',
      amount: { amountMinor: 450n, currency: 'EUR' },
    });
    expect(parseTransactionRow(parsed.rows[1], mapping, 'EUR')).toMatchObject({
      direction: 'CRDT',
      amount: { amountMinor: 200n, currency: 'EUR' },
    });
  });

  test('uses the sign in a single amount column', () => {
    const mapping = {
      bookingDateColumn: 'date',
      descriptionColumn: 'description',
      dateFormat: 'YYYY-MM-DD' as const,
      amountMode: 'signed' as const,
      amountColumn: 'amount',
    };
    expect(
      parseTransactionRow({ date: '2026-07-16', description: 'Coffee', amount: '-3.20' }, mapping, 'EUR'),
    ).toMatchObject({ direction: 'DBIT', amount: { amountMinor: 320n } });
  });

  test('creates deterministic SHA-256 dedupe keys from normalized descriptions', async () => {
    const first = await computeDedupeKey({
      bookingDate: '2026-07-16',
      direction: 'DBIT',
      amountMinor: 450n,
      currency: 'EUR',
      description: '  Corner   Café ',
    });
    const second = await computeDedupeKey({
      bookingDate: '2026-07-16',
      direction: 'DBIT',
      amountMinor: 450n,
      currency: 'eur',
      description: 'corner café',
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^csv\|[0-9a-f]{64}$/);
  });
});
