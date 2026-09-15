type StoredMessageLike = {
  message?: {
    role?: string;
    content?: unknown;
  };
};

type ApprovalPart = {
  type?: unknown;
  approvalId?: unknown;
  approved?: unknown;
};

export type ApprovalBatchState = {
  requestCount: number;
  approvedCount: number;
  deniedCount: number;
  pendingCount: number;
};

export const APPROVAL_GRANTED_REASON = 'The user explicitly approved this proposed change.';
export const APPROVAL_DENIED_REASON =
  'The user explicitly denied this proposed change. It was not executed and must not be reported as successful.';

export function approvalContinuationContext(state: ApprovalBatchState) {
  return `<approval-continuation trusted="server">
This approval batch contained ${state.requestCount} proposed writes: ${state.approvedCount} approved, ${state.deniedCount} denied, and ${state.pendingCount} pending.
Denied writes were not executed. Verify the tool result of every approved write before counting it as successful. Your response must report denied and failed writes separately and must not claim all ${state.requestCount} proposals succeeded when the denied or failed count is nonzero.
</approval-continuation>`;
}

/**
 * Finds the assistant step that owns an approval and determines whether every
 * write proposed by that same step has received an explicit user decision.
 * Agent messages are expected in newest-first order, matching listMessages.
 */
export function approvalBatchState(
  messages: ReadonlyArray<StoredMessageLike>,
  targetApprovalId: string,
): ApprovalBatchState {
  const responses = new Map<string, boolean>();

  for (const stored of messages) {
    const content = stored.message?.content;
    if (!Array.isArray(content)) continue;

    for (const rawPart of content) {
      const part = rawPart as ApprovalPart;
      if (
        part.type === 'tool-approval-response' &&
        typeof part.approvalId === 'string' &&
        typeof part.approved === 'boolean'
      ) {
        responses.set(part.approvalId, part.approved);
      }
    }

    if (stored.message?.role !== 'assistant') continue;
    const requestIds = content
      .map((rawPart) => rawPart as ApprovalPart)
      .filter(
        (part): part is ApprovalPart & { approvalId: string } =>
          part.type === 'tool-approval-request' && typeof part.approvalId === 'string',
      )
      .map((part) => part.approvalId);

    if (!requestIds.includes(targetApprovalId)) continue;

    let approvedCount = 0;
    let deniedCount = 0;
    for (const approvalId of requestIds) {
      const decision = responses.get(approvalId);
      if (decision === true) approvedCount += 1;
      if (decision === false) deniedCount += 1;
    }

    return {
      requestCount: requestIds.length,
      approvedCount,
      deniedCount,
      pendingCount: requestIds.length - approvedCount - deniedCount,
    };
  }

  throw new Error(`Approval ${targetApprovalId} was not found in recent thread messages`);
}
