// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { APPROVAL_DENIED_REASON, approvalBatchState, approvalContinuationContext } from './approvalBatch';

function assistantRequests(...approvalIds: Array<string>) {
  return {
    message: {
      role: 'assistant',
      content: approvalIds.map((approvalId, index) => ({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: `call-${index}`,
      })),
    },
  };
}

function toolResponses(...decisions: Array<[approvalId: string, approved: boolean]>) {
  return {
    message: {
      role: 'tool',
      content: decisions.map(([approvalId, approved]) => ({
        type: 'tool-approval-response',
        approvalId,
        approved,
      })),
    },
  };
}

describe('approvalBatchState', () => {
  test('gives the model an explicit, durable non-execution reason for denials', () => {
    expect(APPROVAL_DENIED_REASON).toContain('explicitly denied');
    expect(APPROVAL_DENIED_REASON).toContain('not executed');
    expect(APPROVAL_DENIED_REASON).toContain('must not be reported as successful');
  });

  test('builds trusted continuation context from persisted batch counts', () => {
    const context = approvalContinuationContext({
      requestCount: 17,
      approvedCount: 16,
      deniedCount: 1,
      pendingCount: 0,
    });

    expect(context).toContain('trusted="server"');
    expect(context).toContain('17 proposed writes: 16 approved, 1 denied, and 0 pending');
    expect(context).toContain('Denied writes were not executed');
    expect(context).toContain('must not claim all 17 proposals succeeded');
  });


  test('recognizes an explicitly denied single write as resolved and not approved', () => {
    expect(approvalBatchState([toolResponses(['deny-me', false]), assistantRequests('deny-me')], 'deny-me')).toEqual({
      requestCount: 1,
      approvedCount: 0,
      deniedCount: 1,
      pendingCount: 0,
    });
  });

  test('keeps generation paused while another write from the same step is unresolved', () => {
    expect(
      approvalBatchState([toolResponses(['first', false]), assistantRequests('first', 'second')], 'first'),
    ).toEqual({
      requestCount: 2,
      approvedCount: 0,
      deniedCount: 1,
      pendingCount: 1,
    });
  });

  test('resolves a mixed batch only after every explicit decision is present', () => {
    expect(
      approvalBatchState(
        [toolResponses(['first', false], ['second', true]), assistantRequests('first', 'second')],
        'second',
      ),
    ).toEqual({
      requestCount: 2,
      approvedCount: 1,
      deniedCount: 1,
      pendingCount: 0,
    });
  });

  test('does not let responses from a different approval step satisfy the target batch', () => {
    expect(
      approvalBatchState(
        [toolResponses(['newer', true]), assistantRequests('newer'), assistantRequests('target', 'pending')],
        'target',
      ),
    ).toEqual({
      requestCount: 2,
      approvedCount: 0,
      deniedCount: 0,
      pendingCount: 2,
    });
  });

  test('fails closed when the target approval is outside the bounded history', () => {
    expect(() => approvalBatchState([assistantRequests('other')], 'missing')).toThrow(
      'Approval missing was not found',
    );
  });
});
