/// <reference types="vite/client" />

import { describe, expect, test } from 'vitest';
import { JEV_TRIAGE_NOTE_PREFIX, routeTriage } from './banking/importTriage';

describe('jev import triage routing', () => {
  test('auto-applies only above both thresholds', () => {
    expect(routeTriage({ choice: 'expense', confidence: 0.9, autoApply: 0.8 })).toBe('auto');
    expect(routeTriage({ choice: 'expense', confidence: 1, autoApply: 0.59 })).toBe('suggest');
    expect(routeTriage({ choice: 'transfer', confidence: 0.72, autoApply: 0.44 })).toBe('suggest');
    expect(routeTriage({ choice: 'expense', confidence: 0.3, autoApply: 0.2 })).toBe('queue');
  });

  test('uses a stable note prefix for traceability without a new source literal', () => {
    expect(JEV_TRIAGE_NOTE_PREFIX).toBe('jev:triage:v1');
  });
});
