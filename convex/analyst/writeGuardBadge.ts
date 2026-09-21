// Pure write-guard routing (no Convex imports): blast radius in code.
export type WriteGuardBadge = 'safe' | 'confirm' | 'block';

export function routeWriteGuardBadge(answer: {
  risk?: string;
  autoApprove?: number;
  recordCount?: number;
}): WriteGuardBadge {
  // Blast radius in code: multi-record writes are never "safe" on jev's word.
  // `safe` requires an explicit low-risk verdict: a missing risk answer (jev
  // omitted the question id) falls closed to confirm, never to safe.
  if (answer.risk === 'high-block') return 'block';
  if ((answer.recordCount ?? 1) > 10) return answer.risk === 'low' ? 'confirm' : 'block';
  if (answer.risk === 'needs-confirmation' || (answer.autoApprove ?? 0) < 0.75) return 'confirm';
  return answer.risk === 'low' ? 'safe' : 'confirm';
}

// Allowlisted risk per write tool: money-moving and structural writes are
// never "low". Unknown tools fall closed to needs-confirmation.
export function riskForTool(toolName: string): string {
  switch (toolName) {
    case 'rememberFact':
      return 'low';
    case 'setPlanAssigned':
    case 'setPlanTarget':
    case 'createMoneyBox':
    case 'createPlannedExpense':
    case 'bulkRecategorize':
      return 'needs-confirmation';
    default:
      return 'needs-confirmation';
  }
}

// Record counts per write tool for the blast-radius rule: multi-record writes
// are never "safe". Inputs are advisory (the agent proposes them), so counts
// are clamped to the tool's schema maxima.
export function recordCountForApproval(toolName: string, input: unknown): number {
  if (toolName === 'bulkRecategorize' && typeof input === 'object' && input !== null && 'changes' in input) {
    const changes = (input as { changes?: unknown }).changes;
    return Array.isArray(changes) ? Math.min(changes.length, 50) : 1;
  }
  return 1;
}
