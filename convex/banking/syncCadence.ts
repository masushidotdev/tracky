export const DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS = 6;
export const SYNC_DISPATCH_INTERVAL_MINUTES = 15;

export function syncFailureBackoffMinutes(consecutiveFailures: number) {
  return Math.min(30 * 2 ** (consecutiveFailures - 1), 720);
}
