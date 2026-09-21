// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { routeWriteGuardBadge } from './analyst/writeGuardBadge';

describe('jev write-guard badges', () => {
  test('blocks high-risk writes and large blast radii', () => {
    expect(routeWriteGuardBadge({ risk: 'high-block', autoApprove: 0.9, recordCount: 1 })).toBe('block');
    // 42 records are never "safe" on jev's word alone (demo 05 lesson).
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.95, recordCount: 42 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'needs-confirmation', autoApprove: 0.9, recordCount: 3 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.4, recordCount: 1 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'low', autoApprove: 0.9, recordCount: 1 })).toBe('safe');
  });

  test('treats an incomplete verdict as confirm, never safe', () => {
    expect(routeWriteGuardBadge({ autoApprove: 0.95, recordCount: 1 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: undefined, autoApprove: 0.99, recordCount: 1 })).toBe('confirm');
    expect(routeWriteGuardBadge({ risk: 'unexpected-label', autoApprove: 0.99, recordCount: 1 })).toBe('confirm');
  });
});

describe('jev write-guard allowlist routing', () => {
  test('routes known tools deterministically without external calls', async () => {
    const { riskForTool, recordCountForApproval } = await import('./analyst/writeGuardBadge');
    expect(riskForTool('rememberFact')).toBe('low');
    expect(riskForTool('setPlanTarget')).toBe('needs-confirmation');
    expect(riskForTool('unknownTool')).toBe('needs-confirmation');
    expect(recordCountForApproval('bulkRecategorize', { changes: [1, 2, 3] })).toBe(3);
    expect(recordCountForApproval('bulkRecategorize', { changes: Array.from({ length: 99 }) })).toBe(50);
    expect(recordCountForApproval('setPlanTarget', {})).toBe(1);
  });
});
