// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { hasSafeCells, hasToolExecutionError, isSafeDataKey } from '../../src/components/banking/analyst/helpers';

describe('Analyst presentation guards', () => {
  test('accepts bounded CSS-safe keys', () => {
    expect(isSafeDataKey('projected_balance-1')).toBe(true);
    expect(hasSafeCells({ month: '2026-07', projected_balance: 42 })).toBe(true);
  });

  test('rejects keys that could alter selectors or CSS variables', () => {
    expect(isSafeDataKey('x);color:red')).toBe(false);
    expect(isSafeDataKey('--token')).toBe(false);
    expect(hasSafeCells({ 'x]{}': 42 })).toBe(false);
  });

  test('does not present serialized backend failures as completed tools', () => {
    expect(
      hasToolExecutionError({
        state: 'output-available',
        output: 'ArgumentValidationError: Value does not match validator.\nPath: .accountId',
      }),
    ).toBe(true);
    expect(hasToolExecutionError({ state: 'output-error' })).toBe(true);
    expect(
      hasToolExecutionError({
        state: 'output-available',
        output: JSON.stringify('ArgumentValidationError: Value does not match validator.\nPath: .accountId'),
      }),
    ).toBe(true);
    expect(
      hasToolExecutionError({
        state: 'output-available',
        output: {
          type: 'error-text',
          value: 'ArgumentValidationError: Value does not match validator.\nPath: .accountId',
        },
      }),
    ).toBe(true);
    expect(hasToolExecutionError({ state: 'output-available', output: { rows: [] } })).toBe(false);
    expect(
      hasToolExecutionError({
        state: 'output-available',
        output: { type: 'text', value: 'ArgumentValidationError: x' },
      }),
    ).toBe(false);
    expect(hasToolExecutionError({ state: 'output-available', output: 'No errors found.' })).toBe(false);
    expect(
      hasToolExecutionError({
        state: 'output-available',
        output: JSON.stringify(JSON.stringify('ArgumentValidationError: nested too deeply')),
      }),
    ).toBe(false);
  });
});
