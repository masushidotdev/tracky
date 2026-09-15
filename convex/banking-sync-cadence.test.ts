import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS,
  SYNC_DISPATCH_INTERVAL_MINUTES,
  syncFailureBackoffMinutes,
} from './banking/syncCadence';

describe('bank account sync cadence', () => {
  test('dispatches due-account checks more frequently than the account cadence', () => {
    const accountCadenceMinutes = DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS * 60;

    expect(SYNC_DISPATCH_INTERVAL_MINUTES).toBeGreaterThan(0);
    expect(SYNC_DISPATCH_INTERVAL_MINUTES).toBeLessThan(accountCadenceMinutes);
  });

  test('picks up an account shortly after it becomes due instead of one cadence later', () => {
    const dispatcherIntervalMs = SYNC_DISPATCH_INTERVAL_MINUTES * 60 * 1000;
    const accountCadenceMs = DEFAULT_ACCOUNT_SYNC_CADENCE_HOURS * 60 * 60 * 1000;
    const syncCompletedAtMs = Date.UTC(2026, 6, 21, 4, 9, 30);
    const nextSyncAfterMs = syncCompletedAtMs + accountCadenceMs;
    const nextDispatcherTickMs = Math.ceil(nextSyncAfterMs / dispatcherIntervalMs) * dispatcherIntervalMs;

    expect(nextDispatcherTickMs - nextSyncAfterMs).toBeLessThanOrEqual(dispatcherIntervalMs);
    expect(nextDispatcherTickMs).toBeLessThan(syncCompletedAtMs + accountCadenceMs * 2);
  });

  test('backs off failed syncs exponentially and caps retries at twelve hours', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(syncFailureBackoffMinutes)).toEqual([
      30, 60, 120, 240, 480, 720, 720,
    ]);
  });
});
