export const ENABLE_BANKING_SYNC_LOOKBACK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function subtractUtcDays(isoDate: string, days: number) {
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  return new Date(timestamp - days * DAY_MS).toISOString().slice(0, 10);
}

export function enableBankingSyncWindow(args: {
  lastBookedDate?: string;
  backfillFromDate: string;
  today: string;
}): { dateFrom: string; dateTo: string } {
  const cursor = args.lastBookedDate ?? args.backfillFromDate;
  const lookbackDate = subtractUtcDays(cursor, ENABLE_BANKING_SYNC_LOOKBACK_DAYS);
  const unclampedDateFrom = lookbackDate > args.backfillFromDate ? lookbackDate : args.backfillFromDate;

  // A future provider booking date must never create an inverted request window.
  return {
    dateFrom: unclampedDateFrom > args.today ? args.today : unclampedDateFrom,
    dateTo: args.today,
  };
}
