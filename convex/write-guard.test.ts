// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { routeWriteGuardBadge } from './analyst/writeGuard';

describe('jev write-guard badges', () => {
  test('blocks high-risk writes and large blast radii', () => {
    expect(routeWriteGuardBadge({ risk: 'high-block', autoApprove: 0.9, recordCount: 1 })).toBe('block');
    // 42 records are never "safe" on jev's word alone (demo 05 lesson).
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.95, recordCount: 42 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'needs-confirmation', autoApprove: 0.9, recordCount: 3 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.4, recordCount: 1 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.9, recordCount: 1 })).toBe('safe');
  });
});
