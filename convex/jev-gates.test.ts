// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { routeAnomalyGate, routeReportSkip } from './analyst/proactive/jevGates';

describe('jev proactive gates', () => {
  test('anomaly gate notifies only above threshold with tone-mapped severity', () => {
    expect(routeAnomalyGate({ notifyNow: 0.85, tone: 'urgent', toneConfidence: 0.97 })).toEqual({
      notify: true,
      severity: 'critical',
    });
    expect(routeAnomalyGate({ notifyNow: 0.17, tone: 'warn', toneConfidence: 0.55 })).toEqual({
      notify: false,
      severity: 'info',
    });
  });

  test('report skip uses a deterministic template below threshold', () => {
    expect(routeReportSkip(0.8)).toBe('generate');
    expect(routeReportSkip(0.2)).toBe('template');
  });
});
