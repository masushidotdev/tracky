import { describe, expect, test } from 'vitest';
import {
  ENABLE_BANKING_SYNC_LOOKBACK_DAYS,
  enableBankingSyncWindow,
} from './banking/syncWindow';

describe('Enable Banking sync window', () => {
  test('applies the seven-day lookback', () => {
    expect(ENABLE_BANKING_SYNC_LOOKBACK_DAYS).toBe(7);
    expect(
      enableBankingSyncWindow({
        lastBookedDate: '2026-07-27',
        backfillFromDate: '2026-01-01',
        today: '2026-07-28',
      }),
    ).toEqual({ dateFrom: '2026-07-20', dateTo: '2026-07-28' });
  });

  test('never looks back before the configured backfill date', () => {
    expect(
      enableBankingSyncWindow({
        lastBookedDate: '2026-01-05',
        backfillFromDate: '2026-01-01',
        today: '2026-01-10',
      }),
    ).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-01-10' });
  });

  test('clamps a future cursor to a non-inverted window', () => {
    expect(
      enableBankingSyncWindow({
        lastBookedDate: '2026-08-20',
        backfillFromDate: '2026-08-15',
        today: '2026-08-01',
      }),
    ).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-01' });
  });

  test('handles a month boundary in UTC', () => {
    expect(
      enableBankingSyncWindow({
        lastBookedDate: '2026-03-03',
        backfillFromDate: '2026-01-01',
        today: '2026-03-04',
      }),
    ).toEqual({ dateFrom: '2026-02-24', dateTo: '2026-03-04' });
  });
});
