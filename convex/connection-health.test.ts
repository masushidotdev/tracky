import { describe, expect, test } from 'vitest';
import { buildConnectionHealth } from './banking/connectionHealth';

describe('bank connection health', () => {
  test('marks expired consent as requiring reauthorization', () => {
    const health = buildConnectionHealth(
      {
        status: 'active',
        accessValidUntil: '2026-06-01',
      },
      Date.UTC(2026, 5, 19),
    );

    expect(health.accessExpired).toBe(true);
    expect(health.requiresReauthorization).toBe(true);
    expect(health.warningLevel).toBe('error');
    expect(health.daysUntilExpiry).toBeLessThan(0);
  });

  test('warns when consent expiry is near', () => {
    const health = buildConnectionHealth(
      {
        status: 'active',
        accessValidUntil: '2026-06-25',
      },
      Date.UTC(2026, 5, 19),
    );

    expect(health.accessExpired).toBe(false);
    expect(health.requiresReauthorization).toBe(false);
    expect(health.warningLevel).toBe('warning');
    expect(health.daysUntilExpiry).toBe(7);
  });
});
